<script lang="ts">
  // Interactive tutorial (spec §55): a real MVP game against one easy AI, with
  // a coach that advances when the player has actually done each thing.
  import { getPlayerBanners, getPlayerHoldings, type GameState } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";

  let { session, onfinish }: { session: GameSession; onfinish: () => void } = $props();
  const me = $derived(session.seats.find((s) => s.kind === "human")?.playerId ?? "");

  interface Step {
    text: string;
    /** i18n key of the task line (todo strings live in en.ts, spec §71). */
    taskKey: string;
    done: (s: GameState) => boolean;
  }
  const steps: Step[] = [
    { text: t("tutorial.1"), taskKey: "tutorial.task.1", done: (s) => getPlayerHoldings(s, me).length >= 1 && (s.players[me]?.routeIds.length ?? 0) >= 1 },
    { text: t("tutorial.5"), taskKey: "tutorial.task.2", done: (s) => getPlayerHoldings(s, me).length >= 2 && (s.players[me]?.routeIds.length ?? 0) >= 2 },
    { text: t("tutorial.2"), taskKey: "tutorial.task.3", done: (s) => getPlayerBanners(s, me).some((b) => b.regionId) },
    { text: t("tutorial.3"), taskKey: "tutorial.task.4", done: (s) => s.status === "playing" && (s.players[me]?.firstHarvestSkipped ?? false) && s.activePlayerId !== me },
    { text: t("tutorial.4"), taskKey: "tutorial.task.5", done: (s) => (s.players[me]?.stats.resourcesHarvestedTotal ?? 0) > 0 },
    { text: t("tutorial.6"), taskKey: "tutorial.task.6", done: (s) => (s.players[me]?.stats.menacesMoved ?? 0) > 0 || s.round >= 5 },
    { text: t("tutorial.7"), taskKey: "tutorial.task.7", done: (s) => getPlayerHoldings(s, me).length >= 3 },
    { text: t("tutorial.9"), taskKey: "tutorial.task.8", done: (s) => getPlayerHoldings(s, me).some((h) => h.type === "stronghold") },
    { text: t("tutorial.8"), taskKey: "tutorial.task.9", done: () => false },
  ];
  let index = $state(0);
  $effect(() => {
    const s = session.draft;
    while (index < steps.length - 1 && steps[index]?.done(s)) index++;
  });
  let minimized = $state(false);
</script>

<aside class="coach" class:minimized aria-live="polite" aria-label={t("ui.tutorial")}>
  <header>
    <strong>{t("tutorial.title", { current: index + 1, total: steps.length })}</strong>
    <button class="ghost" onclick={() => (minimized = !minimized)}>{minimized ? t("ui.show") : t("ui.hide")}</button>
    <button class="ghost" onclick={onfinish}>{t("ui.end_tutorial")}</button>
  </header>
  {#if !minimized}
    <p class="lesson">{steps[index]?.text}</p>
    <p class="todo">→ {t(steps[index]?.taskKey ?? "tutorial.task.1")}</p>
    <div class="dots" aria-hidden="true">{#each steps as _, i}<span class:on={i <= index}></span>{/each}</div>
  {/if}
</aside>

<style>
  .coach {
    position: absolute;
    right: 0.75rem;
    top: 0.75rem;
    width: min(22rem, calc(100% - 1.5rem));
    background: #fffdf3;
    border: 3px solid #d19a12;
    border-radius: 12px;
    padding: 0.6rem 0.8rem;
    box-shadow: 0 8px 24px #0003;
    z-index: 6;
  }
  header {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  header strong {
    flex: 1;
  }
  header button {
    min-height: 32px;
    font-size: 0.75rem;
  }
  .lesson {
    font-weight: 600;
  }
  .todo {
    font-size: 0.9rem;
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .dots span {
    width: 18px;
    height: 5px;
    border-radius: 3px;
    background: #0002;
  }
  .dots span.on {
    background: #d19a12;
  }
  @media (max-width: 900px) {
    .coach {
      top: auto;
      bottom: 0.75rem;
      left: 4.5rem;
      right: 0.75rem;
      width: auto;
    }
  }
</style>
