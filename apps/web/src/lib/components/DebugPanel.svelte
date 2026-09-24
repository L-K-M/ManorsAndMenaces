<script lang="ts">
  // Development-only debug tools (spec §100).
  import { CARDS } from "@manors-menaces/content";
  import { RESOURCE_TYPES, hashState, getLegalMenaceDestinations } from "@manors-menaces/rules";
  import type { GameSession } from "../game/session.svelte.js";
  import { platform } from "../platform/adapter.js";
  import Modal from "./Modal.svelte";

  let { session, onclose }: { session: GameSession; onclose: () => void } = $props();
  const gs = $derived(session.authoritative);
  let target = $state("");
  $effect(() => {
    if (!target) target = gs.activePlayerId;
  });
  let card = $state(CARDS[0]?.id ?? "");
  let renown = $state(0);
  let showState = $state(false);

  const base = () => ({ commandId: `debug-${Date.now()}`, matchId: gs.matchId, playerId: target });
  function grantAll() {
    session.debug({ ...base(), type: "debug_grant", targetPlayerId: target, resources: Object.fromEntries(RESOURCE_TYPES.map((r) => [r, 5])) });
  }
  function moveMenace(menaceId: string) {
    const dests = getLegalMenaceDestinations(session.ctx, gs, menaceId);
    const d = dests[Math.floor(Math.random() * dests.length)];
    if (d) session.debug({ ...base(), type: "debug_move_menace", menaceId, destination: d });
  }
  async function exportLog() {
    await platform.exportFile(`manors-${gs.matchId}.json`, JSON.stringify(session.toSaveFile(), null, 2));
  }
</script>

<Modal title="Debug tools" {onclose} wide>
  <div class="grid">
    <label>Player <select bind:value={target}>{#each gs.turnOrder as p}<option value={p}>{gs.players[p]?.displayName}</option>{/each}</select></label>
    <button onclick={grantAll}>Grant 5 of each resource</button>
    <label>Bonus Renown <input type="number" min="0" max="20" bind:value={renown} /></label>
    <button onclick={() => session.debug({ ...base(), type: "debug_set_bonus_renown", targetPlayerId: target, value: renown })}>Set bonus Renown</button>
    {#if gs.ruleset.enableCards}
      <label>Card <select bind:value={card}>{#each CARDS as c}<option value={c.id}>{c.id}</option>{/each}</select></label>
      <button onclick={() => session.debug({ ...base(), type: "debug_draw_card", targetPlayerId: target, cardDefId: card })}>Draw specific card</button>
    {/if}
    {#each Object.keys(gs.menaces) as m}
      <button onclick={() => moveMenace(m)}>Move {m.replace("menace_", "")} randomly</button>
    {/each}
    <button onclick={exportLog}>Export command log / save</button>
    <button onclick={() => (showState = !showState)}>{showState ? "Hide" : "Inspect"} GameState</button>
  </div>
  <p class="hash">State hash: <code>{hashState(gs)}</code> · revision {gs.revision} · {session.history.length} commands</p>
  {#if showState}<pre>{JSON.stringify(gs, null, 1)}</pre>{/if}
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.5rem;
  }
  pre {
    max-height: 40vh;
    overflow: auto;
    font-size: 0.7rem;
    background: #0001;
    padding: 0.5rem;
  }
  .hash {
    font-size: 0.8rem;
  }
</style>
