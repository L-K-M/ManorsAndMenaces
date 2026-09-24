<script lang="ts">
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

<Modal title="Settings" {onclose}>
  <form class="settings" onsubmit={(e) => e.preventDefault()}>
    <label>
      Animation speed
      <select bind:value={settings.animationSpeed}>
        <option value="normal">Normal</option>
        <option value="fast">Fast</option>
        <option value="off">Off</option>
      </select>
    </label>
    <label><input type="checkbox" bind:checked={settings.reducedMotion} /> Reduced motion</label>
    <label><input type="checkbox" bind:checked={settings.highContrast} /> High contrast</label>
    <label>
      Text size
      <input type="range" min="0.85" max="1.5" step="0.05" bind:value={settings.textScale} />
      <span>{Math.round(settings.textScale * 100)}%</span>
    </label>
    <label><input type="checkbox" bind:checked={settings.sound} /> Sound effects</label>
    <label><input type="checkbox" bind:checked={settings.music} /> Music</label>
    <label><input type="checkbox" bind:checked={settings.privacyCurtain} /> Privacy curtain between hot-seat players</label>
    <label><input type="checkbox" bind:checked={settings.showRegionNames} /> Show Region names on the map</label>
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
