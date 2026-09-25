import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// scripts/build.sh checks the toolchain before the slow steps and works
// around the setups contributors actually hit. Each test runs a copy of the
// script with a PATH that holds only basic system tools plus fakes for node,
// pnpm, the Rust tools and uname, so no real build ever starts.

const root = fileURLToPath(new URL("../..", import.meta.url));
const ANDROID_TARGETS = ["aarch64-linux-android", "armv7-linux-androideabi", "i686-linux-android", "x86_64-linux-android"];
const HOST_TARGET = "aarch64-apple-darwin";
const SYSTEM_TOOLS = ["bash", "sh", "sed", "sort", "head", "tail", "dirname", "basename", "readlink", "mkdir", "mktemp", "find", "cp", "rm", "mv", "ls", "cat", "awk", "tr", "sleep"];

function resolveTool(name: string): string {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
  if (!found) throw new Error(`the build script tests need ${name} on PATH`);
  return found;
}

function writeScript(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

describe.skipIf(process.platform === "win32")("scripts/build.sh", () => {
  let dir: string;
  let repo: string;
  let bin: string;
  let pnpmLog: string;

  // A fake rustc (with cargo beside it) whose standard library covers `targets`.
  function rustToolchain(name: string, targets: string[]): string {
    const sysroot = join(dir, `sysroot-${name}`);
    for (const target of [HOST_TARGET, ...targets]) {
      mkdirSync(join(sysroot, "lib", "rustlib", target, "lib"), { recursive: true });
      writeFileSync(join(sysroot, "lib", "rustlib", target, "lib", "libstd-fake.rlib"), "");
    }
    const toolchainBin = join(dir, `toolchain-${name}`);
    mkdirSync(toolchainBin, { recursive: true });
    writeScript(
      join(toolchainBin, "rustc"),
      `if [ "$1" = --print ] && [ "$2" = target-libdir ]; then echo "${sysroot}/lib/rustlib/$4/lib"; exit 0; fi\necho "rustc 1.99.0 (${name})"`,
    );
    writeScript(join(toolchainBin, "cargo"), `echo "cargo 1.99.0 (${name})"`);
    return toolchainBin;
  }

  // Puts a toolchain's rustc and cargo on PATH, the way Homebrew's rust does.
  function onPath(toolchainBin: string): void {
    for (const tool of ["rustc", "cargo"]) symlinkSync(join(toolchainBin, tool), join(bin, tool));
  }

  function fakeRustup(toolchainBin: string): void {
    writeScript(join(bin, "rustup"), `if [ "$1" = which ] && [ "$2" = rustc ]; then echo "${toolchainBin}/rustc"; exit 0; fi\nexit 1`);
  }

  // What `pnpm tauri build` does: `body` runs in the repo root.
  function fakeTauriBuild(body: string): void {
    writeScript(join(dir, "tauri-build.sh"), body);
  }

  function run(args: string[], extraEnv: Record<string, string> = {}): { status: number | null; output: string } {
    const result = spawnSync(join(bin, "bash"), [join(repo, "scripts", "build.sh"), ...args], {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...extraEnv,
        PATH: bin,
        HOME: join(dir, "home"),
        ANDROID_HOME: join(dir, "sdk"),
        NDK_HOME: join(dir, "sdk", "ndk", "29.0.0"),
        JAVA_HOME: join(dir, "jdk"),
      },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  }

  function fakeNodeVersion(version: string): void {
    rmSync(join(bin, "node"));
    writeScript(join(bin, "node"), `if [ "$1" = -p ] && [ "$2" = process.versions.node ]; then echo ${version}; exit 0; fi\nexec "${process.execPath}" "$@"`);
  }

  function pnpmCalls(): string[] {
    return existsSync(pnpmLog) ? readFileSync(pnpmLog, "utf8").trim().split("\n") : [];
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mm-build-sh-"));
    repo = join(dir, "repo");
    bin = join(dir, "bin");
    pnpmLog = join(dir, "pnpm.log");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    mkdirSync(bin);
    mkdirSync(join(dir, "home"));
    mkdirSync(join(dir, "sdk", "ndk", "29.0.0"), { recursive: true });
    mkdirSync(join(dir, "jdk", "bin"), { recursive: true });
    copyFileSync(join(root, "scripts", "build.sh"), join(repo, "scripts", "build.sh"));
    writeFileSync(join(repo, "package.json"), JSON.stringify({ version: "0.0.0", engines: { node: ">=22.14" } }));

    for (const tool of SYSTEM_TOOLS) symlinkSync(resolveTool(tool), join(bin, tool));
    symlinkSync(process.execPath, join(bin, "node"));
    writeScript(join(bin, "uname"), "echo Darwin");
    writeScript(join(bin, "open"), "exit 0");
    writeScript(join(dir, "jdk", "bin", "java"), `echo 'openjdk version "17.0.2"' >&2`);
    writeScript(
      join(bin, "pnpm"),
      [
        `echo "$* | PATH=$PATH | CI=\${CI:-} | PROMPT=\${COREPACK_ENABLE_DOWNLOAD_PROMPT:-}" >> "${pnpmLog}"`,
        `if [ "$1 $2" = "tauri build" ] && [ -f "${dir}/tauri-build.sh" ]; then exec sh "${dir}/tauri-build.sh"; fi`,
        "exit 0",
      ].join("\n"),
    );
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe("Node and pnpm", () => {
    it("stops before installing when Node is older than package.json allows", () => {
      fakeNodeVersion("20.18.0");

      const { status, output } = run(["web"]);

      expect(output).toMatch(/Node 20\.18\.0 is older than the 22\.14/);
      expect(pnpmCalls()).toEqual([]);
      expect(status).toBe(1);
    });

    it("holds Node to the patch level package.json names", () => {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ version: "0.0.0", engines: { node: ">=22.14.3" } }));
      fakeNodeVersion("22.14.0");
      expect(run(["web"]).status).toBe(1);

      fakeNodeVersion("22.14.3");
      expect(run(["web"]).status).toBe(0);
    });

    it("explains how to get pnpm when Node ships without corepack", () => {
      rmSync(join(bin, "pnpm"));

      const { status, output } = run(["web"]);

      expect(output).toContain("npm install -g corepack");
      expect(status).toBe(1);
    });

    it("keeps corepack from stopping to ask before it downloads pnpm", () => {
      expect(run(["web"]).status).toBe(0);
      expect(pnpmCalls().every((call) => call.endsWith("PROMPT=0"))).toBe(true);
    });
  });

  describe("Android and the Rust targets", () => {
    it("builds with rustup's toolchain when the rustc on PATH has no Android targets", () => {
      onPath(rustToolchain("homebrew", []));
      const rustup = rustToolchain("rustup", ANDROID_TARGETS);
      fakeRustup(rustup);

      const { status, output } = run(["android"]);

      const androidBuild = pnpmCalls().find((call) => call.startsWith("tauri android build"));
      expect(androidBuild).toContain(`PATH=${rustup}:`);
      expect(output).toContain(rustup);
      expect(status).toBe(0);
    });

    it("builds with the rustc on PATH when it has the Android targets", () => {
      onPath(rustToolchain("rustup", ANDROID_TARGETS));

      expect(run(["android"]).status).toBe(0);
      expect(pnpmCalls().find((call) => call.startsWith("tauri android build"))).toContain(`PATH=${bin}`);
    });

    it("names the missing targets before starting cargo", () => {
      onPath(rustToolchain("homebrew", []));
      fakeRustup(rustToolchain("rustup", ["aarch64-linux-android"]));

      const { status, output } = run(["android"]);

      expect(output).toContain("rustup target add armv7-linux-androideabi i686-linux-android x86_64-linux-android");
      expect(pnpmCalls().some((call) => call.startsWith("tauri android"))).toBe(false);
      expect(status).toBe(1);
    });

    it("points to rustup when the only Rust has no Android targets", () => {
      onPath(rustToolchain("homebrew", []));

      const { status, output } = run(["android"]);

      expect(output).toContain("https://rustup.rs");
      expect(pnpmCalls().some((call) => call.startsWith("tauri android"))).toBe(false);
      expect(status).toBe(1);
    });

    it("reports in --check which Rust the Android build will use", () => {
      onPath(rustToolchain("homebrew", []));
      const rustup = rustToolchain("rustup", ANDROID_TARGETS);
      fakeRustup(rustup);

      const { status, output } = run(["--check", "android"]);

      expect(output).toMatch(new RegExp(`rust std: .*${rustup}`));
      expect(status).toBe(0);
    });
  });

  describe("macOS desktop bundles", () => {
    const APP = "src-tauri/target/release/bundle/macos/Test.app/Contents";
    const DMG = "src-tauri/target/release/bundle/dmg";

    beforeEach(() => onPath(rustToolchain("rustup", [])));

    it("retries without the Finder window layout when only the DMG step fails", () => {
      // Tauri skips the Finder AppleScript when CI=true. The pause stands in
      // for the compile: file times are coarse (a few ms), so an .app written
      // at once could carry the same time as the script's start marker.
      fakeTauriBuild(`sleep 0.05\nmkdir -p "${APP}" && : > "${APP}/Info.plist"\n[ "$CI" = true ] || exit 1\nmkdir -p "${DMG}" && : > "${DMG}/Test.dmg"`);

      const { status, output } = run(["desktop"]);

      const builds = pnpmCalls().filter((call) => call.startsWith("tauri build"));
      expect(builds).toHaveLength(2);
      expect(builds[1]).toContain("CI=true");
      expect(existsSync(join(repo, "dist", "desktop", "Test.dmg"))).toBe(true);
      expect(output).toContain("Automation");
      expect(status).toBe(0);
    });

    it("does not retry when CI=true already skipped the Finder layout", () => {
      fakeTauriBuild(`mkdir -p "${APP}" && : > "${APP}/Info.plist"\nexit 1`);

      const { status } = run(["desktop"], { CI: "true" });

      expect(pnpmCalls().filter((call) => call.startsWith("tauri build"))).toHaveLength(1);
      expect(status).toBe(1);
    });

    it("does not retry a build that failed before the .app was bundled", () => {
      fakeTauriBuild("exit 1");

      const { status } = run(["desktop"]);

      expect(pnpmCalls().filter((call) => call.startsWith("tauri build"))).toHaveLength(1);
      expect(status).toBe(1);
    });
  });
});
