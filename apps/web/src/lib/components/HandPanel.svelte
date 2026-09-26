<script lang="ts">
  import { untrack } from "svelte";
  import { BALANCE, cardDefIdOf, HIDDEN_CARD, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { startCard } from "../game/interaction.js";
  import { currentActor, type GameSession } from "../game/session.svelte.js";
  import { ui, resetTool } from "../stores/ui.svelte.js";
  import CardArt from "./CardArt.svelte";
  import EmptyHandArt from "./EmptyHandArt.svelte";
  import ResourceIcon from "./ResourceIcon.svelte";

  const cardCost = Object.entries(BALANCE.costs.card) as [keyof typeof BALANCE.costs.card, number][];

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();
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
      if (viewer && ui.cardId && !inHand.has(ui.cardId)) resetTool();
    });
  });

  async function click(cardId: string) {
    if (held) {
      held = false;
      return;
    }
    if (discarding) {
      discardSel = discardSel.includes(cardId) ? discardSel.filter((c) => c !== cardId) : [...discardSel, cardId];
      return;
    }
    if (ui.cardId === cardId) return resetTool();
    if (playable.has(cardId)) await startCard(session, cardId);
  }
  async function discard() {
    if (await session.perform({ type: "discard_cards", cardIds: discardSel })) discardSel = [];
  }

  // The dock shows compact cards with clamped rules text; hovering one with a
  // mouse (or tabbing to it) shows the whole card above it. It is positioned
  // against the viewport so the hand's scroll box cannot clip it.
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
    if (e instanceof PointerEvent && (e.pointerType !== "mouse" || !matchMedia("(hover: hover)").matches)) return;
    const el = e.currentTarget as HTMLElement;
    if (e instanceof FocusEvent && !el.matches(":focus-visible")) return;
    placePeek(el, cardId);
  }
  function hidePeek() {
    peek = null;
  }

  // Touch has no hover: pressing and holding a card shows the same preview
  // until the finger lifts, and that press does not also play the card.
  // Starting to scroll the hand cancels the pointer, and with it the hold.
  const HOLD_MS = 400;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  function pressStart(e: PointerEvent, cardId: string) {
    // Any new press clears a hold, so the click after a touch hold is not swallowed.
    held = false;
    if (e.pointerType === "mouse") return;
    const el = e.currentTarget as HTMLElement;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      placePeek(el, cardId);
    }, HOLD_MS);
  }
  function pressEnd() {
    clearTimeout(holdTimer);
    if (held) hidePeek();
  }
  // A pointer the card has not captured (a pen, say) can slide off while
  // still pressed; the hold must not fire for a card it no longer touches.
  function pointerLeave() {
    clearTimeout(holdTimer);
    hidePeek();
  }
</script>

<svelte:window onresize={hidePeek} />

