<script lang="ts">
  import { t } from "../i18n.js";
  import { play } from "../audio/sfx.js";
  import { saveSettings, settings } from "../stores/settings.svelte.js";
  import Modal from "./Modal.svelte";

  let { onclose }: { onclose: () => void } = $props();

  $effect(() => {
    // Persist and apply whenever a setting changes.
    JSON.stringify(settings);
    saveSettings();
    document.documentElement.style.setProperty("--text-scale", String(settings.textScale));
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
  });
</script>

<Modal title={t("ui.settings")} {onclose}>
  <form class="settings" onsubmit={(e) => e.preventDefault()}>
    <label>
      {t("ui.animation_speed")}
      <select bind:value={settings.animationSpeed}>
        <option value="normal">{t("ui.normal")}</option>
        <option value="fast">{t("ui.fast")}</option>
        <option value="off">{t("ui.off")}</option>
      </select>
    </label>
    <label><input type="checkbox" bind:checked={settings.reducedMotion} /> {t("ui.reduced_motion")}</label>
    <label><input type="checkbox" bind:checked={settings.highContrast} /> {t("ui.high_contrast")}</label>
    <label>
      {t("ui.text_size")}
      <input type="range" min="0.85" max="1.5" step="0.05" bind:value={settings.textScale} />
      <span>{Math.round(settings.textScale * 100)}%</span>
    </label>
    <label><input type="checkbox" bind:checked={settings.sound} /> {t("ui.sound_effects")}</label>
    <label class="volume">
      {t("ui.effects_volume")}
      <input type="range" min="0" max="1" step="0.05" bind:value={settings.soundVolume} disabled={!settings.sound} />
      <span>{Math.round(settings.soundVolume * 100)}%</span>
    </label>
    <button type="button" class="audio-preview" disabled={!settings.sound || settings.soundVolume === 0} onclick={() => play("manor")}>{t("ui.test_sound")}</button>
    <label><input type="checkbox" bind:checked={settings.music} /> {t("ui.music")}</label>
    <label class="volume">
      {t("ui.music_volume")}
      <input type="range" min="0" max="1" step="0.05" bind:value={settings.musicVolume} disabled={!settings.music} />
      <span>{Math.round(settings.musicVolume * 100)}%</span>
    </label>
    <details class="audio-credits">
      <summary>{t("ui.audio_credits")}</summary>
      <p>{t("ui.audio_credits_description")}</p>
      <ul>
        <li>{t("audio.kenney")} <a href="https://kenney.nl/assets/rpg-audio" target="_blank" rel="noreferrer">{t("audio.rpg")}</a>, <a href="https://kenney.nl/assets/impact-sounds" target="_blank" rel="noreferrer">{t("audio.impact")}</a>, <a href="https://kenney.nl/assets/interface-sounds" target="_blank" rel="noreferrer">{t("audio.interface")}</a>, <a href="https://kenney.nl/assets/music-jingles" target="_blank" rel="noreferrer">{t("audio.jingles")}</a>.</li>
        <li>{t("audio.randommind")} <a href="https://opengameart.org/content/medieval-the-old-tower-inn" target="_blank" rel="noreferrer">{t("audio.old_tower")}</a>.</li>
      </ul>
      <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0 1.0</a>
    </details>
    <label><input type="checkbox" bind:checked={settings.privacyCurtain} /> {t("ui.privacy_curtain_between_hot_seat")}</label>
    <label><input type="checkbox" bind:checked={settings.showRegionNames} /> {t("ui.show_region_names_on_the")}</label>
    <label><input type="checkbox" bind:checked={settings.rivalChatter} /> {t("ui.rival_banter")}</label>
  </form>
</Modal>

<style>
  .settings {
    display: grid;
    gap: 0.7rem;
  }
  label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 44px;
  }
  input[type="checkbox"] {
    width: 1.3rem;
    height: 1.3rem;
  }
  .volume { display: grid; grid-template-columns: minmax(0, 1fr) minmax(80px, 1.2fr) 4ch; }
  .volume input { width: 100%; min-width: 0; }
  .volume span { text-align: right; font-variant-numeric: tabular-nums; }
  .audio-preview { justify-self: start; }
  .audio-credits { font-size: 0.9rem; line-height: 1.5; }
  .audio-credits summary { cursor: pointer; }
  .audio-credits p { margin-block: 0.5rem; }
  .audio-credits ul { padding-left: 1.25rem; }
</style>
