<script lang="ts">
  import { RESOURCE_TYPES, getPlayerHoldings, getRenown } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { currentActor } from "../game/session.svelte.js";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";
  import ResourceIcon from "./ResourceIcon.svelte";
  import ToolIcon from "./ToolIcon.svelte";

  let { session }: { session: GameSession } = $props();
  const gs = $derived(session.draft);
  const actor = $derived(currentActor(gs));
</script>

<section class="players" aria-label={t("ui.players")}>
  {#each gs.turnOrder as pid (pid)}
    {@const p = gs.players[pid]}
    {@const seat = session.seat(pid)}
    {@const theme = PLAYER_THEMES[seat?.color ?? 0] ?? PLAYER_THEMES[0]!}
    {#if p}
      <article class="player" class:active={actor === pid} style="--pc: {theme.color}; --pl: {theme.light}">
        <header>
          <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true"><path d={emblemPath(theme.shape, 8)} fill={theme.color} stroke={theme.dark} stroke-width="1.5" /></svg>
          <strong>{p.displayName}</strong>
          {#if seat?.kind === "ai"}<span class="tag">AI · {seat.aiLevel}</span>{/if}
          {#if session.transport.kind === "online" && seat?.kind === "human"}
            <span class="presence" class:on={session.presence[pid]} title={session.presence[pid] ? t("ui.online") : t("ui.offline")}>
              {session.presence[pid] ? t("ui.online") : t("ui.offline")}
            </span>
          {/if}
          <span class="renown" title={t("ui.renown")}>
            <span class="crown" aria-hidden="true"><ToolIcon name="crown" size={15} /></span>{getRenown(session.ctx, gs, pid)}<small>/{gs.ruleset.targetRenown}</small>
          </span>
        </header>
        <div class="res" aria-label={t("ui.resources")}>
          {#each RESOURCE_TYPES as r}
            <span class="r"><ResourceIcon resource={r} size={18} /> {p.resources[r]}</span>
          {/each}
        </div>
        <div class="meta">
          <span>{getPlayerHoldings(gs, pid).filter((h) => h.type === "manor").length} {t("holding.manor")}</span>
          <span>{getPlayerHoldings(gs, pid).filter((h) => h.type === "stronghold").length} {t("holding.stronghold")}</span>
          <span>{p.routeIds.length} routes</span>
          {#if gs.ruleset.enableCards}<span>{p.hand.length} cards</span>{/if}
        </div>
      </article>
    {/if}
  {/each}
</section>

<style>
  .players {
    display: grid;
    gap: 0.5rem;
  }
  .player {
    border: 2px solid color-mix(in srgb, var(--pc) 40%, transparent);
    border-left: 6px solid var(--pc);
    border-radius: 10px;
    padding: 0.45rem 0.6rem;
    background: var(--paper);
  }
  .player.active {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pc) 55%, transparent);
    background: color-mix(in srgb, var(--pl) 25%, var(--paper));
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .tag {
    font-size: 0.7rem;
    background: #0001;
    border-radius: 4px;
    padding: 0 0.3rem;
  }
  .presence {
    font-size: 0.7rem;
    border-radius: 4px;
    padding: 0 0.3rem;
    background: #0001;
    opacity: 0.7;
  }
  .presence.on {
    background: #d8f0d2;
    opacity: 1;
  }
  .renown {
    margin-left: auto;
    font-weight: 700;
    font-size: 1.1rem;
  }
  .renown small {
    font-weight: 400;
    opacity: 0.6;
  }
  .crown {
    color: #b08500;
    margin-right: 0.15rem;
  }
  .res {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    margin-top: 0.3rem;
    font-variant-numeric: tabular-nums;
  }
  .r {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    font-size: 0.78rem;
    opacity: 0.75;
    margin-top: 0.2rem;
  }
</style>
