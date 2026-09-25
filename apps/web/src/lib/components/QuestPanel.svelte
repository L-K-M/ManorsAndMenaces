<script lang="ts">
  import { getQuestProgress, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import ToolIcon from "./ToolIcon.svelte";
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
        <li class:ready={claimable.has(q)}>
          <div class="head">
            <strong>{t(`quest.${q}.name`)}</strong>
            <span class="renown">+{def.renown} <ToolIcon name="crown" size={14} label={t("ui.renown")} /></span>
          </div>
          <p>{describe(q)}</p>
          {#if prog}
            <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={prog.target} aria-valuenow={prog.current}>
              <span style="width: {(100 * prog.current) / prog.target}%"></span>
            </div>
          {/if}
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
    background: var(--paper);
    border: 1px solid #0002;
    border-radius: 8px;
    padding: 0.4rem 0.55rem;
  }
  li.ready {
    border: 2px solid #2d8a3a;
    background: #eaf7e6;
  }
  .head {
    display: flex;
    justify-content: space-between;
  }
  .renown {
    color: #8a6400;
    font-weight: 700;
  }
  p {
    margin: 0.15rem 0 0.3rem;
    font-size: 0.85rem;
  }
  .bar {
    height: 6px;
    background: #0001;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.3rem;
  }
  .bar span {
    display: block;
    height: 100%;
    background: #2d8a3a;
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
