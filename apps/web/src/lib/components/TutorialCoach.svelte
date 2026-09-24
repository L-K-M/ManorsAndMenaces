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
    todo: string;
    done: (s: GameState) => boolean;
  }
  const steps: Step[] = [
    { text: t("tutorial.1"), todo: "Place your first Manor on a highlighted Site, then a free Route.", done: (s) => getPlayerHoldings(s, me).length >= 1 && (s.players[me]?.routeIds.length ?? 0) >= 1 },
    { text: t("tutorial.5"), todo: "Place your second Manor and its Route. You'll receive a resource from each Region it touches.", done: (s) => getPlayerHoldings(s, me).length >= 2 && (s.players[me]?.routeIds.length ?? 0) >= 2 },
    { text: t("tutorial.2"), todo: "Select one of your flags, then pick a highlighted Region. Confirm your Banners.", done: (s) => getPlayerBanners(s, me).some((b) => b.regionId) },
    { text: t("tutorial.3"), todo: "Look at the Next Harvest box — that's exactly what you'll get next turn. End your first turn: click “Assign Banners”, confirm, then “End Turn”.", done: (s) => s.status === "playing" && (s.players[me]?.firstHarvestSkipped ?? false) && s.activePlayerId !== me },
    { text: t("tutorial.4"), todo: "Regions show capacity pips. When the AI has Banners next to your Holdings, the Royal Writ lets you send them home (1 Essence + a bribe).", done: (s) => (s.players[me]?.stats.resourcesHarvestedTotal ?? 0) > 0 },
    { text: t("tutorial.6"), todo: "The Toll Troll blocks its Region. Use “Hire a Warden” (1 Essence + 1 Grain) to move it onto someone else's Banner.", done: (s) => (s.players[me]?.stats.menacesMoved ?? 0) > 0 || s.round >= 5 },
    { text: t("tutorial.7"), todo: "Build a Route (1 Timber + 1 Stone) toward a free Site, then a Manor (1 Grain + 1 Timber + 1 Stone). Use the Market if you're short.", done: (s) => getPlayerHoldings(s, me).length >= 3 },
    { text: t("tutorial.9"), todo: "Upgrade a Manor to a Stronghold (2 Grain + 2 Iron) for another Banner and +1 Renown.", done: (s) => getPlayerHoldings(s, me).some((h) => h.type === "stronghold") },
    { text: t("tutorial.8"), todo: "In the standard game, Royal Quests and cards add more ways to score. You're ready — play on to 10 Renown!", done: () => false },
  ];
  let index = $state(0);
  $effect(() => {
    const s = session.draft;
    while (index < steps.length - 1 && steps[index]?.done(s)) index++;
  });
  let minimized = $state(false);
</script>

<aside class="coach" class:minimized aria-live="polite" aria-label="Tutorial">
  <header>
    <strong>Tutorial · {index + 1}/{steps.length}</strong>
    <button class="ghost" onclick={() => (minimized = !minimized)}>{minimized ? "Show" : "Hide"}</button>
    <button class="ghost" onclick={onfinish}>End tutorial</button>
  </header>
  {#if !minimized}
    <p class="lesson">{steps[index]?.text}</p>
    <p class="todo">→ {steps[index]?.todo}</p>
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
