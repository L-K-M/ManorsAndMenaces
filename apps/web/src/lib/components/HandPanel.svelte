<script lang="ts">
  import { cardDefIdOf, HIDDEN_CARD, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { startCard } from "../game/interaction.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui, resetTool } from "../stores/ui.svelte.js";

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();
  const viewer = $derived(session.viewerId);
  const hand = $derived(viewer ? (session.draft.players[viewer]?.hand ?? []) : []);
  let discardSel: string[] = $state([]);

  const playable = $derived(new Set(legal?.playableCards ?? []));
  const discarding = $derived(legal?.mode === "end" && legal.mustDiscard > 0);

  async function click(cardId: string) {
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
</script>

{#if session.draft.ruleset.enableCards}
  <section class="hand" aria-label="Your hand">
    <h3>{viewer ? `${session.draft.players[viewer]?.displayName}'s hand` : "Hand"} <small>({hand.length}/{session.draft.ruleset.handLimit})</small></h3>
    {#if hand.length === 0}
      <p class="empty">No cards. {t("action.buy_card")}: {t("cost.card")}</p>
    {/if}
    <ul>
      {#each hand as cardId (cardId)}
        {#if cardId === HIDDEN_CARD}
          <li class="card back" aria-label="Hidden card"></li>
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
            >
              <span class="type">{t(`card.type.${def.type}`)}{def.timing.includes("reaction") ? " · reaction" : ""}</span>
              <strong>{t(`card.${id}.name`)}</strong>
              <span class="rules">{t(`card.${id}.rules`)}</span>
              <em class="flavor">{t(`card.${id}.flavor`)}</em>
            </button>
          </li>
        {/if}
      {/each}
    </ul>
    {#if discarding}
      <button class="primary" disabled={discardSel.length !== (legal?.mustDiscard ?? 0)} onclick={discard}>
        {t("action.discard")} {discardSel.length}/{legal?.mustDiscard}
      </button>
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
  ul {
    list-style: none;
    display: flex;
    gap: 0.5rem;
    margin: 0;
    padding: 0.2rem 0 0.4rem;
    overflow-x: auto;
  }
  .empty {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.7;
  }
  .card {
    width: 10.5rem;
    min-height: 8.5rem;
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
  .rules {
    font-size: 0.78rem;
  }
  .flavor {
    font-size: 0.7rem;
    opacity: 0.65;
    margin-top: auto;
  }
</style>
