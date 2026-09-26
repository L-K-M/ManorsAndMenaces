import { CUES, MUSIC_URL, cueUrl, type Cue } from "./cues.js";

export interface AudioPreferences {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const level = (value: number, fallback: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

/** Local sample playback, independent of match state and its deterministic RNG. */
export class Soundscape {
  private context: AudioContext | null = null;
  private effectsBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Set<Voice>();
  private preferences: AudioPreferences = { sound: true, music: false, soundVolume: 0.65, musicVolume: 0.35 };
  private unlocked = false;
  private visible = true;
  private disposed = false;
  private effectRequest = 0;
  private musicRequest = 0;
  private musicVoice: Voice | null = null;
  private musicOffset = 0;
  private musicStartedAt = 0;
  private lastPlayedAt = -Infinity;

  constructor(
    private readonly createContext: () => AudioContext,
    private readonly fetchAudio: typeof fetch = (input, init) => fetch(input, init),
    private readonly now: () => number = () => performance.now(),
  ) {}

  setPreferences(next: AudioPreferences): void {
    this.preferences = { ...next, soundVolume: level(next.soundVolume, 0.65), musicVolume: level(next.musicVolume, 0.35) };
    const a = this.context;
    if (a) {
      this.effectsBus?.gain.setTargetAtTime(this.preferences.sound ? this.preferences.soundVolume : 0, a.currentTime, 0.025);
      this.musicBus?.gain.setTargetAtTime(this.preferences.musicVolume, a.currentTime, 0.1);
    }
    if (!next.sound || this.preferences.soundVolume === 0) this.stopEffects();
    if (!next.music || this.preferences.musicVolume === 0) this.stopMusic();
    if (this.unlocked) void this.startAudio();
  }

  /** Call from a pointer or keyboard gesture, never from an AI turn. */
  unlock(): void {
    this.unlocked = true;
    void this.startAudio();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      if (this.unlocked) void this.startAudio();
      return;
    }
    this.stopEffects();
    this.stopMusic();
    void this.context?.suspend().catch(() => {});
  }

  private async ready(): Promise<AudioContext | null> {
    if (this.disposed || !this.visible || !this.unlocked) return null;
    try {
      if (!this.context) {
        const a = this.createContext();
        this.context = a;
        this.effectsBus = a.createGain();
        this.effectsBus.gain.value = this.preferences.soundVolume;
        this.effectsBus.connect(a.destination);
        this.musicBus = a.createGain();
        this.musicBus.gain.value = this.preferences.musicVolume;
        this.musicBus.connect(a.destination);
      }
      if (this.context.state !== "running" && this.context.state !== "closed") await this.context.resume();
      return !this.disposed && this.visible && this.context.state === "running" ? this.context : null;
    } catch {
      // Unsupported audio and autoplay rejection must never prevent a move.
      return null;
    }
  }

  private async startAudio(): Promise<void> {
    if (!this.preferences.sound && !this.preferences.music) return;
    const a = await this.ready();
    if (!a) return;
    if (this.preferences.sound && this.preferences.soundVolume > 0) {
      for (const cue of Object.keys(CUES) as Cue[]) void this.load(cueUrl(cue), a);
    }
    void this.startMusic(a);
  }

  private load(url: string, a: AudioContext): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(url);
    if (!pending) {
      pending = this.fetchAudio(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => a.decodeAudioData(data))
        .catch(() => null);
      // Also remember failures: missing files must not cause a request storm.
      this.buffers.set(url, pending);
    }
    return pending;
  }

  async play(cue: Cue): Promise<void> {
    if (!this.preferences.sound || this.preferences.soundVolume === 0 || !this.visible || !this.unlocked) return;
    const request = ++this.effectRequest;
    const requestedAt = this.now();
    const a = await this.ready();
    if (!a) return;
    const buffer = await this.load(cueUrl(cue), a);
    // Never replay stale feedback after a slow load, mute, or backgrounding.
    if (!buffer || this.disposed || request !== this.effectRequest || !this.visible || !this.preferences.sound || this.preferences.soundVolume === 0 || this.now() - requestedAt > 800) return;
    if (this.now() - this.lastPlayedAt < 90 && cue !== "win") return;
    this.lastPlayedAt = this.now();
    while (this.voices.size >= 3) this.stopVoice(this.voices.values().next().value!);
    const voice = this.voice(buffer, this.effectsBus!, CUES[cue]);
    this.voices.add(voice);
    voice.source.onended = () => {
      voice.source.disconnect();
      voice.gain.disconnect();
      this.voices.delete(voice);
    };
    voice.source.start();
  }

  private voice(buffer: AudioBuffer, bus: GainNode, gain: number): Voice {
    const source = this.context!.createBufferSource();
    source.buffer = buffer;
    const volume = this.context!.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(bus);
    return { source, gain: volume };
  }

  private async startMusic(a: AudioContext): Promise<void> {
    if (!this.preferences.music || this.preferences.musicVolume === 0 || this.musicVoice) return;
    const request = ++this.musicRequest;
    const buffer = await this.load(MUSIC_URL, a);
    if (!buffer || this.disposed || request !== this.musicRequest || !this.visible || !this.preferences.music || this.preferences.musicVolume === 0) return;
    const voice = this.voice(buffer, this.musicBus!, 0);
    voice.source.loop = true;
    voice.gain.gain.linearRampToValueAtTime(1, a.currentTime + 0.6);
    this.musicVoice = voice;
    this.musicOffset %= buffer.duration;
    this.musicStartedAt = a.currentTime;
    voice.source.start(0, this.musicOffset);
  }

  private stopVoice(voice: Voice): void {
    voice.source.stop();
    voice.source.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  private stopEffects(): void {
    this.effectRequest++;
    for (const voice of this.voices) this.stopVoice(voice);
  }

  private stopMusic(): void {
    this.musicRequest++;
    if (!this.musicVoice) return;
    this.musicOffset += (this.context?.currentTime ?? this.musicStartedAt) - this.musicStartedAt;
    this.stopVoice(this.musicVoice);
    this.musicVoice = null;
  }

  dispose(): void {
    this.disposed = true;
    this.stopEffects();
    this.stopMusic();
    this.buffers.clear();
    void this.context?.close().catch(() => {});
  }
}
