<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { PLAYER_THEMES } from "../theme.js";

  let { session }: { session: GameSession } = $props();
  let listEl: HTMLOListElement | undefined = $state();
  let showRaw = $state(false);
  const dev = import.meta.env.DEV;

  // Follow mode: the list auto-scrolls only while it is pinned to the bottom,
  // so reading older entries survives new ones arriving (spec §84). Only the
  // reader switches it off (scrolling up); appends never re-measure it, so a
  // list that has not scrolled yet (just mounted, or a background tab) keeps
  // following.
  const FOLLOW_THRESHOLD_PX = 40;
  let following = $state(true);

  function nearBottom(): boolean {
    if (!listEl) return true;
    return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < FOLLOW_THRESHOLD_PX;
  }

  $effect(() => {
    void session.log.length;
    if (!listEl) return;
    if (untrack(() => following)) listEl.scrollTop = listEl.scrollHeight;
    // Undo can shrink the list until nothing is hidden: follow again.
    else if (nearBottom()) following = true;
  });

  function jumpToLatest(): void {
    following = true;
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  }
</script>

<section class="log" aria-label={t("ui.game_log")}>
  <header>
    <h3>{t("ui.chronicle")}</h3>
    {#if dev}<label><input type="checkbox" bind:checked={showRaw} /> {t("ui.details")}</label>{/if}
  </header>
  <div class="list-wrap">
    <ol bind:this={listEl} onscroll={() => (following = nearBottom())}>
      {#each session.log as entry (entry.id)}
        {@const seat = session.seat(entry.playerId)}
        <li class={entry.kind} style="--pc: {entry.playerId ? (PLAYER_THEMES[seat?.color ?? 0]?.color ?? '#555') : '#555'}">
          {entry.text}
          {#if showRaw && entry.raw}<code>{JSON.stringify(entry.raw)}</code>{/if}
        </li>
      {/each}
    </ol>
    {#if !following}<button class="jump" onclick={jumpToLatest}>{t("ui.jump_to_latest")}</button>{/if}
  </div>
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
  .list-wrap {
    position: relative;
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
  .jump {
    position: absolute;
    bottom: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    min-height: 34px;
    padding: 0.15rem 0.7rem;
    border-radius: 999px;
    font-size: 0.78rem;
    box-shadow: 0 4px 12px #0003;
  }
</style>
