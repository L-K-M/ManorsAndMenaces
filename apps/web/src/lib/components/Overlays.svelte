<script lang="ts">
  // Victory screen and the entity inspector. The privacy curtain lives in
  // PrivacyCurtain.svelte, outside the game root that it makes inert.
  import { t } from "../i18n.js";
  import ToolIcon from "./ToolIcon.svelte";
  import { describePick } from "../game/inspect.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import VictoryScreen from "./VictoryScreen.svelte";
  import LandmarkArt from "./board/LandmarkArt.svelte";
  import MenaceFigure from "./board/MenaceFigure.svelte";
  import { settings } from "../stores/settings.svelte.js";

  let { session, tutorial = false, onexit, onrematch }: { session: GameSession; tutorial?: boolean; onexit: () => void; onrematch: () => void } = $props();
  const gs = $derived(session.authoritative);

  const inspectText = $derived(ui.inspect ? describePick(session.map, session.draft, ui.inspect) : null);
  const landmark = $derived.by(() => {
    const pick = ui.inspect;
    return pick?.kind === "site" ? session.map.sites.find((site) => site.id === pick.id)?.landmarkId : undefined;
  });
  const menace = $derived(ui.inspect?.kind === "menace" ? session.draft.menaces[ui.inspect.id] : undefined);
</script>

{#if gs.status === "finished"}
  <VictoryScreen {session} {tutorial} {onexit} {onrematch} />
{/if}

{#if inspectText}
  <aside class="inspect" aria-live="polite">
    <header>
      {#if landmark}
        <svg class="inspect-art" viewBox="-46 -42 50 50" aria-hidden="true"><LandmarkArt id={landmark} /></svg>
      {:else if menace}
        <svg class="inspect-art" viewBox="-30 -36 60 60" aria-hidden="true"><MenaceFigure type={menace.type} animate={false} highContrast={settings.highContrast} /></svg>
      {/if}
      <strong>{inspectText.title}</strong>
      <button class="close" aria-label={t("ui.close")} onclick={() => (ui.inspect = null)}><ToolIcon name="close" size={20} /></button>
    </header>
    {#each inspectText.lines as line}<p>{line}</p>{/each}
  </aside>
{/if}

<style>
  .inspect {
    position: absolute;
    left: 0.75rem;
    top: 0.75rem;
    width: min(22rem, calc(100% - 1.5rem));
    max-height: calc(100% - 1.5rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--paper-sheet);
    border: 2px solid var(--edge);
    border-radius: 12px;
    padding: 0.5rem 0.7rem;
    box-shadow: inset 0 0 0 3px #fff9e8, 0 6px 20px #0003;
    z-index: 5;
    font-size: 0.88rem;
  }
  .inspect header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .inspect strong {
    flex: 1;
    font: 700 1.25rem/1.1 var(--font-display);
    overflow-wrap: anywhere;
  }
  .inspect-art {
    width: 6rem;
    height: 6rem;
    flex: none;
    pointer-events: none;
  }
  .inspect p {
    margin: 0.2rem 0;
  }
  .close {
    flex: none;
    align-self: start;
    min-height: 44px;
    min-width: 44px;
    padding: 0;
  }
  @media (max-height: 500px) {
    .inspect-art { width: 4rem; height: 4rem; }
  }
</style>
