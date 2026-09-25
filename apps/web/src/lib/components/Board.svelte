<script lang="ts">
  // The SVG board (spec §47). Layers, bottom to top: sea, terrain/Regions,
  // Routes, Sites/Holdings, Banners, Menaces, highlights. Every interactive
  // entity is a focusable button with an accessible name (spec §52).
  import { getPlayerBanners, type Banner, type HarvestPreview, type LegalActionSummary, type MenaceInstance } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { onPick, type Highlights } from "../game/interaction.js";
  import { regionName } from "../game/log.js";
  import { ui, type Pick } from "../stores/ui.svelte.js";
  import { viewport, setFull, zoomAt, panBy } from "../stores/viewport.svelte.js";
  import { settings, animationScale } from "../stores/settings.svelte.js";
  import { MENACE_THEME, PLAYER_THEMES, RESOURCE_COLORS, RESOURCE_GLYPHS, emblemPath } from "../theme.js";

  // `legal`, `hl` and `preview` are derived once in GameScreen and shared.
  let {
    session,
    legal,
    hl,
    preview,
  }: { session: GameSession; legal: LegalActionSummary | null; hl: Highlights; preview: HarvestPreview | null } = $props();

  const map = $derived(session.map);
  const gs = $derived(session.draft);
  const sitesById = $derived(new Map(map.sites.map((s) => [s.id, s])));
  const regionsById = $derived(new Map(map.regions.map((r) => [r.id, r])));

  $effect(() => {
    if (viewport.full.w !== map.width || viewport.full.h !== map.height) setFull(map.width, map.height);
  });

  function playerTheme(playerId: string | null | undefined) {
    const seat = session.seat(playerId);
    return PLAYER_THEMES[seat?.color ?? 0] ?? PLAYER_THEMES[0]!;
  }

  // Banner positions: assigned Banners sit in slots around the Region label;
  // unassigned ones cluster at their Holding. During assignment the local
  // draft overrides the actor's Banners.
  const bannerRegion = (b: Banner): string | null => (b.id in ui.bannerDraft ? (ui.bannerDraft[b.id] ?? null) : b.regionId);
  const bannerPositions = $derived.by(() => {
    const out = new Map<string, { x: number; y: number }>();
    const byRegion = new Map<string, Banner[]>();
    const byHolding = new Map<string, Banner[]>();
    for (const b of Object.values(gs.banners)) {
      const r = bannerRegion(b);
      if (r) byRegion.set(r, [...(byRegion.get(r) ?? []), b]);
      else byHolding.set(b.holdingId, [...(byHolding.get(b.holdingId) ?? []), b]);
    }
    for (const [regionId, list] of byRegion) {
      const region = regionsById.get(regionId);
      if (!region) continue;
      list.sort((a, b) => a.id.localeCompare(b.id));
      list.forEach((b, i) => out.set(b.id, { x: region.labelX - 14 + i * 28 - (list.length - 1) * 0, y: region.labelY + 26 }));
    }
    for (const [holdingId, list] of byHolding) {
      const h = gs.holdings[holdingId];
      const site = h ? sitesById.get(h.siteId) : undefined;
      if (!site) continue;
      list.forEach((b, i) => out.set(b.id, { x: site.x + 16 + i * 12, y: site.y - 20 }));
    }
    return out;
  });

  const previewByRegion = $derived(new Map((preview?.banners ?? []).map((b) => [b.regionId, b])));

  // Pre-indexed lookups so per-frame template code stays O(1) instead of
  // scanning all holdings/banners for every site/region.
  const holdingBySite = $derived(new Map(Object.values(gs.holdings).map((h) => [h.siteId, h])));
  const bannerCountByRegion = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const b of Object.values(gs.banners)) {
      const r = bannerRegion(b);
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return counts;
  });

  function menacePos(m: MenaceInstance): { x: number; y: number } {
    const loc = m.location;
    if (loc.kind === "region") {
      const r = regionsById.get(loc.regionId);
      return r ? { x: r.labelX + 40, y: r.labelY + 4 } : { x: 0, y: 0 };
    }
    if (loc.kind === "site") {
      const s = sitesById.get(loc.siteId);
      return s ? { x: s.x - 22, y: s.y + 20 } : { x: 0, y: 0 };
    }
    const route = map.routes.find((r) => r.id === loc.routeId);
    const a = route && sitesById.get(route.siteA);
    const b = route && sitesById.get(route.siteB);
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  }

  const fogged = $derived(new Set(gs.activeEffects.filter((e) => e.kind === "fog").map((e) => (e.kind === "fog" ? e.routeId : ""))));

  // ------------------------------------------------------------------ input
  let svgEl: SVGSVGElement | undefined = $state();
  let boardW = $state(1);
  let boardH = $state(1);
  // On tall screens, pin the map to the top and leave room below for panels.
  const portrait = $derived(boardH > boardW * 1.1);
  const pointers = new Map<number, { x: number; y: number }>();
  let dragMoved = false;
  let pinchDist = 0;

  // Screen ↔ board coordinates via the SVG's own transform, so any
  // preserveAspectRatio alignment works.
  function toBoard(clientX: number, clientY: number): { x: number; y: number } {
    const m = svgEl?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function scaleFactor(): number {
    return svgEl?.getScreenCTM()?.a ?? 1;
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = toBoard(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }
  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) {
        const mid = toBoard((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(d / pinchDist, mid.x, mid.y);
      }
      pinchDist = d;
      dragMoved = true;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (!dragMoved && Math.hypot(dx, dy) < 4) return;
    if (!dragMoved) svgEl?.setPointerCapture(e.pointerId);
    dragMoved = true;
    const s = scaleFactor();
    panBy(dx / s, dy / s);
  }
  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  }

  function pick(p: Pick) {
    if (dragMoved) return;
    void onPick(session, legal, p);
  }
  function key(e: KeyboardEvent, p: Pick) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void onPick(session, legal, p);
    }
  }

  // While targets are highlighted, everything else stops catching clicks so a
  // short Route is not hidden behind the hit areas of its end Sites.
  const targeting = $derived(hl.sites.size + hl.routes.size + hl.regions.size + hl.banners.size + hl.menaces.size + hl.locations.size > 0);
  const dur = $derived(animationScale());
  const bannerLabel = (b: Banner) => {
    const owner = gs.players[b.ownerId]?.displayName ?? "";
    const r = bannerRegion(b);
    return `${owner}'s Banner, ${r ? `in ${regionName(map, r)}` : "at home"}${b.settled ? ", settled" : ""}`;
  };
  const myBanners = $derived(new Set(session.localActor ? getPlayerBanners(gs, session.localActor).map((b) => b.id) : []));
