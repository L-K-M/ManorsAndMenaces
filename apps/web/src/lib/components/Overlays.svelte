<script lang="ts">
  // Victory screen and the entity inspector. The privacy curtain lives in
  // PrivacyCurtain.svelte, outside the game root that it makes inert.
  import { t } from "../i18n.js";
  import { describePick } from "../game/inspect.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import VictoryScreen from "./VictoryScreen.svelte";

  let { session, tutorial = false, onexit, onrematch }: { session: GameSession; tutorial?: boolean; onexit: () => void; onrematch: () => void } = $props();
  const gs = $derived(session.authoritative);

  const inspectText = $derived(ui.inspect ? describePick(session.map, session.draft, ui.inspect) : null);
</script>

{#if gs.status === "finished"}
  <VictoryScreen {session} {tutorial} {onexit} {onrematch} />
{/if}

{#if inspectText}
  <aside class="inspect" aria-live="polite">
    <header>
      <strong>{inspectText.title}</strong>
      <button class="close" aria-label={t("ui.close")} onclick={() => (ui.inspect = null)}>✕</button>
    </header>
    {#each inspectText.lines as line}<p>{line}</p>{/each}
  </aside>
{/if}

<style>
  .inspect {
    position: absolute;
    left: 0.75rem;
    top: 0.75rem;
    max-width: 19rem;
    background: var(--paper);
    border: 2px solid #8a7650;
    border-radius: 10px;
    padding: 0.5rem 0.7rem;
    box-shadow: 0 6px 20px #0003;
    z-index: 5;
    font-size: 0.88rem;
  }
  .inspect header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .inspect p {
    margin: 0.2rem 0;
  }
  .close {
    min-height: 32px;
    min-width: 32px;
    padding: 0;
  }
</style>
