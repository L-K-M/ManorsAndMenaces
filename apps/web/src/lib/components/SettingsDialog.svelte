<script lang="ts">
  import { t } from "../i18n.js";
  import { setMusic } from "../audio/sfx.js";
  import { saveSettings, settings } from "../stores/settings.svelte.js";
  import Modal from "./Modal.svelte";

  let { onclose }: { onclose: () => void } = $props();

  $effect(() => {
    // Persist and apply whenever a setting changes.
    JSON.stringify(settings);
    saveSettings();
    document.documentElement.style.setProperty("--text-scale", String(settings.textScale));
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
    setMusic(settings.music);
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
    <label><input type="checkbox" bind:checked={settings.music} /> {t("ui.music")}</label>
    <label><input type="checkbox" bind:checked={settings.privacyCurtain} /> {t("ui.privacy_curtain_between_hot_seat")}</label>
    <label><input type="checkbox" bind:checked={settings.showRegionNames} /> {t("ui.show_region_names_on_the")}</label>
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
</style>
