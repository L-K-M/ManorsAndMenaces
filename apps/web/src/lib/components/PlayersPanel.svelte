<script lang="ts">
  import { RESOURCE_TYPES, getHarvestPreview, getPlayerHoldings, getRenown } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { gainsText } from "../game/feed.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { currentActor } from "../game/session.svelte.js";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";
  import ResourceIcon from "./ResourceIcon.svelte";
  import ResourcePurse from "./ResourcePurse.svelte";

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
      <article class="player" class:active={actor === pid} data-player-target={pid} style="--pc: {theme.color}; --pl: {theme.light}">
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
            <span class="crown" aria-hidden="true">♛</span>{getRenown(session.ctx, gs, pid)}<small>/{gs.ruleset.targetRenown}</small>
          </span>
        </header>
        <div class="res" aria-label={t("ui.resources")}>
          <ResourcePurse {session} playerId={pid} />
        </div>
        {#if pid !== session.viewerId}
          <!-- A rival's committed Banners are public: what their next Harvest brings. -->
          {@const next = getHarvestPreview(session.ctx, gs, pid)}
          {@const warned = next.banners.filter((b) => b.notes.length > 0)}
          <div
            class="next"
            role="note"
            aria-label={t("ui.next_harvest_of", { name: p.displayName, items: next.total ? gainsText(next.totals) : t("ui.next_harvest_nothing") })}
          >
            <span class="label" aria-hidden="true">{t("ui.next_harvest_short")}</span>
            {#each RESOURCE_TYPES.filter((r) => next.totals[r] > 0) as r}
              <span class="r" aria-hidden="true">+{next.totals[r]}<ResourceIcon resource={r} size={15} label={false} /></span>
            {:else}
              <span class="none" aria-hidden="true">—</span>
            {/each}
            {#if warned.length}
              <span class="warn" title={warned.flatMap((b) => b.notes.map((n) => t(`harvest.${n}`))).join("; ")}>!</span>
            {/if}
          </div>
        {/if}
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
  .next {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem 0.5rem;
    margin-top: 0.25rem;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .next .label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.65;
  }
  .next .r {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
    font-weight: 600;
  }
  .next .none {
    opacity: 0.5;
  }
  .warn {
    display: inline-grid;
    place-items: center;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    background: #b6402e;
    color: #fff;
    font-weight: 800;
    font-size: 0.72rem;
    cursor: help;
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
