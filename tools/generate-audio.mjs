// Regenerate the curated soundscape from the licensed, unmodified originals.
// Requires ffmpeg on PATH. No network access or runtime synthesis is involved.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = join(root, "media-sources/audio");
const outputDir = join(root, "apps/web/public/audio");
const { sources } = JSON.parse(readFileSync(join(sourceDir, "sources.json"), "utf8"));
const recipes = JSON.parse(readFileSync(join(sourceDir, "recipes.json"), "utf8"));
// Keep filter-worker overhead small for these short layered cues.
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-filter_complex_threads", "1", "-filter_threads", "1", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
for (const source of Object.values(sources)) {
  const actual = createHash("sha256").update(readFileSync(join(sourceDir, source.file))).digest("hex");
  if (actual !== source.sha256) throw new Error(`Source checksum changed: ${source.file}`);
}
mkdirSync(outputDir, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), "manors-audio-"));
try {
  for (const [cue, layers] of Object.entries(recipes)) {
    const input = layers.flatMap((layer) => ["-i", join(sourceDir, sources[layer.source].file)]);
    const filters = layers.map((layer, i) =>
      `[${i}:a]aresample=44100,aformat=channel_layouts=mono,asetrate=${Math.round(44100 * (layer.rate ?? 1))},aresample=44100,volume=${layer.gain ?? 1},adelay=${Math.round((layer.delay ?? 0) * 1000)}[s${i}]`,
    );
    filters.push(layers.map((_, i) => `[s${i}]`).join("") + `amix=inputs=${layers.length}:normalize=0,highpass=f=70,lowpass=f=9000[out]`);
    const mix = join(temp, `${cue}.wav`);
    // Preserve peaks above full scale until the mix has been attenuated.
    ffmpeg(...input, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "pcm_f32le", mix);
    // Peak-match short foley instead of loudness-normalizing near-silent tails.
    // volumedetect coerces to 16-bit samples and would clip the measurement.
    const scan = spawnSync("ffmpeg", ["-hide_banner", "-i", mix, "-af", "astats", "-f", "null", "-"], { encoding: "utf8" });
    if (scan.status !== 0) throw new Error(scan.stderr);
    const peak = Number(scan.stderr.match(/Peak level dB: ([-\d.]+)/)?.[1]);
    if (!Number.isFinite(peak)) throw new Error(`Cannot measure ${cue}`);
    ffmpeg("-i", mix, "-af", `volume=${-6 - peak}dB,afade=t=in:d=0.003`, "-map_metadata", "-1", "-c:a", "pcm_s16le", join(outputDir, `${cue}.wav`));
    console.log(`Prepared ${cue}`);
  }
  ffmpeg("-i", join(sourceDir, sources.music.file), "-af", "loudnorm=I=-18:TP=-3:LRA=11", "-ar", "44100", "-map_metadata", "-1", "-c:a", "libmp3lame", "-q:a", "4", join(outputDir, "old-tower-inn.mp3"));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
