import { expect, test, type Page } from "@playwright/test";
import { CUES, MUSIC_URL, cueUrl } from "../src/lib/audio/cues.js";

type PlayedSound = { loop: boolean; stopped: boolean; duration: number; peak: number };
const played = (page: Page) => page.evaluate(() => (window as unknown as { audioPlayed: PlayedSound[] }).audioPlayed);

async function observeAudio(page: Page, music = false) {
  await page.addInitScript((enabled) => {
    if (!localStorage.getItem("mm.settings.v1")) localStorage.setItem("mm.settings.v1", JSON.stringify({ sound: true, music: enabled }));
    const records: PlayedSound[] = [];
    (window as unknown as { audioPlayed: PlayedSound[] }).audioPlayed = records;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      override createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        const stop = source.stop.bind(source);
        let record: PlayedSound | null = null;
        source.start = (when = 0, offset = 0, duration?: number) => {
          let peak = 0;
          for (const value of source.buffer?.getChannelData(0) ?? []) peak = Math.max(peak, Math.abs(value));
          record = { loop: source.loop, stopped: false, duration: source.buffer?.duration ?? 0, peak };
          records.push(record);
          if (duration === undefined) start(when, offset);
          else start(when, offset, duration);
        };
        source.stop = (when = 0) => { if (record) record.stopped = true; stop(when); };
        return source;
      }
    };
  }, music);
}

test("recorded effects decode, play and retain volume preferences @mobile", async ({ page }) => {
  await observeAudio(page);
  const requested: string[] = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/audio/")) requested.push(r.url()); });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  expect(requested).toHaveLength(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Test sound", exact: true }).click();
  await expect.poll(async () => (await played(page)).length).toBe(1);
  expect((await played(page))[0]!.peak).toBeGreaterThan(0.1);
  expect((await played(page))[0]!.duration).toBeGreaterThan(0.3);
  const effects = page.getByRole("slider", { name: /^Effects volume/ });
  await effects.focus();
  await effects.press("Home");
  await effects.press("ArrowRight");
  await expect(effects).toHaveValue("0.05");
  await page.getByRole("checkbox", { name: "Sound effects", exact: true }).uncheck();
  await expect(effects).toBeDisabled();
  await expect(page.getByRole("button", { name: "Test sound" })).toBeDisabled();
  await page.getByText("Sound credits", { exact: true }).click();
  await expect(page.getByRole("link", { name: "The Old Tower Inn", exact: true })).toBeVisible();
  expect(await page.locator(".settings").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(effects).toHaveValue("0.05");
  await expect(page.getByRole("checkbox", { name: "Sound effects", exact: true })).not.toBeChecked();
});

test("saved music starts after a gesture and stops immediately when disabled @mobile", async ({ page }) => {
  await observeAudio(page, true);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  expect(await played(page)).toEqual([]);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect.poll(async () => (await played(page)).filter((s) => s.loop).length).toBe(1);
  const volume = page.getByRole("slider", { name: /^Music volume/ });
  await volume.focus();
  await volume.press("ArrowLeft");
  await expect(volume).toHaveValue("0.3");
  expect((await played(page)).filter((s) => s.loop)).toHaveLength(1);
  await page.getByRole("checkbox", { name: "Music", exact: true }).uncheck();
  await expect.poll(async () => (await played(page))[0]!.stopped).toBe(true);
  await expect(volume).toBeDisabled();
});

test("every bundled cue and the music loop decode to a non-silent signal", async ({ page }) => {
  await page.goto("/");
  const files = [...(Object.keys(CUES) as (keyof typeof CUES)[]).map(cueUrl), MUSIC_URL];
  const signals = await page.evaluate(async (urls) => {
    const context = new AudioContext();
    try {
      return await Promise.all(urls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        let peak = 0;
        let sum = 0;
        for (const value of buffer.getChannelData(0)) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
        return { url, duration: buffer.duration, peak, rms: Math.sqrt(sum / buffer.length) };
      }));
    } finally { await context.close(); }
  }, files);
  for (const signal of signals) {
    expect(signal.peak, signal.url).toBeGreaterThan(0.1);
    expect(signal.peak, signal.url).toBeLessThan(0.8);
    expect(signal.rms, signal.url).toBeGreaterThan(0.005);
    expect(signal.duration, signal.url).toBeGreaterThan(0.1);
    expect(signal.duration, signal.url).toBeLessThan(signal.url === MUSIC_URL ? 51 : 3);
  }
});

test("audio download failures leave the game usable", async ({ page }) => {
  await observeAudio(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/audio/*.{wav,mp3}", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Test sound", exact: true }).click();
  await page.getByRole("checkbox", { name: "Music", exact: true }).check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await expect(page.locator(".board")).toBeVisible();
  expect(errors).toEqual([]);
});
