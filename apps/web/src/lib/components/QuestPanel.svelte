<script lang="ts">
  import { getQuestProgress, questRoundsLeft, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import ToolIcon from "./ToolIcon.svelte";
  import QuestArt from "./QuestArt.svelte";
  import type { GameSession } from "../game/session.svelte.js";

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();
  const gs = $derived(session.draft);
  const viewer = $derived(session.viewerId);
  const claimable = $derived(new Set(legal?.claimableQuests ?? []));
  const landmarkName = (siteId: string) => {
    const s = session.map.sites.find((x) => x.id === siteId);
    return s?.landmarkId ? t(`landmark.${s.landmarkId}`) : siteId;
  };
  const describe = (questId: string) => {
    const [a, b] = session.map.questParams.kingsHighway;
    return t(`quest.${questId}.description`, { a: landmarkName(a), b: landmarkName(b) });
  };
  const claimed = $derived(
    gs.turnOrder.flatMap((pid) => (gs.players[pid]?.claimedQuestIds ?? []).map((q) => ({ q, pid }))),
  );
</script>

{#if gs.ruleset.enableQuests}
  <section class="quests" aria-label={t("ui.royal_quests")}>
    <h3>{t("ui.royal_quests")}</h3>
    <ul>
      {#each gs.revealedQuestIds as q (q)}
        {@const def = session.ctx.quest(q)}
        {@const prog = viewer ? getQuestProgress(session.ctx, gs, viewer, q) : null}
        {@const left = questRoundsLeft(gs, q)}
        <li class="quest" class:ready={claimable.has(q)}>
          <div class="illustration"><QuestArt id={def.conditionId} /></div>
          <div class="head">
            <strong>{t(`quest.${q}.name`)}</strong>
            <span class="renown">+{def.renown} <ToolIcon name="crown" size={14} label={t("ui.renown")} /></span>
          </div>
          <p class="description">{describe(q)}</p>
          <div class="meta">
          {#if left !== null}
            <p class="expiry" class:soon={left === 1}>
              <ToolIcon name="hourglass" size={13} />
              {left === 1 ? t("ui.quest_expires_next_round") : t("ui.quest_expires_in", { count: left })}
            </p>
          {/if}
          {#if prog}
            {@const percent = Math.round((100 * prog.current) / prog.target)}
            <div class="progress">
              <div class="bar" role="progressbar" aria-label={t("ui.quest_progress", { name: t(`quest.${q}.name`) })} aria-valuemin="0" aria-valuemax={prog.target} aria-valuenow={prog.current}>
                <span style="width: {percent}%"></span>
              </div>
              <span class="percent" aria-hidden="true">{percent}%</span>
            </div>
          {/if}
          </div>
          {#if claimable.has(q)}
            <button class="primary" onclick={() => session.perform({ type: "claim_quest", questId: q })}>{t("action.claim")}</button>
          {/if}
        </li>
      {/each}
      {#if gs.revealedQuestIds.length === 0}<li class="none">{t("ui.all_quests_have_been_claimed")}</li>{/if}
    </ul>
    {#if claimed.length}
      <h4>{t("ui.completed")}</h4>
      <ul class="done">
        {#each claimed as c}
          <li>{t(`quest.${c.q}.name`)} — {gs.players[c.pid]?.displayName}</li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <p class="off">{t("ui.royal_quests_are_not_used")}</p>
{/if}

<style>
  h3,
  h4 {
    margin: 0 0 0.3rem;
    font: 700 0.8rem/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0 0 0.6rem;
    display: grid;
    gap: 0.4rem;
  }
  li {
    background: var(--paper-sheet);
    border: 1px solid var(--edge);
    border-radius: 11px;
    padding: 0.6rem 0.65rem;
    box-shadow: inset 0 0 0 3px #fff9e8, inset 0 0 0 4px #b5944d33, 0 2px 4px #3c291c18;
  }
  li.ready {
    border: 1px solid #2d8a3a;
    box-shadow: 0 0 0 1px #2d8a3a;
    background: #eaf7e6;
  }
  .quest {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    column-gap: 0.6rem;
    row-gap: 0.2rem;
  }
  .illustration {
    grid-column: 1;
    grid-row: 1 / 3;
    align-self: start;
  }
  .head, .description { grid-column: 2; }
  .meta, .quest > button { grid-column: 1 / -1; }
  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.2rem 0.6rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    justify-content: space-between;
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
  .expiry {
    font-size: 0.75rem;
    font-style: italic;
    opacity: 0.75;
  }
  .expiry.soon {
    color: #9a3b12;
    opacity: 1;
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
  .progress {
    display: flex;
    flex: 1;
    min-width: 4.5rem;
    align-items: center;
    gap: 0.45rem;
  }
  .percent {
    min-width: 3ch;
    font-size: 0.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
    text-align: right;
  }
  .done li {
    font-size: 0.8rem;
    padding: 0.2rem 0.4rem;
  }
  .off,
  .none {
    font-size: 0.85rem;
    opacity: 0.7;
  }
</style>