</script>

<svg
  bind:this={svgEl}
  bind:clientWidth={boardW}
  bind:clientHeight={boardH}
  class="board"
  class:hc={settings.highContrast}
  class:targeting
  viewBox="{viewport.box.x} {viewport.box.y} {viewport.box.w} {viewport.box.h}"
  preserveAspectRatio={portrait ? "xMidYMin meet" : "xMidYMid meet"}
  role="application"
  aria-label={t("app.title")}
  style="--dur: {dur}"
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <defs>
    <pattern id="waves" width="60" height="30" patternUnits="userSpaceOnUse">
      <path d="M0,15 Q15,5 30,15 T60,15" fill="none" stroke="#9cc9e6" stroke-width="2" opacity="0.6" />
    </pattern>
    <pattern id="hatch-grain" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
      <line x1="0" y1="0" x2="0" y2="10" stroke="#caa73a" stroke-width="2" opacity="0.35" />
    </pattern>
    <pattern id="hatch-timber" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="7" cy="7" r="3" fill="#3e7d33" opacity="0.35" />
    </pattern>
    <pattern id="hatch-stone" width="16" height="12" patternUnits="userSpaceOnUse">
      <path d="M0,12 L8,2 L16,12" fill="none" stroke="#7d776d" stroke-width="1.5" opacity="0.35" />
    </pattern>
    <pattern id="hatch-iron" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M0,0 L12,12 M12,0 L0,12" stroke="#4d5866" stroke-width="1" opacity="0.3" />
    </pattern>
    <pattern id="hatch-essence" width="18" height="18" patternUnits="userSpaceOnUse">
      <path d="M9,3 L10.5,7.5 L15,9 L10.5,10.5 L9,15 L7.5,10.5 L3,9 L7.5,7.5 Z" fill="#7a5bb8" opacity="0.3" />
    </pattern>
    <clipPath id="island-clip"><path d={map.coastline} /></clipPath>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>

  <!-- sea -->
  <rect x={-800} y={-600} width={map.width + 1600} height={map.height + 1200} fill="#bfe0f2" />
  <rect x={-800} y={-600} width={map.width + 1600} height={map.height + 1200} fill="url(#waves)" />
  <path d={map.coastline} fill="#e9dcb4" stroke="#b69e6a" stroke-width="18" transform="translate(0,0)" />

  <!-- terrain / regions -->
  <g class="layer-regions">
    {#each map.regions as region (region.id)}
      {@const colors = RESOURCE_COLORS[region.resource]}
      {@const occupants = bannerCountByRegion.get(region.id) ?? 0}
      {@const isHl = hl.regions.has(region.id) || hl.locations.has(`region:${region.id}`)}
      {@const pv = previewByRegion.get(region.id)}
      <g
        class="region"
        class:hl={isHl}
        role="button"
        tabindex={isHl || !targeting ? 0 : -1}
        aria-label="{region.name}, {t(`resource.${region.resource}`)}, capacity {region.capacity}, {occupants} Banner(s)"
        onclick={() => pick(isHl && hl.locations.has(`region:${region.id}`) && !hl.regions.has(region.id) ? { kind: "location", location: { kind: "region", regionId: region.id } } : { kind: "region", id: region.id })}
        onkeydown={(e) => key(e, { kind: "region", id: region.id })}
        onpointerenter={() => (ui.hoverRegionId = region.id)}
        onpointerleave={() => (ui.hoverRegionId = null)}
      >
        <g clip-path="url(#island-clip)">
          <path d={region.path} fill={colors.fill} stroke="#6b5a3a" stroke-width="2" stroke-linejoin="round" />
          <path d={region.path} fill="url(#hatch-{region.resource})" pointer-events="none" />
          {#if isHl}<path d={region.path} class="hl-fill" pointer-events="none" />{/if}
        </g>
        <g transform="translate({region.labelX},{region.labelY})" pointer-events="none">
          <circle r="17" fill="#fffaf0" stroke={colors.dark} stroke-width="2" />
          <path d={RESOURCE_GLYPHS[region.resource]} fill={region.resource === "grain" ? "none" : colors.dark} stroke={colors.dark} stroke-width={region.resource === "grain" ? 2 : 1} />
          <!-- capacity pips -->
          {#each Array.from({ length: region.capacity }) as _, i}
            <circle cx={-6 + i * 12 - (region.capacity - 1) * 0} cy="24" r="4" fill={i < occupants ? colors.dark : "#fffaf0"} stroke={colors.dark} stroke-width="1.5" opacity="0.8" />
          {/each}
          {#if settings.showRegionNames}
            <text y="-24" class="region-name" text-anchor="middle">{region.name}</text>
          {/if}
          {#if pv && pv.notes.length}
            <text y="48" class="note" text-anchor="middle">{pv.notes.map((n) => t(`harvest.${n}`)).join(" · ")}</text>
          {/if}
        </g>
      </g>
    {/each}
  </g>

  <!-- routes -->
  <g class="layer-routes">
    {#each map.routes as route (route.id)}
      {@const a = sitesById.get(route.siteA)}
      {@const b = sitesById.get(route.siteB)}
      {@const owner = gs.routeOwners[route.id]}
      {@const isHl = hl.routes.has(route.id) || hl.locations.has(`route:${route.id}`)}
      {#if a && b}
        <g
          class="route"
          class:hl={isHl}
          role="button"
          tabindex={isHl || !targeting ? 0 : -1}
          aria-label="{t(`route.${route.kind}`)} {owner ? `owned by ${gs.players[owner]?.displayName}` : 'unowned'}"
          onclick={() => pick(hl.locations.has(`route:${route.id}`) ? { kind: "location", location: { kind: "route", routeId: route.id } } : { kind: "route", id: route.id })}
          onkeydown={(e) => key(e, { kind: "route", id: route.id })}
        >
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="hit" />
          {#if owner}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a2d1a" stroke-width="13" stroke-linecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={playerTheme(owner).color} stroke-width="8" stroke-linecap="round" />
          {:else}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8a7650" stroke-width="4" stroke-dasharray={route.kind === "trail" ? "3 7" : "10 6"} stroke-linecap="round" opacity="0.75" />
          {/if}
          {#if route.kind === "bridge"}
            <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="5" fill="#8a7650" opacity="0.7" />
          {/if}
          {#if fogged.has(route.id)}
            <ellipse cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} rx="34" ry="16" fill="#f4f4f4" opacity="0.8" />
          {/if}
          {#if isHl}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="hl-line" />
          {/if}
        </g>
      {/if}
    {/each}
  </g>

  <!-- sites and holdings -->
  <g class="layer-sites">
    {#each map.sites as site (site.id)}
      {@const holding = holdingBySite.get(site.id)}
      {@const isHl = hl.sites.has(site.id) || hl.locations.has(`site:${site.id}`)}
      {@const theme = holding ? playerTheme(holding.ownerId) : null}
      <g
        class="site"
        class:hl={isHl}
        transform="translate({site.x},{site.y})"
        role="button"
        tabindex={isHl || !targeting ? 0 : -1}
        aria-label={holding
          ? `${t(`holding.${holding.type}`)} of ${gs.players[holding.ownerId]?.displayName}${site.landmarkId ? `, ${t(`landmark.${site.landmarkId}`)}` : ""}`
          : `Site${site.landmarkId ? `, ${t(`landmark.${site.landmarkId}`)}` : ""}${site.tradePost ? `, Trading Post (${t(`resource.${site.tradePost.resource}`)} 2:1)` : ""}`}
        onclick={() => pick(hl.locations.has(`site:${site.id}`) ? { kind: "location", location: { kind: "site", siteId: site.id } } : { kind: "site", id: site.id })}
        onkeydown={(e) => key(e, { kind: "site", id: site.id })}
      >
        <circle r="22" class="hit" />
        {#if site.landmarkId}
          <g transform="translate(0,-4)" pointer-events="none">
            <path d="M-14,10 L-14,-6 L-9,-6 L-9,-12 L-4,-12 L-4,-6 L4,-6 L4,-12 L9,-12 L9,-6 L14,-6 L14,10 Z" fill="#d8cbb0" stroke="#5a4a32" stroke-width="2" />
            <text y="30" class="landmark" text-anchor="middle">{t(`landmark.${site.landmarkId}`)}</text>
          </g>
        {/if}
        {#if site.tradePost}
          <g transform="translate(-22,-18)" pointer-events="none">
            <circle r="10" fill="#fffaf0" stroke="#7a5a1a" stroke-width="2" />
            <text y="4" text-anchor="middle" class="post">2:1</text>
          </g>
        {/if}
        {#if holding && theme}
          <g pointer-events="none" class="holding">
            {#if holding.type === "manor"}
              <path d="M-13,12 L-13,-2 L0,-14 L13,-2 L13,12 Z" fill={theme.color} stroke={theme.dark} stroke-width="2.5" />
              <path d="M-4,12 L-4,4 L4,4 L4,12" fill={theme.dark} />
            {:else}
              <path d="M-17,14 L-17,-8 L-12,-8 L-12,-14 L-6,-14 L-6,-8 L6,-8 L6,-14 L12,-14 L12,-8 L17,-8 L17,14 Z" fill={theme.color} stroke={theme.dark} stroke-width="2.5" />
              <path d="M-4,14 L-4,4 A4,4 0 0,1 4,4 L4,14" fill={theme.dark} />
            {/if}
            <path d={emblemPath(theme.shape, 4)} transform="translate(0,-26)" fill={theme.light} stroke={theme.dark} stroke-width="1.5" />
          </g>
        {:else}
          <circle r="7" fill="#fffaf0" stroke="#6b5a3a" stroke-width="2.5" pointer-events="none" />
        {/if}
        {#if isHl}<circle r="17" class="hl-ring" pointer-events="none" />{/if}
      </g>
    {/each}
  </g>

  <!-- banners -->
  <g class="layer-banners">
    {#each Object.values(gs.banners) as banner (banner.id)}
      {@const pos = bannerPositions.get(banner.id)}
      {@const theme = playerTheme(banner.ownerId)}
      {@const isHl = hl.banners.has(banner.id)}
      {@const selected = ui.selectedBannerId === banner.id}
      {#if pos}
        <g
          class="banner"
          class:hl={isHl}
          class:selected
          class:mine={myBanners.has(banner.id)}
          style="transform: translate({pos.x}px, {pos.y}px)"
          role="button"
          tabindex={isHl || !targeting ? 0 : -1}
          aria-label={bannerLabel(banner)}
          aria-pressed={selected}
          onclick={() => pick({ kind: "banner", id: banner.id })}
          onkeydown={(e) => key(e, { kind: "banner", id: banner.id })}
        >
          <rect x="-12" y="-26" width="26" height="30" class="hit" />
          <line x1="-6" y1="4" x2="-6" y2="-24" stroke="#3a2d1a" stroke-width="2.5" />
          <path d="M-6,-24 L12,-19 L-6,-12 Z" fill={theme.color} stroke={theme.dark} stroke-width="1.5" opacity={banner.settled ? 1 : 0.75} />
          <path d={emblemPath(theme.shape, 2.4)} transform="translate(0,-18)" fill={theme.light} pointer-events="none" />
          {#if !banner.settled}<circle cx="-6" cy="4" r="2.5" fill="#fffaf0" stroke={theme.dark} />{/if}
          {#if isHl || selected}<circle cx="0" cy="-12" r="17" class="hl-ring" pointer-events="none" />{/if}
        </g>
      {/if}
    {/each}
  </g>

  <!-- menaces -->
  <g class="layer-menaces">
    {#each Object.values(gs.menaces) as menace (menace.id)}
      {@const pos = menacePos(menace)}
      {@const theme = MENACE_THEME[menace.type]}
      {@const isHl = hl.menaces.has(menace.id)}
      {@const hoard = Object.entries(menace.state.hoard ?? {}).filter(([, n]) => (n ?? 0) > 0)}
      <g
        class="menace"
        class:hl={isHl}
        class:selected={ui.selectedMenaceId === menace.id}
        style="transform: translate({pos.x}px, {pos.y}px)"
        role="button"
        tabindex={isHl || !targeting ? 0 : -1}
        aria-label="{t(`menace.${menace.type}.name`)}: {t(`menace.${menace.type}.rules`)}"
        onclick={() => pick({ kind: "menace", id: menace.id })}
        onkeydown={(e) => key(e, { kind: "menace", id: menace.id })}
      >
        <title>{t(`menace.${menace.type}.name`)} — {t(`menace.${menace.type}.rules`)}</title>
        <circle r="19" fill="#fffaf0" stroke={theme.color} stroke-width="3" />
        <path d={theme.glyph} fill={theme.color} stroke="#1f1f1f" stroke-width="1" fill-rule="evenodd" />
        {#if hoard.length}
          <text y="32" text-anchor="middle" class="hoard">{hoard.map(([r, n]) => `${n}${RESOURCE_COLORS[r as keyof typeof RESOURCE_COLORS].label}`).join(" ")}</text>
        {/if}
        {#if isHl || ui.selectedMenaceId === menace.id}<circle r="24" class="hl-ring" pointer-events="none" />{/if}
      </g>
    {/each}
  </g>

  <!-- menace destinations on routes/sites are handled by their own layers; region destinations by regions -->
  {#if hl.locations.size > 0}
    <g class="layer-dests" pointer-events="none">
      {#each [...hl.locations] as k (k)}
        {#if k.startsWith("region:")}
          {@const r = regionsById.get(k.slice(7))}
          {#if r}<circle cx={r.labelX + 40} cy={r.labelY + 4} r="12" class="dest" />{/if}
        {/if}
      {/each}
    </g>
  {/if}
</svg>

<style>
  .board {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
    background: #bfe0f2;
    cursor: grab;
  }
  .board:active {
    cursor: grabbing;
  }
  .hit {
    fill: transparent;
    stroke: transparent;
    stroke-width: 22;
  }
  .region-name {
    font: 600 13px/1 var(--font-display);
    fill: #3d2f1a;
    paint-order: stroke;
    stroke: #fffaf0;
    stroke-width: 3px;
  }
  .note {
    font: 600 11px/1 var(--font-body);
    fill: #7a1d10;
    paint-order: stroke;
    stroke: #fffaf0;
    stroke-width: 3px;
  }
  .landmark {
    font: italic 600 12px/1 var(--font-display);
    fill: #3d2f1a;
    paint-order: stroke;
    stroke: #fffaf0;
    stroke-width: 3px;
  }
  .post {
    font: 700 9px/1 var(--font-body);
    fill: #7a5a1a;
  }
  .hoard {
    font: 700 12px/1 var(--font-body);
    fill: #7a1d10;
    paint-order: stroke;
    stroke: #fffaf0;
    stroke-width: 3px;
  }
  .hl-fill {
    fill: #fff6a8;
    opacity: 0.45;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .hl-line {
    stroke: #ffe14d;
    stroke-width: 10;
    stroke-linecap: round;
    opacity: 0.8;
    filter: url(#glow);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .hl-ring,
  .dest {
    fill: none;
    stroke: #ffcf1f;
    stroke-width: 4;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .targeting .region:not(.hl),
  .targeting .route:not(.hl),
  .targeting .site:not(.hl),
  .targeting .banner:not(.hl):not(.mine),
  .targeting .menace:not(.hl) {
    pointer-events: none;
  }
  .region.hl,
  .route.hl,
  .site.hl,
  .banner.hl,
  .menace.hl {
    cursor: pointer;
  }
  .banner,
  .menace {
    transition: transform calc(var(--dur) * 280ms) ease-out;
  }
  .menace {
    transition-duration: calc(var(--dur) * 450ms);
  }
  .banner.selected path {
    stroke: #ffcf1f;
    stroke-width: 3;
  }
  g[role="button"]:focus-visible {
    outline: none;
  }
  g[role="button"]:focus-visible .hit {
    stroke: #1b5fd1;
    stroke-width: 4;
    fill: rgba(27, 95, 209, 0.12);
  }
  .hc .region > g > path:first-child {
    stroke: #000;
    stroke-width: 3;
  }
  .hc .hl-fill {
    fill: #ffff00;
    opacity: 0.6;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.85;
    }
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .hl-fill,
    .hl-line,
    .hl-ring,
    .dest {
      animation: none;
    }
  }
</style>
