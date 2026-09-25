<script lang="ts">
  // What the other players just did, as short toasts at the board's edge,
  // and the "while you were away" digest when a lot happened between your
  // turns. Neither ever blocks the board: only the digest's own buttons take
  // clicks. The Chronicle keeps the complete record.
  import { fade, fly } from "svelte/transition";
  import { innerHeight, innerWidth } from "svelte/reactivity/window";
  import { RESOURCE_TYPES, type PlayerId } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import type { FeedbackController } from "../game/feedback.svelte.js";
  import type { FeedItem } from "../game/feed.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { layoutFor } from "../layout.js";
  import { animationScale } from "../stores/settings.svelte.js";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";
  import ResourceIcon from "./ResourceIcon.svelte";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, feedback }: { session: GameSession; feedback: FeedbackController } = $props();

  /** Lines the digest lists before summing up the rest (fewer when narrow). */
  const DIGEST_LINES = 8;
  const DIGEST_LINES_NARROW = 5;
  /** Where the board is small, the digest starts folded to its title. */
  const COMPACT = "(max-width: 900px), (max-height: 760px)";

  // Matches the rail and sheet block in the styles below.
  const narrow = $derived(layoutFor(innerWidth.current ?? 0, innerHeight.current ?? 0) !== "wide");
  const lines = $derived(narrow ? DIGEST_LINES_NARROW : DIGEST_LINES);
  const scale = $derived(animationScale());
  const digest = $derived(feedback.digest && feedback.digest.viewerId === session.viewerId ? feedback.digest : null);
  let open = $state(true);
  $effect(() => {
    if (digest) open = typeof matchMedia !== "function" || !matchMedia(COMPACT).matches;
  });

  function theme(playerId: PlayerId | null) {
    if (!playerId) return null;
    return PLAYER_THEMES[session.seat(playerId)?.color ?? 0] ?? PLAYER_THEMES[0]!;
  }

  // Starting to play on the board means the digest has been read.
  function boardPressed(e: PointerEvent) {
    if (digest && (e.target as Element | null)?.closest?.("svg.board")) feedback.dismissDigest();
  }
</script>

<svelte:window onpointerdowncapture={boardPressed} />

