<script lang="ts">
  import { untrack } from "svelte";
  import { BALANCE, cardDefIdOf, HIDDEN_CARD, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { cardBlockedNotice, showBlocked, startCard } from "../game/interaction.js";
  import type { FeedbackController } from "../game/feedback.svelte.js";
  import { currentActor, type GameSession } from "../game/session.svelte.js";
  import { ui, resetTool } from "../stores/ui.svelte.js";
  import type { GameLayout } from "../layout.js";
  import CardFace from "./CardFace.svelte";
  import CardViewer from "./CardViewer.svelte";
  import EmptyHandArt from "./EmptyHandArt.svelte";
  import HandSwapNotice from "./HandSwapNotice.svelte";
  import ResourceIcon from "./ResourceIcon.svelte";

  const cardCost = Object.entries(BALANCE.costs.card) as [keyof typeof BALANCE.costs.card, number][];

  let { session, legal, feedback, layout }: { session: GameSession; legal: LegalActionSummary | null; feedback: FeedbackController; layout: GameLayout } = $props();
  // The wide layout's dock has a fixed height: its cards fill it and show
  // title and painting, and a preview shows the rules. The rail and phone
  // trays scroll, so their cards have room for the whole text.
  const docked = $derived(layout === "wide");
  const viewer = $derived(session.viewerId);
  const hand = $derived(viewer ? (session.draft.players[viewer]?.hand ?? []) : []);
  let discardSel: string[] = $state([]);
  // With no viewer (hot-seat AI turn or curtain) no hand is shown at all.
  const hiddenNote = $derived.by(() => {
    if (viewer || session.transport.kind !== "local") return null;
    const waiting = session.curtainFor ?? currentActor(session.draft);
    if (!waiting) return null;
    const name = session.draft.players[waiting]?.displayName ?? "";
    return session.curtainFor ? t("ui.hands_hidden_curtain", { name }) : t("ui.hands_hidden_ai", { name });
  });

  const playable = $derived(new Set(legal?.playableCards ?? []));
  const discarding = $derived(legal?.mode === "end" && legal.mustDiscard > 0);

  // A choice about a card that has left the hand is stale: Changeling swaps
  // whole hands, and the new cards must not inherit the old selection.
  $effect(() => {
    const inHand = new Set(hand);
    untrack(() => {
      if (discardSel.some((c) => !inHand.has(c))) discardSel = discardSel.filter((c) => inHand.has(c));
      if (viewing && !inHand.has(viewing)) viewing = null;
      if (viewer && ui.cardId && !inHand.has(ui.cardId)) resetTool();
    });
  });

  async function click(cardId: string) {
    if (discarding) {
      discardSel = discardSel.includes(cardId) ? discardSel.filter((c) => c !== cardId) : [...discardSel, cardId];
      return;
    }
    if (ui.cardId === cardId) return resetTool();
    if (playable.has(cardId)) return startCard(session, cardId);
    // A card that can't be played says why instead of ignoring the tap.
    const notice = viewer ? cardBlockedNotice(session, viewer, cardId) : null;
    if (notice) showBlocked(notice);
  }
  async function discard() {
    if (await session.perform({ type: "discard_cards", cardIds: discardSel })) discardSel = [];
  }

  // Hovering a card with a mouse (or tabbing to it) shows the whole card at
  // reading size above it: the dock's cards leave out the rules. It is
  // positioned against the viewport so the hand's scroll box cannot clip it.
  let peek: { cardId: string; x: number; top: number; bottom: number; viewportHeight: number } | null = $state(null);
  let peekHeight = $state(0);
  const peekTop = $derived.by(() => {
    if (!peek) return 0;
    return Math.max(8, Math.min(
      peek.viewportHeight - peekHeight - 8,
      peek.top > peek.viewportHeight * 0.4 ? peek.top - peekHeight - 8 : peek.bottom + 8,
    ));
  });
  // Illustrations make previews taller. Measure the actual card (including
  // wrapped rules and large text) before clamping it inside the viewport.
  function measurePeek(node: HTMLElement) {
    const measure = () => { peekHeight = node.getBoundingClientRect().height; };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  function placePeek(el: HTMLElement, cardId: string) {
    const r = el.getBoundingClientRect();
    peek = { cardId, x: r.left + r.width / 2, top: r.top, bottom: r.bottom, viewportHeight: window.innerHeight };
  }
  function showPeek(e: PointerEvent | FocusEvent, cardId: string) {
    if (held) return;
    if (e instanceof PointerEvent && (e.pointerType !== "mouse" || !matchMedia("(hover: hover)").matches)) return;
    const el = e.currentTarget as HTMLElement;
    if (e instanceof FocusEvent && !el.matches(":focus-visible")) return;
    placePeek(el, cardId);
  }
  function hidePeek() {
    peek = null;
  }

  // Touch has no hover: pressing and holding a card opens it in the card
  // viewer, which stays open after the finger lifts until the player closes
  // it. Starting to scroll the hand cancels the pointer, and with it the hold.
  const HOLD_MS = 400;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let viewing: string | null = $state(null);
  // From the moment a hold opens the viewer until the next press or key:
  // lifting the finger may still send mouse events to whatever is under it
  // now, the viewer or its backdrop. That click must neither play the card
  // nor close the viewer, its mousedown must not pull focus out of the
  // viewer (Escape would then miss it), and a long press must not open the
  // browser's menu for the painting under the finger.
  let held = false;
  function pressStart(e: PointerEvent, cardId: string) {
    if (e.pointerType === "mouse") return;
    const el = e.currentTarget as HTMLElement;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      hidePeek();
      // Modal hands focus back to the card when the viewer closes.
      el.focus({ preventScroll: true });
      viewing = cardId;
    }, HOLD_MS);
  }
  function pressEnd() {
    clearTimeout(holdTimer);
  }
  function swallowLiftClick(e: MouseEvent) {
    if (!held) return;
    held = false;
    e.stopPropagation();
    e.preventDefault();
  }
  // A pointer the card has not captured (a pen, say) can slide off while
  // still pressed; the hold must not fire for a card it no longer touches.
  function pointerLeave() {
    clearTimeout(holdTimer);
    hidePeek();
  }
