import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Docker Compose hands the container only the variables its `environment:`
// block names; .env merely fills them in. A setting .env.example offers but
// the block leaves out would be silently ignored on a Compose deployment.

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

/** Settings of Compose itself rather than of the server: the published port and the image. */
const COMPOSE_ONLY = new Set(["PORT", "IMAGE"]);

describe("the Docker Compose deployment", () => {
  it("passes every server setting .env.example offers on to the container", () => {
    const offered = [...read(".env.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] as string).filter((name) => !COMPOSE_ONLY.has(name));
    const passed = new Set([...read("docker-compose.yml").matchAll(/^\s+([A-Z][A-Z0-9_]*): \$\{\1:-/gm)].map((m) => m[1]));
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((name) => !passed.has(name))).toEqual([]);
  });
});
