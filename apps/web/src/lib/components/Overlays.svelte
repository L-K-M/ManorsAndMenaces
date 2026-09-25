<script lang="ts">
  // Victory screen and the entity inspector. The privacy curtain lives in
  // PrivacyCurtain.svelte, outside the game root that it makes inert.
  import { getPlayerHoldings, getRenown } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { describePick } from "../game/inspect.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import Modal from "./Modal.svelte";

  let { session, onexit, onrematch }: { session: GameSession; onexit: () => void; onrematch: () => void } = $props();
  const gs = $derived(session.authoritative);
  const standings = $derived(
    [...gs.turnOrder].sort((a, b) => getRenown(session.ctx, gs, b) - getRenown(session.ctx, gs, a)),
  );

  const inspectText = $derived(ui.inspect ? describePick(session.map, session.draft, ui.inspect) : null);
</script>

{#if gs.status === "finished"}
  <Modal title={t("ui.victory")}>
    <p class="winner">
      <b>{gs.players[gs.winnerId ?? ""]?.displayName}</b> wins with {getRenown(session.ctx, gs, gs.winnerId ?? "")} Renown in round {gs.round}.
    </p>
    <ol class="standings">
      {#each standings as pid}
        <li>
          {gs.players[pid]?.displayName} — {getRenown(session.ctx, gs, pid)} Renown,
          {getPlayerHoldings(gs, pid).length} Holdings, {gs.players[pid]?.claimedQuestIds.length} Quests
        </li>
      {/each}
    </ol>
    <div class="row">
      <button class="primary" onclick={onrematch}>{t("ui.play_again")}</button>
      <button onclick={onexit}>{t("ui.main_menu")}</button>
    </div>
  </Modal>
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
  .winner {
    font-size: 1.1rem;
  }
  .standings {
    padding-left: 1.2rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
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
