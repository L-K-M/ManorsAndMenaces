<script lang="ts">
  // A card another player played, shown whole until you tap OK. The
  // PlayQueue (plays.svelte.ts) decides which card shows and when; OK, the
  // close button and Escape all mean "read".
  import { t } from "../i18n.js";
  import { cardName, nameOf } from "../game/log.js";
  import type { PlayNotice } from "../game/plays.js";
  import type { PlayQueue } from "../game/plays.svelte.js";
  import type { GameSession } from "../game/session.svelte.js";
  import FullCard from "./FullCard.svelte";
  import Modal from "./Modal.svelte";

  let { session, plays, notice }: { session: GameSession; plays: PlayQueue; notice: PlayNotice } = $props();

  const gs = $derived(session.authoritative);
  const title = $derived.by(() => {
    const name = nameOf(gs, notice.playerId);
    const counter = notice.countered;
    if (!counter) return t("feed.card_played", { name, card: cardName(notice.cardId) });
    const key = counter.playerId === session.viewerId ? "feed.card_cancelled_you" : "feed.card_cancelled";
    return t(key, { by: name, name: nameOf(gs, counter.playerId), card: cardName(counter.cardId) });
  });
  // A Spell open to Counterspells has not taken effect yet.
  const awaitingReactions = $derived(!notice.countered && gs.pending?.kind === "reaction" && gs.pending.cardId === notice.cardId);
</script>

<Modal {title} onclose={() => plays.acknowledge()}>
  {#if plays.total > 1}<p class="count">{t("feed.play_count", { n: plays.position, total: plays.total })}</p>{/if}
  <FullCard def={session.ctx.cardOf(notice.cardId)} />
  {#if awaitingReactions}<p class="pending">{t("feed.play_pending")}</p>{/if}
  <div class="ok"><button class="primary" data-autofocus onclick={() => plays.acknowledge()}>{t("feed.play_ok")}</button></div>
</Modal>

<style>
  .count {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
    opacity: 0.8;
  }
  .pending {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
    text-align: center;
  }
  .ok {
    display: flex;
    justify-content: center;
  }
  .ok button {
    min-width: 8rem;
  }
</style>
