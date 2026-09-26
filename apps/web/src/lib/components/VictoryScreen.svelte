<script lang="ts">
  // End of game (spec §55): a dismissible victory screen with standings, awards,
  // Renown over time, a short recap and statistics. Closing it leaves the final
  // board to inspect; the "Game over" button brings it back.
  import { RESOURCE_TYPES, type PlayerId } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { endCauseOf } from "../game/log.js";
  import { buildMatchReport, renownChart, type AwardId, type MatchStats } from "../game/matchReport.js";
  import { planRematch } from "../game/rematch.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { animationScale } from "../stores/settings.svelte.js";
  import { MENACE_THEME, PLAYER_THEMES, RESOURCE_GLYPHS, emblemPath, type PlayerTheme } from "../theme.js";
  import ResourceIcon from "./ResourceIcon.svelte";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, tutorial = false, onexit, onrematch }: { session: GameSession; tutorial?: boolean; onexit: () => void; onrematch: () => void } = $props();

  // Only a local game has its full command history (online sessions start mid-match).
  const report = $derived(
    buildMatchReport(
      session.engine,
      session.authoritative,
      session.transport.kind === "local" ? { initial: session.initialState, commands: session.history } : null,
      endCauseOf(session.log),
    ),
  );
  const winner = $derived(report.standings[0]);
  // Ragnarök ended the world: the winner may be short of the target.
  const ragnarok = $derived(report.endCause === "ragnarok");
  const chart = $derived(
    report.timeline
      ? renownChart(
          report.timeline,
          report.targetRenown,
          report.standings.map((r) => r.playerId),
        )
      : null,
  );
  const barMax = $derived(Math.max(report.targetRenown, ...report.standings.map((r) => r.renown.total)));
  // Label the button with what App's rematch() will actually do.
  const rematchKind = $derived(
    planRematch({ transport: session.transport.kind, tutorial, seats: session.seats, mapId: session.mapId, initialState: session.initialState }).kind,
  );
  const rematchLabel = $derived(rematchKind === "lobby" ? t("ui.back_to_lobby") : rematchKind === "new_game" ? t("ui.play_real_game") : t("ui.play_again"));

  let open = $state(true);
  let dialog: HTMLDivElement | undefined = $state();
  let reopenButton: HTMLButtonElement | undefined = $state();

  function themeOf(playerId: PlayerId | null | undefined): PlayerTheme {
    return PLAYER_THEMES[session.seat(playerId)?.color ?? 0] ?? (PLAYER_THEMES[0] as PlayerTheme);
  }
  const wt = $derived(themeOf(winner?.playerId));

  // Confetti of leaves: decorative, so plain Math.random is fine here.
  const LEAF_COUNT = 56;
  // 0 when animations are off or reduced; 0.45 at "fast" shortens every beat.
  const animScale = $derived(animationScale());
  const celebrate = $derived(animScale > 0);
  const leaves = $derived.by(() => {
    // After Ragnarök, ash and embers fall instead of leaves.
    const palette = ragnarok
      ? [wt.color, "#3a3330", "#6b625c", "#d9541e", "#f39c34", "#8b8580", "#2b1d14"]
      : [wt.color, wt.light, wt.color, "#6fae5a", "#d19a12", "#b8662a", "#8fbf5a"];
    return Array.from({ length: LEAF_COUNT }, (_, i) => ({
      left: Math.random() * 100,
      delay: (Math.random() * 1.6 + (i % 3) * 0.35) * animScale,
      duration: (3.2 + Math.random() * 2.6) * animScale,
      drift: (Math.random() - 0.5) * 160,
      spin: 180 + Math.random() * 540,
      size: 12 + Math.random() * 11,
      color: palette[i % palette.length],
    }));
  });

  const AWARD_ICONS: Record<AwardId, string> = {
    master_builder: "M-9,9 L-9,-3 L-6,-3 L-6,-7 L-3,-7 L-3,-3 L3,-3 L3,-7 L6,-7 L6,-3 L9,-3 L9,9 Z M-2.5,9 L-2.5,3 A2.5,2.5 0 0,1 2.5,3 L2.5,9",
    bountiful_harvest: RESOURCE_GLYPHS.grain,
    menace_wrangler: MENACE_THEME.young_dragon.glyph,
    trolls_best_customer: MENACE_THEME.toll_troll.glyph,
    royal_pest: "M-8,-8 L6,-8 Q9,-8 9,-5 L9,8 L-5,8 Q-8,8 -8,5 Z M-4,-3 L5,-3 M-4,1 L5,1 M-4,5 L2,5",
    merchant_prince: "M0,-9 L0,8 M-6,8 L6,8 M-9,-5 L9,-5 M-9,-5 L-12,2 L-6,2 Z M9,-5 L6,2 L12,2 Z",
    spellbinder: RESOURCE_GLYPHS.essence,
  };

  const BREAKDOWN = [
    { key: "manors", label: "stat.renown_manors" },
    { key: "strongholds", label: "stat.renown_strongholds" },
    { key: "quests", label: "stat.renown_quests" },
    { key: "other", label: "stat.renown_other" },
  ] as const;

  const STAT_ROWS: { key: Exclude<keyof MatchStats, "harvestedByType">; label: string }[] = [
    { key: "harvested", label: "stat.harvested" },
    { key: "bestHarvest", label: "stat.best_harvest" },
    { key: "routes", label: "stat.routes" },
    { key: "manors", label: "stat.manors" },
    { key: "strongholds", label: "stat.strongholds" },
    { key: "writsIssued", label: "stat.writs" },
    { key: "wardensHired", label: "stat.wardens" },
    { key: "cardsPlayed", label: "stat.cards" },
    { key: "menacesMoved", label: "stat.menaces_moved" },
    { key: "marketTrades", label: "stat.market" },
    { key: "lostToMenaces", label: "stat.lost" },
  ];

  function nameOf(playerId: PlayerId): string {
    return report.standings.find((r) => r.playerId === playerId)?.name ?? "?";
  }

  /** Chart labels have room for about ten characters. */
  function shortName(playerId: PlayerId): string {
    const name = nameOf(playerId);
    return name.length > 10 ? `${name.slice(0, 9).trimEnd()}…` : name;
  }

  function roundSummary(k: number): string {
    if (!report.timeline) return "";
    const values = report.standings.map((r) => `${r.name} ${report.timeline?.series[r.playerId]?.[k] ?? 0}`).join(", ");
    return `${t("ui.round_axis")} ${report.timeline.rounds[k]}: ${values}`;
  }

  function close() {
    open = false;
  }

  // Focus the dialog when it opens, and the Game over button when it closes.
  $effect(() => {
    if (open) dialog?.focus();
    else reopenButton?.focus();
  });

  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !dialog) return;

    const items = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, [tabindex]:not([tabindex='-1'])")];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#if open && winner}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
    {#if celebrate}
      <div class="leaves" aria-hidden="true">
        {#each leaves as leaf}
          <span
            class="leaf"
            style="left: {leaf.left}%; --delay: {leaf.delay}s; --dur: {leaf.duration}s; --drift: {leaf.drift}px; --spin: {leaf.spin}deg; --size: {leaf.size}px; background: {leaf.color}"
          ></span>
        {/each}
      </div>
    {/if}
    <div
      class="victory"
      class:celebrate
      class:ragnarok
      bind:this={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={ragnarok ? t("ui.victory_ragnarok") : t("ui.victory")}
      tabindex="-1"
      onkeydown={keydown}
      style="--pc: {wt.color}; --pl: {wt.light}; --pd: {wt.dark}; --anim-scale: {animScale}"
    >
      <header class="hero">
        <svg class="pennant" viewBox="-30 -4 60 84" aria-hidden="true">
          <rect x="-29" y="-3" width="58" height="5" rx="2.5" class="rod" />
          <path class="cloth" d="M-22,2 L22,2 L22,74 L0,60 L-22,74 Z" />
          <path d="M-18,2 L-18,66 M18,2 L18,66" class="trim" />
          <path d={emblemPath(wt.shape, 11)} transform="translate(0,30)" class="emblem" />
        </svg>
        <div class="title">
          <p class="eyebrow">{ragnarok ? t("ui.victory_ragnarok") : t("ui.victory")}</p>
          <h2>{winner.name}</h2>
          <p class="sub">
            {ragnarok
              ? t("ui.victory_subtitle_ragnarok", { renown: winner.renown.total, round: report.round })
              : t("ui.victory_subtitle", { renown: winner.renown.total, round: report.round })}
          </p>
        </div>
        <button class="close" aria-label={t("ui.close")} onclick={close}><ToolIcon name="close" size={20} /></button>
      </header>

      <div class="body">
        <div class="col">
          {#if ragnarok}<p class="note ragnarok-note">{t("ui.ragnarok_ending")}</p>{/if}
          <section class="sec-standings">
            <h3>{t("ui.final_standings")}</h3>
            <ol class="standings">
              {#each report.standings as r, i (r.playerId)}
                {@const th = themeOf(r.playerId)}
                {@const seat = session.seat(r.playerId)}
                <li style="--pc: {th.color}; --pd: {th.dark}" class:first={i === 0}>
                  <span class="rank">{i + 1}</span>
                  <svg width="24" height="24" viewBox="-12 -12 24 24" aria-hidden="true"
                    ><path d={emblemPath(th.shape, 8)} fill={th.color} stroke={th.dark} stroke-width="1.5" /></svg
                  >
                  <div class="who">
                    <div class="line">
                      <strong>{r.name}</strong>
                      {#if seat?.kind === "ai"}<span class="tag">{t("ui.computer")} · {t(`ui.${seat.aiLevel ?? "normal"}`)}</span>{/if}
                      <span class="total"><ToolIcon name="crown" size={14} /> {r.renown.total} <small>{t("ui.renown")}</small></span>
                    </div>
                    <div class="bar" aria-hidden="true">
                      {#each BREAKDOWN as b}
                        {#if r.renown[b.key] > 0}<span class="seg {b.key}" style="width: {(r.renown[b.key] / barMax) * 100}%"></span>{/if}
                      {/each}
                      <span class="goal" style="left: {(report.targetRenown / barMax) * 100}%"></span>
                    </div>
                    <p class="parts">
                      {BREAKDOWN.filter((b) => r.renown[b.key] > 0)
                        .map((b) => t("stat.renown_from", { renown: r.renown[b.key], source: t(b.label) }))
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              {/each}
            </ol>
            <p class="legend" aria-hidden="true">
              {#each BREAKDOWN.slice(0, 3) as b}<span><i class="seg {b.key}"></i>{t(b.label)}</span>{/each}
              <span><i class="goal-key"></i>{t("ui.target")} {report.targetRenown}</span>
            </p>
          </section>

          {#if report.awards.length}
            <section class="sec-awards">
              <h3>{t("ui.awards")}</h3>
              <ul class="awards">
                {#each report.awards as a (a.id)}
                  {@const th = themeOf(a.playerId)}
                  <li class="award" style="--pc: {th.color}; --pl: {th.light}; --pd: {th.dark}">
                    <svg class="medal" viewBox="-15 -15 30 30" aria-hidden="true">
                      <circle r="14" />
                      <path d={AWARD_ICONS[a.id]} transform="scale(0.85)" />
                    </svg>
                    <div>
                      <strong>{t(`award.${a.id}.name`)}</strong>
                      <span class="recipient">{nameOf(a.playerId)}</span>
                      <small>{t(`award.${a.id}.desc`, { value: a.value })}</small>
                    </div>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
        <div class="col">
          {#if !report.historyComplete}<p class="note">{t("ui.results_partial")}</p>{/if}
          {#if chart && report.timeline}
            <section class="sec-chart">
              <h3>{t("ui.renown_over_time")}</h3>
              <svg
                class="renown-chart"
                viewBox="0 0 {chart.width} {chart.height}"
                role="img"
                aria-label={t("ui.renown_chart_summary", { round: report.round })}
              >
                {#each chart.yTicks as tick}
                  <line class="grid" x1={chart.plot.left} x2={chart.plot.right} y1={tick.y} y2={tick.y} />
                  <text class="axis" x={chart.plot.left - 6} y={tick.y + 3.5} text-anchor="end">{tick.value}</text>
                {/each}
                {#each chart.xTicks as tick}
                  <text class="axis" x={tick.x} y={chart.plot.bottom + 15} text-anchor="middle">{tick.label}</text>
                {/each}
                <text class="axis caption" x={chart.plot.right} y={chart.height - 1} text-anchor="end">{t("ui.round_axis")}</text>
                <line class="target" x1={chart.plot.left} x2={chart.plot.right} y1={chart.targetY} y2={chart.targetY} />
                <text class="axis target-label" x={chart.plot.left + 4} y={chart.targetY - 4}>{t("ui.target")} {report.targetRenown}</text>
                {#each chart.lines as line (line.playerId)}
                  {@const th = themeOf(line.playerId)}
                  {@const end = line.points.at(-1)}
                  <polyline points={line.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={th.color} class="series" />
                  {#if end}
                    <path d={emblemPath(th.shape, 5)} transform="translate({end[0]},{end[1]})" fill={th.color} stroke="var(--paper)" stroke-width="1.5" />
                    <text class="end-label" x={end[0] + 10} y={line.labelY + 4}>{shortName(line.playerId)} {report.timeline.series[line.playerId]?.at(-1)}</text
                    >
                  {/if}
                {/each}
                {#each report.timeline.rounds as _, k}
                  {@const x = chart.lines[0]?.points[k]?.[0] ?? 0}
                  {@const half = (chart.plot.right - chart.plot.left) / Math.max(1, report.timeline.rounds.length - 1) / 2}
                  <rect class="hover" x={x - half} y={chart.plot.top} width={half * 2} height={chart.plot.bottom - chart.plot.top}
                    ><title>{roundSummary(k)}</title></rect
                  >
                {/each}
              </svg>
            </section>
          {/if}

          {#if report.recap.length}
            <section class="sec-recap">
              <h3>{t("ui.chronicle_of_the_realm")}</h3>
              <ol class="recap">
                {#each report.recap as line}<li>{line}</li>{/each}
              </ol>
            </section>
          {/if}
        </div>

        <section class="sec-stats">
          <h3>{t("ui.statistics")}</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <td></td>
                  {#each report.standings as r (r.playerId)}
                    {@const th = themeOf(r.playerId)}
                    <th scope="col" style="--pc: {th.color}">
                      <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden="true"
                        ><path d={emblemPath(th.shape, 6)} fill={th.color} stroke={th.dark} stroke-width="1.2" /></svg
                      >
                      {r.name}
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each STAT_ROWS as row}
                  <tr>
                    <th scope="row">{t(row.label)}</th>
                    {#each report.standings as r (r.playerId)}
                      {@const value = r.stats[row.key]}
                      <td>
                        {#if value === null}<span title={t("stat.unknown")}>—</span>{:else}{value}{/if}
                        {#if row.key === "harvested" && r.stats.harvestedByType}
                          <span class="by-type">
                            {#each RESOURCE_TYPES.filter((res) => (r.stats.harvestedByType?.[res] ?? 0) > 0) as res}
                              <span><ResourceIcon resource={res} size={14} />{r.stats.harvestedByType[res]}</span>
                            {/each}
                          </span>
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer>
        <button class="ghost" onclick={close}>{t("ui.view_board")}</button>
        <span class="spacer"></span>
        <button onclick={onexit}>{t("ui.main_menu")}</button>
        <button class="primary" onclick={onrematch}>{rematchLabel}</button>
      </footer>
    </div>
  </div>
{:else if winner}
  <button class="game-over" bind:this={reopenButton} onclick={() => (open = true)} style="--pc: {wt.color}; --pd: {wt.dark}">
    <ToolIcon name="crown" size={16} />
    {t("ui.game_over_results")}
  </button>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: radial-gradient(ellipse at 50% 20%, #2b21158a, #1c160dc4);
    overflow: hidden;
  }
  .victory {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(62rem, 100%);
    max-height: min(52rem, calc(100dvh - 2rem));
    background: var(--paper);
    border: 3px solid #8a7650;
    border-radius: 16px;
    box-shadow: 0 24px 70px #000a;
    overflow: hidden;
  }
  .victory:focus {
    outline: none;
  }
  .victory:focus-visible {
    outline: 3px solid #1b5fd1;
  }

  /* ---------------------------------------------------------------- hero */
  .hero {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 0 1rem 0 1.4rem;
    min-height: 7.2rem;
    background:
      radial-gradient(circle at 12% 0%, #fff4 0 20%, transparent 55%),
      linear-gradient(115deg, var(--pd), var(--pc) 60%, color-mix(in srgb, var(--pc) 70%, #d19a12));
    color: #fffaf0;
    border-bottom: 3px solid #8a7650;
  }
  /* Ragnarök: the crown is won among the ashes. */
  .ragnarok .hero {
    background:
      radial-gradient(circle at 12% 0%, #f39c3444 0 20%, transparent 55%),
      linear-gradient(115deg, #1c1410, #4a2416 55%, color-mix(in srgb, var(--pc) 55%, #1c1410));
  }
  .pennant {
    flex: none;
    width: 4.6rem;
    margin-top: 4px;
    filter: drop-shadow(0 4px 6px #0006);
    transform-origin: 50% 0;
  }
  .pennant .rod {
    fill: #7a5a2a;
    stroke: #3d2a10;
    stroke-width: 1;
  }
  .pennant .cloth {
    fill: var(--paper);
    stroke: var(--pd);
    stroke-width: 1.5;
  }
  .pennant .trim {
    stroke: var(--pc);
    stroke-width: 2;
    fill: none;
    opacity: 0.5;
  }
  .pennant .emblem {
    fill: var(--pc);
    stroke: var(--pd);
    stroke-width: 1.5;
  }
  .title {
    flex: 1;
    min-width: 0;
    padding: 0.9rem 0 0.8rem;
  }
  .eyebrow {
    margin: 0;
    font: 700 0.85rem/1 var(--font-display);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .title h2 {
    margin: 0.2rem 0 0.15rem;
    font: 700 clamp(1.8rem, 5vw, 2.8rem) / 1.05 var(--font-display);
    text-shadow: 0 2px 0 #0004;
    overflow-wrap: anywhere;
  }
  .sub {
    margin: 0;
    font: italic 1.05rem var(--font-display);
  }
  .close {
    flex: none;
    margin-top: 0.6rem;
    min-width: 44px;
    color: #fffaf0;
    background: #0002;
    border-color: #fff6;
  }
  .close:hover:not(:disabled) {
    background: #0004;
  }
  .celebrate .pennant {
    animation: unfurl calc(0.9s * var(--anim-scale, 1)) cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }
  .celebrate .title {
    animation: rise calc(0.6s * var(--anim-scale, 1)) calc(0.35s * var(--anim-scale, 1)) ease-out both;
  }
  @keyframes unfurl {
    from {
      transform: scaleY(0.05);
    }
    to {
      transform: none;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  /* ---------------------------------------------------------------- leaves */
  .leaves {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }
  .leaf {
    position: absolute;
    top: -6%;
    width: var(--size);
    height: calc(var(--size) * 0.6);
    border-radius: 0 100% 0 100%;
    box-shadow: inset -2px -1px 0 #0002;
    opacity: 0;
    animation: fall var(--dur) var(--delay) ease-in forwards;
  }
  @keyframes fall {
    0% {
      opacity: 0;
      transform: translate(0, 0) rotate(0);
    }
    8% {
      opacity: 0.95;
    }
    85% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translate(var(--drift), 108vh) rotate(var(--spin));
    }
  }

  /* ---------------------------------------------------------------- body */
  .body {
    overflow-y: auto;
    padding: 0.8rem 1.2rem 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.6rem 1.6rem;
    align-content: start;
  }
  /* Two independent columns, so a short one leaves no gap in the other. */
  .col {
    display: grid;
    gap: 0.6rem;
    align-content: start;
    min-width: 0;
  }
  .sec-stats {
    grid-column: 1 / -1;
  }
  section {
    min-width: 0;
  }
  h3 {
    margin: 0.2rem 0 0.45rem;
    font: 700 1.05rem/1.2 var(--font-display);
    color: #5a3e22;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  h3::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, #8a765088, transparent);
  }

  /* standings */
  .standings {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .standings li {
    display: grid;
    grid-template-columns: 1.6rem 24px minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.55rem;
    border-radius: 10px;
    border-left: 5px solid var(--pc);
    background: color-mix(in srgb, var(--pc) 7%, var(--paper));
  }
  .standings li.first {
    background: color-mix(in srgb, var(--pc) 16%, var(--paper));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--pc) 45%, transparent);
  }
  .rank {
    font: 700 1.2rem/1 var(--font-display);
    text-align: center;
    color: #5a3e22;
  }
  .first .rank {
    color: #b07d05;
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    min-width: 0;
  }
  .line strong {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The name keeps its room; the AI tag gives way first. */
  .tag {
    flex: 0 100 auto;
    min-width: 1.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.7rem;
    background: #0001;
    border-radius: 4px;
    padding: 0 0.3rem;
    white-space: nowrap;
  }
  .total {
    margin-left: auto;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .total small {
    font-weight: 400;
    opacity: 0.7;
  }
  .bar {
    position: relative;
    display: flex;
    gap: 2px;
    height: 9px;
    margin: 0.25rem 0 0.15rem;
    border-radius: 5px;
    background: #0000000d;
  }
  .seg {
    display: inline-block;
    height: 100%;
  }
  .bar .seg:first-child {
    border-radius: 5px 0 0 5px;
  }
  /* The goal marker is always the bar's last span, so the last segment is the one before it. */
  .bar .seg:nth-last-of-type(2) {
    border-top-right-radius: 5px;
    border-bottom-right-radius: 5px;
  }
  .seg.manors {
    background: #cdb27a;
  }
  .seg.strongholds {
    background: #7a5a2a;
  }
  .seg.quests {
    background: #d9a520;
  }
  .seg.other {
    background: #9a9489;
  }
  .goal {
    position: absolute;
    top: -3px;
    bottom: -3px;
    border-left: 2px dashed #5a3e22aa;
  }
  .parts {
    margin: 0;
    font-size: 0.78rem;
    opacity: 0.8;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.8rem;
    margin: 0.4rem 0 0;
    font-size: 0.75rem;
    opacity: 0.85;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .legend i {
    width: 12px;
    height: 8px;
    border-radius: 2px;
  }
  .legend .goal-key {
    width: 0;
    height: 12px;
    border-left: 2px dashed #5a3e22aa;
    border-radius: 0;
  }

  /* awards */
  .awards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
    gap: 0.45rem;
  }
  .award {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.45rem 0.55rem;
    border-radius: 10px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--pl) 35%, var(--paper)), var(--paper));
    border: 1.5px solid color-mix(in srgb, var(--pc) 45%, #8a7650);
  }
  .medal {
    flex: none;
    width: 2.4rem;
    height: 2.4rem;
  }
  .medal circle {
    fill: var(--pc);
    stroke: #d9a520;
    stroke-width: 2;
  }
  .medal path {
    fill: #fffaf044;
    stroke: #fffaf0;
    stroke-width: 1.6;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .award div {
    display: grid;
    min-width: 0;
    line-height: 1.2;
  }
  .award strong {
    font: 700 0.98rem/1.15 var(--font-display);
  }
  .recipient {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--pd);
  }
  .award small {
    font-size: 0.75rem;
    opacity: 0.8;
  }

  /* chart */
  .renown-chart {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .renown-chart .grid {
    stroke: #8a765033;
    stroke-width: 1;
  }
  .renown-chart .axis {
    font-size: 12px;
    fill: #5a3e22;
    opacity: 0.8;
  }
  .renown-chart .caption {
    font-style: italic;
  }
  .renown-chart .target {
    stroke: #b07d05;
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
  }
  .renown-chart .target-label {
    fill: #8a5d00;
    opacity: 1;
    font-weight: 600;
  }
  .renown-chart .series {
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .renown-chart .end-label {
    font-size: 13px;
    font-weight: 600;
    fill: var(--ink);
  }
  .renown-chart .hover {
    fill: transparent;
  }
  .renown-chart .hover:hover {
    fill: #8a76501a;
  }

  /* recap */
  .recap {
    margin: 0;
    padding: 0.55rem 0.8rem 0.55rem 1.9rem;
    background: var(--parchment);
    border-radius: 10px;
    border: 1px solid #8a765055;
    font: 1rem/1.4 var(--font-display);
    display: grid;
    gap: 0.3rem;
  }
  .recap li::marker {
    color: #8a7650;
  }
  .recap li:last-child {
    font-weight: 700;
  }

  /* stats */
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  thead th {
    text-align: left;
    font-weight: 700;
    padding: 0.2rem 0.4rem 0.3rem;
    border-bottom: 3px solid var(--pc);
    white-space: nowrap;
  }
  tbody th {
    text-align: left;
    font-weight: 400;
    opacity: 0.85;
    padding: 0.2rem 0.6rem 0.2rem 0;
    white-space: nowrap;
  }
  tbody td {
    padding: 0.2rem 0.4rem;
  }
  tbody tr:nth-child(odd) {
    background: #8a765012;
  }
  .by-type {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.35rem;
    margin-left: 0.3rem;
    font-size: 0.75rem;
    opacity: 0.85;
  }
  .by-type span {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
  }
  .note {
    margin: 0.2rem 0 0;
    padding: 0.5rem 0.7rem;
    border-radius: 10px;
    border: 1px dashed #8a7650aa;
    font-size: 0.85rem;
    font-style: italic;
  }
  .ragnarok-note {
    border: 1px solid #d9541e;
    background: #fff0e8;
    color: #5a2210;
  }

  /* ---------------------------------------------------------------- footer */
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--parchment);
    border-top: 2px solid #8a765066;
  }
  .spacer {
    flex: 1;
  }
  footer .primary {
    padding-inline: 1.3rem;
  }

  .game-over {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 1.1rem;
    border-radius: 999px;
    border: 2px solid var(--pd);
    background: linear-gradient(115deg, var(--pd), var(--pc));
    color: #fffaf0;
    font: 700 1rem var(--font-display);
    box-shadow: 0 6px 18px #0005;
    white-space: nowrap;
  }
  .game-over:hover:not(:disabled) {
    background: linear-gradient(115deg, var(--pc), var(--pd));
  }

  @media (max-width: 760px) {
    .backdrop {
      padding: 0.4rem;
    }
    .victory {
      max-height: calc(100dvh - 0.8rem);
    }
    .body {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.6rem 0.8rem 0.8rem;
    }
    .hero {
      min-height: 0;
      gap: 0.6rem;
      padding: 0 0.6rem 0 0.8rem;
    }
    .pennant {
      width: 3.2rem;
    }
    .total small {
      display: none;
    }
    .title {
      padding: 0.6rem 0;
    }
    footer {
      padding: 0.5rem 0.6rem;
    }
    footer button {
      flex: 1 1 auto;
    }
    .spacer {
      display: none;
    }
  }
  /* Landscape phones: give the content the height. */
  @media (max-height: 500px) {
    .victory {
      max-height: calc(100dvh - 0.8rem);
    }
    .backdrop {
      padding: 0.4rem;
    }
    .hero {
      min-height: 0;
    }
    .pennant {
      width: 2.6rem;
    }
    .title {
      padding: 0.4rem 0;
    }
    .title h2 {
      margin: 0.1rem 0 0;
      font-size: 1.5rem;
    }
    .close {
      margin-top: 0.4rem;
    }
    footer {
      padding: 0.35rem 0.8rem;
    }
    footer button {
      min-height: 40px;
    }
  }
</style>
