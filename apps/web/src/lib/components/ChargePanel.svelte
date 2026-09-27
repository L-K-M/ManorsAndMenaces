<script lang="ts">
  // Sealed Charges (§27A): the viewer's own Charge with its progress and
  // Recommission, how many Charges the deck holds, then every Charge
  // revealed so far. Shown only with the option on, above the Royal Quests.
  import { BALANCE, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { chargeDescription, chargeName, heldCharge, revealedCharges } from "../game/charges.js";
  import { gainsText } from "../game/feed.js";
  import type { GameSession } from "../game/session.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();
  const gs = $derived(session.draft);
  const viewer = $derived(session.viewerId);
  const held = $derived(heldCharge(session.ctx, gs, viewer));
  const revealed = $derived(revealedCharges(gs));
  const recommissioned = $derived(!!(viewer && gs.players[viewer]?.recommissioned));
  const renown = BALANCE.sealedCharges.renown;
</script>

{#if gs.ruleset.sealedCharges}
  <section class="charges" aria-label={t("ui.sealed_charge")}>
    <h3><ToolIcon name="seal" size={15} />{t("ui.sealed_charge")}</h3>
    {#if held}
      {@const percent = Math.round((100 * held.progress.current) / held.progress.target)}
      <article class="charge" class:ready={held.progress.complete}>
        <div class="head">
          <strong>{chargeName(held.id)}</strong>
          <span class="renown">+{renown} <ToolIcon name="crown" size={14} label={t("ui.renown")} /></span>
        </div>
        <p class="description">{chargeDescription(held.id)}</p>
        <div class="progress">
          <div
            class="bar"
            role="progressbar"
            aria-label={t("ui.charge_progress", { name: chargeName(held.id) })}
            aria-valuemin="0"
            aria-valuemax={held.progress.target}
            aria-valuenow={held.progress.current}
          >
            <span style="width: {percent}%"></span>
          </div>
          <span class="percent" aria-hidden="true">{percent}%</span>
        </div>
        <p class="note">{t("ui.sealed_charge_reveal", { renown })}</p>
        {#if recommissioned}
          <p class="note">{t("ui.recommission_used")}</p>
        {:else}
          <div class="recommission">
            <button disabled={!legal?.canRecommission} onclick={() => session.perform({ type: "recommission_charge" })}>{t("action.recommission")}</button>
            <p class="note">{t("ui.recommission_hint", { cost: gainsText(BALANCE.sealedCharges.recommission) })}</p>
          </div>
        {/if}
      </article>
    {:else}
      <p class="none">{viewer ? t("ui.sealed_charge_none") : t("ui.sealed_charge_hidden")}</p>
    {/if}
    <!-- A redacted deck keeps its length (§105), so everyone sees the count. -->
    <p class="note deck">{t("ui.charges_in_deck", { count: gs.chargeDeck?.length ?? 0 })}</p>
    {#if revealed.length}
      <h4>{t("ui.charges_revealed")}</h4>
      <ul class="done">
        {#each revealed as r (r.chargeId)}
          <li title={chargeDescription(r.chargeId)}>{t("ui.revealed_charge", { charge: chargeName(r.chargeId), name: gs.players[r.playerId]?.displayName ?? "?" })}</li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .charges {
    margin-bottom: 0.8rem;
  }
  h3,
  h4 {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0 0 0.3rem;
    font: 700 0.8rem/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h4 {
    margin-top: 0.6rem;
  }
  .charge {
    display: grid;
    gap: 0.3rem;
    background: var(--paper-sheet);
    border: 1px solid #7a3b2e66;
    border-radius: 11px;
    padding: 0.6rem 0.65rem;
    box-shadow: inset 0 0 0 3px #fff9e8, inset 0 0 0 4px #7a3b2e33, 0 2px 4px #3c291c18;
  }
  .charge.ready {
    border-color: #2d8a3a;
    background: #eaf7e6;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .head strong {
    font: 700 1.1rem/1.1 var(--font-display);
    overflow-wrap: anywhere;
  }
  .renown {
    color: #75551e;
    white-space: nowrap;
    font-weight: 700;
  }
  p {
    margin: 0;
    font-size: 0.85rem;
  }
  .note,
  .none {
    font-size: 0.78rem;
    opacity: 0.8;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .bar {
    flex: 1;
    height: 8px;
    background: #0001;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid #8a765044;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--primary-face);
  }
  .percent {
    min-width: 3ch;
    font-size: 0.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
    text-align: right;
  }
  .deck {
    margin-top: 0.3rem;
  }
  .recommission {
    display: grid;
    gap: 0.2rem;
    justify-items: start;
  }
  .done {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.3rem;
  }
  .done li {
    font-size: 0.8rem;
    padding: 0.2rem 0.4rem;
    background: var(--paper-sheet);
    border: 1px solid var(--edge);
    border-radius: 8px;
  }
</style>
