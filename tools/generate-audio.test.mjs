// Run with `node --test tools/generate-audio.test.mjs` (requires FFmpeg).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("normalization preserves dynamics when a layered mix exceeds full scale", () => {
  const root = mkdtempSync(join(tmpdir(), "audio-regression-"));
  try {
    const sources = join(root, "media-sources/audio");
    mkdirSync(sources, { recursive: true });
    mkdirSync(join(root, "tools"));
    copyFileSync(new URL("./generate-audio.mjs", import.meta.url), join(root, "tools/generate-audio.mjs"));
    const tone = join(sources, "tone.wav");
    // A quiet section followed by the same wave at four times its amplitude.
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "aevalsrc=if(lt(t\\,0.2)\\,0.2\\,0.8)*sin(2*PI*1000*t):d=0.4:s=44100", "-c:a", "pcm_f32le", tone]);
    const source = { file: "tone.wav", sha256: createHash("sha256").update(readFileSync(tone)).digest("hex") };
    writeFileSync(join(sources, "sources.json"), JSON.stringify({ sources: { tone: source, music: source } }));
    writeFileSync(join(sources, "recipes.json"), JSON.stringify({ layered: [{ source: "tone" }, { source: "tone" }] }));
    execFileSync(process.execPath, [join(root, "tools/generate-audio.mjs")]);
    const samples = execFileSync("ffmpeg", ["-v", "error", "-i", join(root, "apps/web/public/audio/layered.wav"), "-f", "f32le", "pipe:1"]);
    const rms = (from, to) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += samples.readFloatLE(i * 4) ** 2;
      return Math.sqrt(sum / (to - from));
    };
    const ratio = rms(4410, 6615) / rms(13230, 15435);
    assert.ok(Math.abs(ratio - 0.25) < 0.002, `Dynamics changed by clipping: ${ratio}`);
    let peak = 0;
    for (let i = 0; i < samples.length; i += 4) peak = Math.max(peak, Math.abs(samples.readFloatLE(i)));
    assert.ok(Math.abs(peak - 10 ** (-6 / 20)) < 0.002, `Unexpected normalized peak: ${peak}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
