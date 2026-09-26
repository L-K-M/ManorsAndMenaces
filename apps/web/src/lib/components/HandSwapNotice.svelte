<script lang="ts">
  // Another player's Changeling swapped the viewer's whole hand: say which
  // cards went and which came, on the hand itself, until the viewer closes
  // it or their turn ends. The toast for it passes quickly, and without this
  // the hand simply holds different cards.
  import { cardDefIdOf } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { listText } from "../game/feed.js";
  import type { FeedbackController } from "../game/feedback.svelte.js";
  import type { GameSession } from "../game/session.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, feedback }: { session: GameSession; feedback: FeedbackController } = $props();
  const viewer = $derived(session.viewerId);
  const swap = $derived(viewer ? (feedback.handSwaps.get(viewer) ?? null) : null);

  const cards = (ids: readonly string[]) => (ids.length ? listText(ids.map((id) => t(`card.${cardDefIdOf(id)}.name`))) : t("hand.swapped_none"));
</script>

{#if swap && viewer}
  <!-- The Announcer says a hand was swapped; this adds which cards. -->
  <div class="swap-notice" role="status">
    <p>
      <strong>{t("hand.swapped", { name: session.draft.players[swap.by]?.displayName ?? "" })}</strong>
      {t("hand.swapped_cards", { gave: cards(swap.gave), got: cards(swap.got) })}
    </p>
    <button class="close" aria-label={t("feed.dismiss")} onclick={() => feedback.dismissHandSwap(viewer)}><ToolIcon name="close" size={16} /></button>
  </div>
{/if}

<style>
  .swap-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0 0 0.4rem;
    padding: 0.4rem 0.3rem 0.4rem 0.6rem;
    border: 1px solid var(--edge);
    border-left: 4px solid var(--wax);
    border-radius: var(--radius-m);
    background: var(--paper);
    font-size: 0.875rem;
    line-height: 1.3;
  }
  p {
    margin: 0;
    flex: 1;
  }
  .close {
    flex: none;
    min-width: 44px;
    min-height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }
</style>
