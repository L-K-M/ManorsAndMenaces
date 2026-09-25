<script lang="ts">
  import { fly } from "svelte/transition";
  import { t } from "../i18n.js";
  import { appUpdate, applyUpdate, dismissUpdate } from "../pwa.svelte.js";
  import { settings } from "../stores/settings.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";
</script>

<!-- The live region exists from the start so screen readers announce the
     notice when it appears; only its content comes and goes. -->
<div role="status">
  {#if appUpdate.ready}
    <div class="update" transition:fly={{ y: -24, duration: settings.reducedMotion ? 0 : 220 }}>
      <span class="seal" aria-hidden="true"><ToolIcon name="sparkle" size={18} /></span>
      <p>{t("app.update_ready")}</p>
      <div class="buttons">
        <button class="ghost" onclick={dismissUpdate}>{t("app.update_later")}</button>
        <button class="primary" onclick={applyUpdate}>{t("app.update_reload")}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .update {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
    left: 50%;
    translate: -50% 0;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: max-content;
    max-width: calc(100vw - 1.5rem);
    padding: 0.45rem 0.5rem 0.45rem 0.8rem;
    border: 2px solid var(--wood);
    border-radius: 12px;
    background: var(--paper);
    box-shadow: 0 6px 18px #2b211540;
  }
  .seal {
    display: grid;
    place-items: center;
    flex: none;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 0.95rem;
  }
  p {
    margin: 0;
    font: 600 1rem var(--font-display);
  }
  .buttons {
    display: flex;
    gap: 0.3rem;
    flex: none;
  }
  @media (max-width: 30rem) {
    /* Clear of the game's top bar, which holds the menu, Save and settings. */
    .update {
      top: auto;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    p {
      flex: 1;
    }
  }
</style>