{#if session.draft.ruleset.enableCards}
  <section class="hand" aria-label={t("ui.your_hand")}>
    <h3>
      {viewer ? t("ui.players_hand", { name: session.draft.players[viewer]?.displayName ?? "" }) : t("ui.hand")}
      {#if viewer}<small>({hand.length}/{session.draft.ruleset.handLimit})</small>{/if}
    </h3>
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
              oncontextmenu={(e) => held && e.preventDefault()}
              onfocus={(e) => showPeek(e, cardId)}
              onblur={hidePeek}
            >
              <span class="card-heading"><span class="type">{t(`card.type.${def.type}`)}{def.timing.includes("reaction") ? t("card.reaction_suffix") : ""}</span></span>
              <strong>{t(`card.${id}.name`)}</strong>
              <span class="illustration"><CardArt id={def.effectId} type={def.type} /></span>
              <span class="rules">{t(`card.${id}.rules`)}</span>
              <em class="flavor">{t(`card.${id}.flavor`)}</em>
            </button>
          </li>
        {/if}
      {/each}
    </ul>
    {#if peek && hand.includes(peek.cardId)}
      {@const def = session.ctx.cardOf(peek.cardId)}
      {@const id = cardDefIdOf(peek.cardId)}
      <div
        class="card peek {def.type}"
        use:measurePeek
        style="--x: {peek.x}px; --y: {peekTop}px"
        aria-hidden="true"
      >
        <span class="card-heading"><span class="type">{t(`card.type.${def.type}`)}{def.timing.includes("reaction") ? t("card.reaction_suffix") : ""}</span></span>
        <strong>{t(`card.${id}.name`)}</strong>
              <span class="illustration"><CardArt id={def.effectId} type={def.type} /></span>
        <span class="rules">{t(`card.${id}.rules`)}</span>
        <em class="flavor">{t(`card.${id}.flavor`)}</em>
      </div>
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
  h3 {
    margin: 0 0 0.3rem;
    font: 700 0.8rem/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  /* GameScreen sizes the hand; it fills that box and scrolls sideways.
     --rules-lines and --flavor-display let a roomier container show whole
     cards. A fixed-height container sets --cards-container: size, and the
     row of cards then trims its rules text to the height it gets. */
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
    gap: 0.5rem;
    margin: 0;
    padding: 0.2rem 0 0.4rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    container-name: cards;
    container-type: var(--cards-container, normal);
  }
  li {
    display: flex;
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
  .empty-hand + ul:empty {
    display: none;
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
    flex: none;
    width: 17rem;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: 4.8rem minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    column-gap: 0.6rem;
    row-gap: 0.2rem;
    text-align: left;
    padding: 0.45rem 0.55rem;
    border-radius: 10px;
    border: 2px solid var(--card-ink, var(--edge));
    background: var(--paper-sheet);
    box-shadow: inset 0 0 0 3px #fff9e8, inset 0 0 0 4px #b5944d55, 0 2px 3px #3c291c26;
    opacity: 1;
    cursor: default;
    /* A held press previews the card instead of selecting its text. */
    user-select: none;
    -webkit-touch-callout: none;
  }
  .card.playable {
    opacity: 1;
    cursor: pointer;
  }
  .card.playable:hover {
    transform: translateY(-3px);
  }
  .card.active,
  .card.chosen {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .card.spell {
    --card-ink: #77568f;
  }
  .card.hero {
    --card-ink: #ad722a;
  }
  .card.trick {
    --card-ink: #4d6b3a;
  }
  .card.story {
    --card-ink: #b8433a;
  }
  .card.charter {
    --card-ink: #8a6740;
  }
  /* A Charter stays face up in front of you: royal paper, not parchment. */
  .card.charter {
    border-color: #2d6a8f;
    background: linear-gradient(#fbfdfe, #e1ebf0);
  }
  .card.back {
    background: url("/art/manor-troll.png") center / 95% auto no-repeat, var(--forest-panel);
    min-height: 6rem;
    width: 4rem;
  }
  .type {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.7;
  }
  .card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 1.5rem;
    color: var(--card-ink);
    flex: none;
  }
  .card-heading, strong, .rules, .flavor { grid-column: 2; }
  .card-heading { grid-row: 1; }
  strong { grid-row: 2; }
  .rules { grid-row: 3; }
  .flavor { grid-row: 4; }
  .illustration {
    grid-column: 1;
    grid-row: 1 / -1;
    align-self: start;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid #84613766;
    border-radius: 6px;
  }
  .card:not(.playable):not(.peek) {
    border-color: color-mix(in srgb, var(--card-ink, var(--edge)) 45%, var(--parchment));
  }
  strong {
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rules {
    font-size: 0.78rem;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--rules-lines, 3);
    line-clamp: var(--rules-lines, 3);
    overflow: hidden;
  }
  .flavor {
    display: var(--flavor-display, none);
    font-size: 0.7rem;
    opacity: 0.65;
    margin-top: auto;
  }
  /* Large text or the Discard button leave less height: show fewer lines
     of rules (the hover preview has them all) instead of cutting them off. */
  @container cards (max-height: 6.85rem) {
    .rules {
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
  }
  @container cards (max-height: 5.8rem) {
    .rules {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }
  @container cards (max-height: 4.75rem) {
    .rules {
      display: none;
    }
  }
  .peek {
    position: fixed;
    display: flex;
    flex-direction: column;
    z-index: 40;
    left: clamp(0.5rem, calc(var(--x) - 7.5rem), calc(100vw - 15.5rem));
    top: var(--y);
    width: 15rem;
    opacity: 1;
    box-shadow: 0 12px 32px #0004;
    pointer-events: none;
  }
  .peek .illustration {
    flex: none;
    aspect-ratio: 3 / 2;
    height: clamp(3rem, 19dvh, 9rem);
  }
  .peek .card-heading { height: auto; }
  .peek strong {
    white-space: normal;
  }
  .peek .rules {
    display: block;
    font-size: 0.85rem;
  }
  .peek .flavor {
    display: block;
    margin-top: 0.3rem;
  }
</style>
