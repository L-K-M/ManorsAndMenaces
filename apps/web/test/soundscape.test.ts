import { describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@manors-menaces/rules";
import { CUES, MUSIC_URL, cueForEvents } from "../src/lib/audio/cues.js";
import { Soundscape, type AudioPreferences } from "../src/lib/audio/soundscape.js";

const preferences: AudioPreferences = { sound: true, music: false, soundVolume: 0.65, musicVolume: 0.35 };
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

function fixture(fetcher = vi.fn(async (_url: RequestInfo | URL) => new Response(new ArrayBuffer(8)))) {
  const sources: { loop: boolean; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }[] = [];
  let time = 1000;
  const context = {
    state: "running", currentTime: 0, destination: {},
    resume: vi.fn(async () => { context.state = "running"; }),
    suspend: vi.fn(async () => { context.state = "suspended"; }),
    close: vi.fn(async () => { context.state = "closed"; }),
    decodeAudioData: vi.fn(async () => ({ duration: 50 })),
    createGain: () => {
      const gain = { gain: { value: 1, setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    createBufferSource: () => {
      const source = { loop: false, buffer: null, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null, connect: (gain: unknown) => gain };
      sources.push(source);
      return source;
    },
  };
  const create = vi.fn(() => context as unknown as AudioContext);
  const player = new Soundscape(create, fetcher as typeof fetch, () => time);
  return { player, sources, gains, create, fetcher, context, advance: (ms: number) => { time += ms; } };
}

describe("sampled soundscape", () => {
  it("waits for a gesture and never loads audio when both channels are disabled", async () => {
    const f = fixture();
    f.player.setPreferences({ ...preferences, sound: false });
    f.player.unlock();
    await f.player.play("manor");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
    f.player.setPreferences(preferences);
    await settle();
    expect(f.fetcher).toHaveBeenCalledTimes(Object.keys(CUES).length);
    expect(f.sources).toHaveLength(0);
  });

  it("caches samples, bounds overlapping voices, and stops effects when muted", async () => {
    const f = fixture();
    await f.player.play("manor");
    expect(f.create).not.toHaveBeenCalled();
    f.player.unlock();
    await settle();
    for (let i = 0; i < 4; i++) {
      await f.player.play("manor");
      f.advance(120);
    }
    expect(f.sources).toHaveLength(4);
    expect(f.sources[0]!.stop).toHaveBeenCalledOnce();
    expect(f.fetcher).toHaveBeenCalledTimes(Object.keys(CUES).length);
    f.player.setPreferences({ ...preferences, sound: false });
    expect(f.sources.every((s) => s.stop.mock.calls.length === 1)).toBe(true);
    await f.player.play("win");
    expect(f.sources).toHaveLength(4);
  });

  it("drops rapid routine cues but allows a victory cue", async () => {
    const f = fixture();
    f.player.unlock();
    await settle();
    await f.player.play("card");
    await f.player.play("resource");
    expect(f.sources).toHaveLength(1);
    await f.player.play("win");
    expect(f.sources).toHaveLength(2);
  });

  it.each(["mute", "hide", "dispose", "delay"])("discards a pending cue after %s", async (action) => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });
    const f = fixture(vi.fn(async (_url: RequestInfo | URL) => { await pending; return new Response(new ArrayBuffer(8)); }));
    f.player.unlock();
    const playing = f.player.play("manor");
    await settle();
    if (action === "mute") f.player.setPreferences({ ...preferences, sound: false });
    if (action === "hide") f.player.setVisible(false);
    if (action === "dispose") f.player.dispose();
    if (action === "delay") f.advance(801);
    resolve(new Response(new ArrayBuffer(8)));
    await playing;
    expect(f.sources).toHaveLength(0);
  });

  it("restores enabled music after a gesture, preserves position when hidden and changes volume without restarting", async () => {
    const f = fixture();
    const music = { ...preferences, music: true };
    f.player.setPreferences(music);
    expect(f.create).not.toHaveBeenCalled();
    f.player.unlock();
    await settle();
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0]!.loop).toBe(true);
    f.context.currentTime = 12;
    f.player.setPreferences({ ...music, musicVolume: 0.2 });
    await settle();
    expect(f.sources).toHaveLength(1);
    expect(f.gains[1]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 12, 0.1);
    f.player.setVisible(false);
    expect(f.sources[0]!.stop).toHaveBeenCalledOnce();
    await f.player.play("manor");
    expect(f.sources).toHaveLength(1);
    f.player.setVisible(true);
    await settle();
    expect(f.sources[1]!.start).toHaveBeenCalledWith(0, 12);
    expect(f.fetcher.mock.calls.filter(([url]) => url === MUSIC_URL)).toHaveLength(1);
    f.player.setPreferences(preferences);
    expect(f.sources[1]!.stop).toHaveBeenCalledOnce();
  });

  it("does not start a late music download after switching it off", async () => {
    let resolve!: (response: Response) => void;
    const f = fixture(vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    f.player.setPreferences({ ...preferences, sound: false, music: true });
    f.player.unlock();
    await settle();
    f.player.setPreferences({ ...preferences, sound: false, music: false });
    resolve(new Response(new ArrayBuffer(8)));
    await settle();
    expect(f.sources).toHaveLength(0);
  });

  it("tolerates unavailable or undecodable assets without repeated requests", async () => {
    const f = fixture(vi.fn(async () => new Response(null, { status: 404 })));
    f.player.unlock();
    await settle();
    await expect(f.player.play("manor")).resolves.toBeUndefined();
    await expect(f.player.play("manor")).resolves.toBeUndefined();
    expect(f.fetcher).toHaveBeenCalledTimes(Object.keys(CUES).length);
    expect(f.sources).toHaveLength(0);
    f.player.dispose();
    expect(f.context.close).toHaveBeenCalledOnce();
  });

  it("tolerates blocked autoplay and unsupported Web Audio", async () => {
    const f = fixture();
    f.context.state = "suspended";
    f.context.resume.mockRejectedValue(new Error("autoplay blocked"));
    f.player.unlock();
    await expect(f.player.play("manor")).resolves.toBeUndefined();
    expect(f.fetcher).not.toHaveBeenCalled();
    const unsupported = new Soundscape(() => { throw new Error("no AudioContext"); });
    unsupported.unlock();
    await expect(unsupported.play("win")).resolves.toBeUndefined();
  });
});

describe("event cue priority", () => {
  const events = (...types: GameEvent["type"][]) => types.map((type) => ({ type })) as GameEvent[];
  it("selects one cue for a batch and distinguishes a Stronghold upgrade", () => {
    expect(cueForEvents(events("resource_gained", "holding_built"))).toBe("manor");
    expect(cueForEvents(events("resource_gained", "holding_upgraded"))).toBe("upgrade");
    expect(cueForEvents(events("card_played", "dragon_landed"))).toBe("menace");
    expect(cueForEvents(events("quest_claimed", "game_won"))).toBe("win");
    expect(cueForEvents([])).toBeNull();
  });
});