</script>

<svelte:window
  onresize={hidePeek}
  onpointerdowncapture={() => (held = false)}
  onkeydowncapture={() => (held = false)}
  onmousedowncapture={(e) => held && e.preventDefault()}
  onclickcapture={swallowLiftClick}
  oncontextmenucapture={(e) => held && e.preventDefault()}
/>

{#if session.draft.ruleset.enableCards}
  <section class="hand" class:docked aria-label={t("ui.your_hand")}>
    <div class="head">
      <h3>
        {viewer ? t("ui.players_hand", { name: session.draft.players[viewer]?.displayName ?? "" }) : t("ui.hand")}
        {#if viewer}<small>({hand.length}/{session.draft.ruleset.handLimit})</small>{/if}
      </h3>
      {#if session.draft.status === "playing" && (session.draft.ruleset.cardDrawEveryRounds ?? 0) > 0}
        {@const interval = session.draft.ruleset.cardDrawEveryRounds!}
        <p class="draw-note">{t("hand.next_free_card", { round: (Math.floor(session.draft.round / interval) + 1) * interval })}</p>
      {/if}
      {#if viewer && hand.length > 0}<p class="hold-hint">{t("hand.hold_hint")}</p>{/if}
    </div>
    <div class="swap"><HandSwapNotice {session} {feedback} /></div>
    {#if hiddenNote}
      <p class="empty hidden">
        <svg class="lock" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
          <path d="M3.5 7V4.5a3.5 3.5 0 0 1 7 0V7" fill="none" stroke="currentColor" stroke-width="1.8" />
          <rect x="1" y="7" width="12" height="8.5" rx="1.8" fill="currentColor" />
        </svg>
        {hiddenNote}
      </p>
    {:else if viewer && hand.length === 0}
      <div class="empty-hand">
        <div class="empty-picture"><EmptyHandArt /></div>
        <div class="empty-copy">
          <p class="empty-title">{t("hand.empty_title")}</p>
          <p class="empty-hint">{t("hand.buy_hint")}</p>
          <div class="card-cost">
            {#each cardCost as [resource, count]}
              <span><ResourceIcon {resource} size={20} label={false} /><b>{count}</b> {t(`resource.${resource}`)}</span>
            {/each}
          </div>
        </div>
      </div>
    {/if}
    <ul onscroll={hidePeek}>
      {#each hand as cardId (cardId)}
        {#if cardId === HIDDEN_CARD}
          <li class="card back" aria-label={t("ui.hidden_card")}></li>
        {:else}
          {@const def = session.ctx.cardOf(cardId)}
          {@const id = cardDefIdOf(cardId)}
          <li>
            <button
              class="card {def.type}"
              class:playable={playable.has(cardId) || discarding}
              class:active={ui.cardId === cardId}
              class:chosen={discardSel.includes(cardId)}
              aria-pressed={ui.cardId === cardId || discardSel.includes(cardId)}
              aria-label="{t(`card.${id}.name`)} ({t(`card.type.${def.type}`)}): {t(`card.${id}.rules`)}"
              onclick={() => click(cardId)}
              onpointerenter={(e) => showPeek(e, cardId)}
              onpointerleave={pointerLeave}
              onpointerdown={(e) => pressStart(e, cardId)}
              onpointerup={pressEnd}
              onpointercancel={pressEnd}
              onfocus={(e) => showPeek(e, cardId)}
              onblur={hidePeek}
            >
              <CardFace {def} view={docked ? "glance" : "full"} />
            </button>
          </li>
        {/if}
      {/each}
    </ul>
    {#if peek && hand.includes(peek.cardId)}
      {@const def = session.ctx.cardOf(peek.cardId)}
      <div
        class="card peek {def.type}"
        use:measurePeek
        style="--x: {peek.x}px; --y: {peekTop}px"
        aria-hidden="true"
      >
        <CardFace {def} view="read" />
      </div>
    {/if}
    {#if viewing && hand.includes(viewing)}
      <CardViewer def={session.ctx.cardOf(viewing)} onclose={() => (viewing = null)} />
    {/if}
    {#if discarding}
      <div class="discard">
        <button class="primary" disabled={discardSel.length !== (legal?.mustDiscard ?? 0)} onclick={discard}>
          {t("action.discard")} {discardSel.length}/{legal?.mustDiscard}
        </button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .draw-note { margin: 0 0 0.3rem; font-size: 0.75rem; color: var(--ink-soft); }
  /* Touch screens have no hover, so they say how to read a card. */
  .hold-hint {
    display: none;
    margin: 0 0 0.3rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  @media (any-pointer: coarse) {
    .hold-hint { display: block; }
  }
  h3 {
    margin: 0 0 0.3rem;
    font: 700 0.8rem/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  /* GameScreen sizes the hand; it fills that box and scrolls sideways.
     A scrolling phone tray shows whole cards, one wide card at a time. */
  .hand {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  ul {
    list-style: none;
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 0.65rem;
    margin: 0;
    padding: 0.3rem 0.25rem 0.6rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 0.25rem;
  }
  ul:empty {
    display: none;
  }
  li {
    display: flex;
    scroll-snap-align: start;
  }
  /* The desktop dock has a fixed height (GameScreen). The heading moves
     beside the cards so they get all of it; they take a portrait width
     from it, and the preview above shows the rules. */
  .docked {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    column-gap: 0.75rem;
  }
  .docked .head {
    grid-row: 1 / -1;
    max-width: 7.5rem;
    min-height: 0;
    overflow-y: auto;
  }
  /* A Changeling notice sits above the cards, where it has the width to be
     read; it is empty (and takes no height) otherwise. */
  .docked .swap {
    grid-column: 2;
    grid-row: 1;
  }
  .docked ul,
  .docked .empty,
  .docked .empty-hand,
  .docked .discard {
    grid-column: 2;
  }
  .docked ul {
    container: cards / size;
    scroll-snap-type: none;
  }
  /* In a scrolling tray (rail, phone sheet) Discard stays in view while you
     choose which cards to let go. Its backing hides the cards behind it
     while it is still disabled (and see-through). */
  .discard {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: grid;
    background: var(--parchment);
  }
  .empty {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.7;
  }
  .empty-hand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1;
    min-height: 0;
    padding: 0.5rem 0.7rem;
    overflow: auto;
    border: 1px solid #a4864b66;
    border-radius: 12px;
    background: radial-gradient(ellipse at left, #fff8dfaa, transparent 70%), #fff8e844;
    box-shadow: inset 0 0 0 3px #fff9e855;
  }
  .empty-picture {
    width: 6rem;
    height: 6rem;
    flex: none;
  }
  .empty-copy { min-width: 0; }
  .empty-title {
    margin: 0 0 0.2rem;
    font: 700 1.1rem/1.15 var(--font-display);
  }
  .empty-hint {
    margin: 0 0 0.35rem;
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
  .card-cost {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .card-cost > span {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.12rem 0.4rem;
    border: 1px solid #a4864b55;
    border-radius: 1rem;
    background: #fff9e899;
    white-space: nowrap;
  }
  .hidden {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-style: italic;
  }
  .lock {
    flex: none;
  }
  .card {
    display: block;
    padding: 0;
    border: 2px solid #795b32;
    border-radius: 12px;
    text-align: left;
    background: #293f32;
    box-shadow: 0 3px 0 #6a482b, 0 5px 8px #3c291c33;
    opacity: 1;
    cursor: default;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .card.playable { cursor: pointer; }
  .card.playable:hover { transform: translateY(-3px); }
  .card.active, .card.chosen {
    border-color: #fff2b6;
    box-shadow: 0 0 0 3px var(--accent), 0 5px 12px #3c291c55;
  }
  .card.back {
    background: url("/art/manor-troll.png") center / 85% auto no-repeat, var(--forest-panel);
    box-shadow: inset 0 0 0 5px #294532, inset 0 0 0 7px #cbaa62;
  }
  /* Hand cards in a tray: GameScreen sets the width, and they are at least
     portrait (5 : 7), taller where the text needs it. */
  ul .card {
    flex: none;
    width: var(--hand-card-width, 12rem);
    min-height: calc(var(--hand-card-width, 12rem) * 1.4);
  }
  /* In the dock: the full height, and a portrait width from it (1.39 : 1,
     so a card stays a card). Larger text needs wider cards to keep titles
     from breaking mid-word; at 150% nine of its rems fit every title on
     two lines, even where that makes a card less than portrait. */
  .docked ul .card {
    height: 100%;
    width: clamp(5rem, max(72cqh, (var(--text-scale, 1) - 1) * 18rem), 12rem);
    min-height: 0;
  }
  /* A dock this short (large text on a small screen) leaves a portrait card
     no room beyond a title broken over several lines. Wider cards keep each
     title to two lines, over what fits of the painting; the preview still
     shows the whole card. */
  @container cards (max-height: 8rem) {
    .docked ul .card {
      width: 9rem;
      --glance-ribbon: none;
    }
  }
  @container cards (max-height: 5rem) {
    .docked ul .card {
      --glance-art: none;
    }
  }
  .peek {
    position: fixed;
    z-index: 40;
    left: clamp(8px, calc(var(--x) - 11rem), calc(100vw - 22rem - 8px));
    top: var(--y);
    width: min(22rem, calc(100vw - 16px));
    height: auto;
    max-height: calc(100dvh - 16px);
    overflow: auto;
    box-shadow: 0 12px 32px #0006;
    pointer-events: none;
  }
</style>