{#snippet emblem(item: FeedItem)}
  {@const th = theme(item.actorId)}
  <svg class="emblem" width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
    {#if th}<path d={emblemPath(th.shape, 6.5)} fill={th.color} stroke={th.dark} stroke-width="1.5" />{:else}<circle r="6" fill="#3b3b46" />{/if}
  </svg>
{/snippet}

{#snippet body(item: FeedItem)}
  {#if item.gains}
    {@const res = item.gains.resources}
    <span class="text" aria-hidden="true">{item.gains.lead}</span>
    <span class="gains" aria-hidden="true">
      {#each RESOURCE_TYPES.filter((r) => (res[r] ?? 0) > 0) as r}<span class="gain">+{res[r]}<ResourceIcon resource={r} size={17} label={false} /></span
        >{/each}
    </span>
    <span class="sr">{item.text}</span>
  {:else}
    <span class="text">{item.text}</span>
  {/if}
{/snippet}

<div class="feed">
  {#if digest}
    <section class="digest" aria-label={t("feed.away_title")} transition:fade={{ duration: 180 * scale }}>
      <header>
        <button class="title" aria-expanded={open} onclick={() => (open = !open)}>
          <span class="chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <strong><span class="long">{t("feed.away_title")}</span><span class="short">{t("feed.away_short")}</span></strong>
          <span class="count">{digest.items.length}</span>
        </button>
        <button class="close" aria-label={t("feed.dismiss")} onclick={() => feedback.dismissDigest()}><ToolIcon name="close" size={16} /></button>
      </header>
      {#if open}
        <ol>
          {#each digest.items.slice(-lines) as item}
            <li class:against={item.againstViewer} style="--pc: {theme(item.actorId)?.color ?? '#3b3b46'}">
              {@render emblem(item)}{@render body(item)}
            </li>
          {/each}
        </ol>
        {#if digest.items.length > lines}
          <p class="more">{t("feed.earlier", { count: digest.items.length - lines })}</p>
        {/if}
      {/if}
    </section>
  {/if}
  <!-- Not a live region: the Announcer, outside the game root that the
       privacy curtain makes inert, speaks these actions (announce.ts). -->
  <ol class="toasts" aria-label={t("feed.label")}>
    {#each feedback.toasts as item (item.key)}
      <li
        class="toast"
        class:against={item.againstViewer}
        class:self={item.self}
        data-player-target={item.actorId}
        style="--pc: {theme(item.actorId)?.color ?? '#3b3b46'}"
        in:fly={{ x: 40, duration: 260 * scale }}
        out:fade={{ duration: 220 * scale }}
      >
        {@render emblem(item)}{@render body(item)}
      </li>
    {/each}
  </ol>
</div>

<style>
  .feed {
    position: absolute;
    right: 0.75rem;
    bottom: 4.25rem;
    width: min(23.5rem, calc(100% - 1.5rem));
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.4rem;
    pointer-events: none;
    z-index: 5;
  }
  .toasts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .toast,
  .digest li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    line-height: 1.25;
  }
  .toast {
    background: color-mix(in srgb, var(--paper) 94%, transparent);
    border: 2px solid color-mix(in srgb, var(--pc) 45%, #8a7650);
    border-left: 6px solid var(--pc);
    border-radius: 10px;
    padding: 0.35rem 0.6rem;
    box-shadow: 0 4px 14px #0003;
    font-size: 0.88rem;
  }
  .toast.against {
    background: #fff0e8;
    border-color: #b6402e;
    border-left-color: var(--pc);
  }
  .toast.self {
    font-weight: 700;
  }
  .emblem {
    flex: none;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .gains {
    display: inline-flex;
    gap: 0.35rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .gain {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
  }
  .digest {
    background: color-mix(in srgb, var(--paper) 96%, transparent);
    border: 2px solid #8a7650;
    border-radius: 12px;
    padding: 0.3rem 0.45rem 0.4rem 0.6rem;
    box-shadow: 0 8px 24px #0003;
    font-size: 0.86rem;
  }
  .digest header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .digest button {
    pointer-events: auto;
  }
  .title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 34px;
    padding: 0 0.2rem;
    border: 0;
    background: none;
    text-align: left;
    color: inherit;
  }
  .title strong {
    flex: 1;
    font: 700 0.92rem/1.2 var(--font-display);
  }
  .short {
    display: none;
  }
  .chevron {
    width: 0.8rem;
    opacity: 0.7;
  }
  .count {
    min-width: 1.4rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: #8a7650;
    color: #fffaf0;
    font-weight: 700;
    font-size: 0.78rem;
    text-align: center;
  }
  .close {
    min-height: 34px;
    min-width: 34px;
    padding: 0;
  }
  .digest ol {
    list-style: none;
    margin: 0.2rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .digest li.against {
    margin-left: -0.35rem;
    padding-left: 0.25rem;
    border-left: 3px solid #b6402e;
    background: #fff0e8;
    border-radius: 4px;
  }
  .more {
    margin: 0.3rem 0 0;
    font-size: 0.78rem;
    opacity: 0.7;
  }

  /* Rail and sheet layouts (GameScreen's data-layout, see layout.ts): along
     the bottom of the board, beside the camera buttons (the portrait board
     sits at the top), two toasts at most. `--overlay-bottom` is a strip a
     layout reserves along the board's bottom edge (a bottom sheet with the
     camera in a row); clear it. */
  :global(.game:not([data-layout="wide"])) .feed {
    left: calc(0.75rem + 44px + 0.5rem);
    right: 0.5rem;
    bottom: calc(0.75rem + var(--overlay-bottom, 0px));
    width: auto;
  }
  /* The sheet's camera buttons form a row below --overlay-bottom, so the
     feed needs no indent there. */
  :global(.game[data-layout="sheet"]) .feed {
    left: 0.5rem;
  }
  :global(.game:not([data-layout="wide"])) .toast:nth-last-child(n + 3) {
    display: none;
  }
  :global(.game:not([data-layout="wide"])) .toast {
    font-size: 0.82rem;
  }
  :global(.game:not([data-layout="wide"])) .long {
    display: none;
  }
  :global(.game:not([data-layout="wide"])) .short {
    display: inline;
  }
  /* The tutorial coach has the bottom edge there. */
  :global(.game:not([data-layout="wide"]) .board-wrap:has(> .coach)) .feed {
    top: 0.5rem;
    bottom: auto;
  }
</style>
