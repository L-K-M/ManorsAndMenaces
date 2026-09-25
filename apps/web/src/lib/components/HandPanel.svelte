<script lang="ts">
  import { cardDefIdOf, HIDDEN_CARD, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { startCard } from "../game/interaction.js";
  import { currentActor, type GameSession } from "../game/session.svelte.js";
  import { ui, resetTool } from "../stores/ui.svelte.js";

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
  let peek: { cardId: string; x: number; top: number; bottom: number } | null = $state(null);
  function placePeek(el: HTMLElement, cardId: string) {
    const r = el.getBoundingClientRect();
    peek = { cardId, x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
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
      <p class="empty">{t("hand.empty", { action: t("action.buy_card"), cost: t("cost.card") })}</p>
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
              <span class="type">{t(`card.type.${def.type}`)}{def.timing.includes("reaction") ? t("card.reaction_suffix") : ""}</span>
              <strong>{t(`card.${id}.name`)}</strong>
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
      {@const above = peek.top > window.innerHeight * 0.4}
      <div
        class="card peek {def.type}"
        class:above
        style="--x: {peek.x}px; --y: {above ? peek.top : peek.bottom}px"
        aria-hidden="true"
      >
        <span class="type">{t(`card.type.${def.type}`)}{def.timing.includes("reaction") ? t("card.reaction_suffix") : ""}</span>
        <strong>{t(`card.${id}.name`)}</strong>
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
    width: 12.5rem;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    text-align: left;
    padding: 0.45rem 0.55rem;
    border-radius: 10px;
    border: 2px solid #8a7650;
    background: linear-gradient(#fffdf6, #f2e6c8);
    opacity: 0.7;
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
    border-color: #7a5bb8;
  }
  .card.hero {
    border-color: #b8761c;
  }
  .card.trick {
    border-color: #4d6b3a;
  }
  .card.story {
    border-color: #b8433a;
  }
  .card.back {
    background: repeating-linear-gradient(45deg, #5a4a8a, #5a4a8a 6px, #6b5b9c 6px, #6b5b9c 12px);
    min-height: 6rem;
    width: 4rem;
  }
  .type {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.7;
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
    z-index: 40;
    left: clamp(0.5rem, calc(var(--x) - 7.5rem), calc(100vw - 15.5rem));
    top: calc(var(--y) + 0.5rem);
    width: 15rem;
    opacity: 1;
    box-shadow: 0 12px 32px #0004;
    pointer-events: none;
  }
  .peek.above {
    top: calc(var(--y) - 0.5rem);
    translate: 0 -100%;
  }
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
