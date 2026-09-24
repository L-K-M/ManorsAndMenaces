<script lang="ts">
  // Always-visible scoreboard (spec §53): every player's colour, name and
  // Renown, with the player whose turn it is marked. The full Players panel
  // stays one tap away; this strip is what you glance at between actions.
  import { getRenown } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { currentActor, type GameSession } from "../game/session.svelte.js";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";

  let { session }: { session: GameSession } = $props();
  const gs = $derived(session.draft);
  const actor = $derived(currentActor(gs));
</script>

<ol class="scoreboard" aria-label={t("ui.scoreboard")}>
  {#each gs.turnOrder as pid (pid)}
    {@const p = gs.players[pid]}
    {@const theme = PLAYER_THEMES[session.seat(pid)?.color ?? 0] ?? PLAYER_THEMES[0]!}
    {@const renown = getRenown(session.ctx, gs, pid)}
    {#if p}
      <li
        class:active={actor === pid}
        aria-current={actor === pid ? "true" : undefined}
        title={t("ui.renown_of", { name: p.displayName, renown, target: gs.ruleset.targetRenown })}
        style="--pc: {theme.color}; --pl: {theme.light}"
      >
        <svg width="16" height="16" viewBox="-9 -9 18 18" aria-hidden="true"
          ><path d={emblemPath(theme.shape, 7)} fill={theme.color} stroke={theme.dark} stroke-width="1.5" /></svg
        >
        <span class="name">{p.displayName}</span>
        <span class="renown" aria-hidden="true">{renown}<small>/{gs.ruleset.targetRenown}</small></span>
        <span class="sr">{t("ui.renown_count", { renown, target: gs.ruleset.targetRenown })}</span>
      </li>
    {/if}
  {/each}
</ol>

<style>
  .scoreboard {
    display: flex;
    gap: 0.35rem;
    margin: 0;
    padding: 0.1rem;
    list-style: none;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  li {
    flex: 0 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.55rem 0.15rem 0.4rem;
    border-radius: 999px;
    background: #fff1;
    border: 2px solid transparent;
    font-size: 0.85rem;
    line-height: 1.2;
    white-space: nowrap;
    transition:
      background 0.2s,
      border-color 0.2s;
  }
  li.active {
    background: color-mix(in srgb, var(--pl) 30%, transparent);
    border-color: var(--pc);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--pc) 35%, transparent);
    font-weight: 700;
  }
  svg {
    flex: none;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 8rem;
  }
  .renown {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .renown small {
    font-weight: 400;
    opacity: 0.7;
  }
  /* A narrow scoreboard row (phones) keeps the names and drops the target,
     which the Players panel still shows. */
  @container score (max-width: 26rem) {
    .renown small {
      display: none;
    }
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
