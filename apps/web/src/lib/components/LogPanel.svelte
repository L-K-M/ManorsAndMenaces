<script lang="ts">
  import type { GameSession } from "../game/session.svelte.js";
  import { PLAYER_THEMES } from "../theme.js";

  let { session }: { session: GameSession } = $props();
  let listEl: HTMLOListElement | undefined = $state();
  let showRaw = $state(false);
  const dev = import.meta.env.DEV;

  $effect(() => {
    void session.log.length;
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  });
</script>

<section class="log" aria-label="Game log">
  <header>
    <h3>Chronicle</h3>
    {#if dev}<label><input type="checkbox" bind:checked={showRaw} /> details</label>{/if}
  </header>
  <ol bind:this={listEl} aria-live="polite">
    {#each session.log as entry (entry.id)}
      {@const seat = session.seat(entry.playerId)}
      <li class={entry.kind} style="--pc: {entry.playerId ? (PLAYER_THEMES[seat?.color ?? 0]?.color ?? '#555') : '#555'}">
        {entry.text}
        {#if showRaw && entry.raw}<code>{JSON.stringify(entry.raw)}</code>{/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h3 {
    margin: 0 0 0.3rem;
    font: 700 0.8rem/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  label {
    font-size: 0.75rem;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 22rem;
    overflow-y: auto;
    font-size: 0.85rem;
  }
  li {
    padding: 0.12rem 0 0.12rem 0.5rem;
    border-left: 3px solid var(--pc);
    margin-bottom: 0.15rem;
  }
  li.turn {
    font-weight: 700;
    margin-top: 0.4rem;
    border-left-width: 0;
    padding-left: 0;
    color: var(--pc);
  }
  li.important {
    font-weight: 600;
  }
  code {
    display: block;
    font-size: 0.65rem;
    opacity: 0.6;
    word-break: break-all;
  }
</style>
