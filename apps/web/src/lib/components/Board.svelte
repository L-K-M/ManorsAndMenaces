<script lang="ts">
  // The SVG board (spec §47). Layers, bottom to top: sea, terrain/Regions,
  // Routes, Sites/Holdings, Banners, Menaces, highlights. Every interactive
  // entity is a focusable button with an accessible name (spec §52).
  import { getPlayerBanners, type Banner, type HarvestPreview, type LegalActionSummary, type MenaceInstance } from "@manors-menaces/rules";
  import { onMount, untrack } from "svelte";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { onPick, type Highlights } from "../game/interaction.js";
  import { regionName } from "../game/log.js";
  import { ui, type Pick } from "../stores/ui.svelte.js";
  import { addedTargets, boundsOf, isDoubleTap, isDrag, pathPoints, wheelIntent, type Point, type Tap } from "../stores/camera.js";
  import { viewport, frameIfHidden, panScreen, pinch, resetView, setContainer, setWorld, zoomAtScreen } from "../stores/viewport.svelte.js";
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

  // The camera keeps the island (its coastline and extent) in view.
  const coast = $derived(pathPoints(map.coastline));
  const island = $derived(boundsOf(coast) ?? { x: 0, y: 0, w: map.width, h: map.height });
  $effect(() => setWorld(island, coast));
  // Every game opens on the whole island, not wherever the last one left off.
  onMount(() => resetView("instant"));

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
  $effect(() => setContainer(boardW, boardH));
  // The SVG has no viewBox, so its user units are CSS px; this maps the
  // camera's box (board units, same aspect as the board) onto them.
  const cameraTransform = $derived.by(() => {
    const { x, y, w } = viewport.box;
    const k = boardW / w;
    return `matrix(${k} 0 0 ${k} ${-x * k} ${-y * k})`;
  });

  // Active pointers in container px: where each went down and where it was
  // last seen. A press only becomes a drag once it has moved past a small
  // threshold from where it went down; until then it may still be a pick.
  const pointers = new Map<number, { down: Point; last: Point }>();
  /** The current gesture moved the camera, so it must not also pick. */
  let dragMoved = false;
  let lastTap: Tap | null = null;
  // The board's top-left in client px, measured once per gesture. Input
  // events arrive before the frame's camera write, so this read does not
  // force a layout.
  let origin: Point = { x: 0, y: 0 };

  function measure() {
    const r = svgEl?.getBoundingClientRect();
    if (r) origin = { x: r.left, y: r.top };
  }
  function local(e: MouseEvent): Point {
    return { x: e.clientX - origin.x, y: e.clientY - origin.y };
  }
  function capture(id: number) {
    try {
      svgEl?.setPointerCapture(id);
    } catch {
      // The pointer is already gone (released between events); nothing to capture.
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const intent = wheelIntent(e);
    if (intent.kind === "pan") return panScreen(intent.dx, intent.dy);
    measure();
    zoomAtScreen(intent.factor, local(e));
  }
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointers.size === 0) dragMoved = false;
    measure();
    const p = local(e);
    pointers.set(e.pointerId, { down: p, last: p });
    if (pointers.size < 2) return;
    // A second finger turns the press into a pinch: never a pick. Capture
    // both so the gesture keeps working when fingers leave the board.
    dragMoved = true;
    for (const id of pointers.keys()) capture(id);
  }
  function onPointerMove(e: PointerEvent) {
    const tracked = pointers.get(e.pointerId);
    if (!tracked) return;
    // A mouse or pen released outside the window never sent pointerup here.
    if (e.pointerType !== "touch" && e.buttons === 0) return release(e.pointerId);
    const cur = local(e);
    const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
    if (other) {
      pinch([tracked.last, other.last], [cur, other.last]);
      tracked.last = cur;
      return;
    }
    if (!dragMoved) {
      if (!isDrag(tracked.down, cur, e.pointerType)) return;
      // Capture only now, so a plain click still reaches the piece under it.
      dragMoved = true;
      capture(e.pointerId);
    }
    // On the first drag move `last` is still the press point, so the view
    // catches up with the whole distance moved so far.
    panScreen(cur.x - tracked.last.x, cur.y - tracked.last.y);
    tracked.last = cur;
  }
  function release(id: number) {
    pointers.delete(id);
  }
  // Listened for on the window: a press that crept off the board before it
  // became a drag was never captured, so its pointerup lands elsewhere.
  function onPointerUp(e: PointerEvent) {
    const tracked = pointers.get(e.pointerId);
    if (!tracked) return;
    release(e.pointerId);
    if (e.type !== "pointerup" || dragMoved || pointers.size > 0) return;
    // A tap on a highlighted target is a pick; it never starts a double tap.
    if ((e.target as Element | null)?.closest?.(".hl")) {
      lastTap = null;
      return;
    }
    const tap = { at: e.timeStamp, x: tracked.last.x, y: tracked.last.y };
    if (!isDoubleTap(lastTap, tap)) {
      lastTap = tap;
      return;
    }
    lastTap = null;
    zoomAtScreen(2, tracked.last, "animate");
  }

  function pick(p: Pick) {
    if (dragMoved) return;
    void onPick(session, legal, p);
  }

  // When new targets appear (a tool, a card step, the next setup placement)
  // and most of them are off-screen, glide to show them (spec §48). Targets
  // are keyed `kind:id`.
  function targetKeys(): string[] {
    const keyed = (kind: string, ids: Iterable<string>) => [...ids].map((id) => `${kind}:${id}`);
    return [
      ...keyed("site", hl.sites),
      ...keyed("route", hl.routes),
      ...keyed("region", hl.regions),
      ...keyed("banner", hl.banners),
      ...keyed("menace", hl.menaces),
      ...keyed("location", hl.locations),
    ];
  }
  function targetPoints(keys: readonly string[]): Point[] {
    const pts: Point[] = [];
    const site = (id: string) => sitesById.get(id);
    const routeMid = (id: string) => {
      const r = map.routes.find((x) => x.id === id);
      const a = r && site(r.siteA);
      const b = r && site(r.siteB);
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined;
    };
    const region = (id: string) => {
      const r = regionsById.get(id);
      return r && { x: r.labelX, y: r.labelY };
    };
    const point = (kind: string, id: string): Point | undefined => {
      if (kind === "site") return site(id);
      if (kind === "route") return routeMid(id);
      if (kind === "region") return region(id);
      if (kind === "banner") return bannerPositions.get(id);
      if (kind === "menace") {
        const m = gs.menaces[id];
        return m && menacePos(m);
      }
      if (kind === "location") {
        const [where = "", whereId = ""] = id.split(":");
        return point(where, whereId);
      }
      return undefined;
    };
    for (const k of keys) {
      const cut = k.indexOf(":");
      const p = point(k.slice(0, cut), k.slice(cut + 1));
      if (p) pts.push(p);
    }
    return pts;
  }
  let framed = new Set<string>();
  $effect(() => {
    const keys = targetKeys();
    const added = addedTargets(framed, keys);
    framed = new Set(keys);
    if (added.length) untrack(() => frameIfHidden(targetPoints(added)));
  });
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

<svelte:window onpointerup={onPointerUp} onpointercancel={onPointerUp} />

<svg
  bind:this={svgEl}
  bind:clientWidth={boardW}
  bind:clientHeight={boardH}
  class="board"
  class:hc={settings.highContrast}
  class:targeting
  data-camera="{viewport.box.x} {viewport.box.y} {viewport.box.w} {viewport.box.h}"
  role="application"
  aria-label={t("app.title")}
  style="--dur: {dur}"
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onlostpointercapture={(e) => e.target === svgEl && release(e.pointerId)}
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

  <!-- The camera: one transform on this group rather than a viewBox, because
       changing the viewBox relayouts the whole board every frame of a pan or
       zoom. The layers below are deliberately not indented under it. -->
  <g class="camera" transform={cameraTransform}>
  <!-- sea -->
  <rect x={viewport.sea.x} y={viewport.sea.y} width={viewport.sea.w} height={viewport.sea.h} fill="#bfe0f2" />
  <rect x={viewport.sea.x} y={viewport.sea.y} width={viewport.sea.w} height={viewport.sea.h} fill="url(#waves)" />
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
  </g>
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
