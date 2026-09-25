<script lang="ts">
  // The sea around the island: deeper water offshore, a shallow band, ripple
  // lines, surf and a sandy beach, plus the map's name cartouche, a compass
  // rose and a ship in open water. Static and decorative: it never takes
  // pointer events and draws under the Regions, which cover its inland half.
  import type { MapDefinition } from "@manors-menaces/content";
  import { coastArt } from "../../art/coast.js";

  let { map }: { map: MapDefinition } = $props();

  const art = $derived(coastArt(map));
  // Far beyond anything the camera can show, so the gradient never ends in view.
  const FAR = 4000;
</script>

<g class="coast" pointer-events="none" aria-hidden="true">
  <defs>
    <radialGradient id="sea-depth" gradientUnits="userSpaceOnUse" cx={art.centre.x} cy={art.centre.y} r={art.reach * 1.25}>
      <stop offset="0.62" stop-color="#4f86a0" stop-opacity="0" />
      <stop offset="1" stop-color="#4f86a0" stop-opacity="0.4" />
    </radialGradient>
  </defs>
  <rect x={art.centre.x - FAR} y={art.centre.y - FAR} width={FAR * 2} height={FAR * 2} fill="url(#sea-depth)" />
  <path d={map.coastline} class="shallows wide" />
  <path d={map.coastline} class="shallows" />
  {#each art.ripples as d, i}
    <path {d} class="ripple" style="opacity: {0.75 - i * 0.25}" />
  {/each}
  <path d={map.coastline} class="surf" />
  <path d={map.coastline} class="wet-sand" />
  <path d={map.coastline} class="sand" />

  {#if art.cartouche}
    {@const c = art.cartouche}
    <g class="cartouche" transform="translate({c.x},{c.y})">
      <!-- a ribbon with rolled ends -->
      <path
        class="roll"
        d="M{-c.w / 2 + 6},{-c.h / 2 + 8} q-14,-2 -16,10 q-2,14 14,{c.h - 22} z M{c.w / 2 - 6},{-c.h / 2 + 8} q14,-2 16,10 q2,14 -14,{c.h - 22} z"
      />
      <rect class="scroll" x={-c.w / 2 + 4} y={-c.h / 2 + 4} width={c.w - 8} height={c.h - 8} rx="3" />
      <rect class="scroll-rule" x={-c.w / 2 + 10} y={-c.h / 2 + 9} width={c.w - 20} height={c.h - 18} rx="2" />
      <text class="map-name" text-anchor="middle" y="6" textLength={Math.min(c.w - 44, map.name.length * 13)} lengthAdjust="spacingAndGlyphs">{map.name}</text>
    </g>
  {/if}

  {#if art.compass}
    {@const c = art.compass}
    <g class="compass" transform="translate({c.x},{c.y})">
      <circle r="24" class="ring" />
      <circle r="19" class="ring thin" />
      <path class="point dim" d="M0,0 L5,-5 L22,0 L5,5 Z M0,0 L-5,5 L-22,0 L-5,-5 Z M0,0 L5,5 L0,22 L-5,5 Z" />
      <path class="point" d="M0,0 L-5,-5 L0,-30 L5,-5 Z" />
      <path class="point light" d="M0,0 L0,-30 L5,-5 Z M0,0 L22,0 L5,5 Z M0,0 L0,22 L-5,5 Z M0,0 L-22,0 L-5,-5 Z" />
      <circle r="2.6" class="hub" />
    </g>
  {/if}

  {#if art.ship}
    {@const s = art.ship}
    <g class="ship" transform="translate({s.x},{s.y + 6})">
      <path class="wake" d="M-26,12 q8,-4 16,0 M14,12 q8,-4 16,0" />
      <path class="hull" d="M-18,4 L18,4 L12,13 L-13,13 Z" />
      <path class="hull-trim" d="M-17,7 L17,7" />
      <path class="mast" d="M-2,4 L-2,-24 M8,4 L8,-14" />
      <path class="sail" d="M-2,-22 Q9,-15 -2,-2 Z M8,-13 Q15,-8 8,0 Z" />
      <path class="pennant" d="M-2,-24 L6,-22 L-2,-20 Z" />
    </g>
  {/if}
</g>

<style>
  .shallows {
    fill: none;
    stroke: #d9f1f1;
    stroke-width: 44;
    stroke-linejoin: round;
    opacity: 0.45;
  }
  .shallows.wide {
    stroke-width: 84;
    opacity: 0.3;
  }
  .ripple {
    fill: none;
    stroke: #f2fafa;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-dasharray: 38 12 9 12;
  }
  .surf {
    fill: none;
    stroke: #f6fbf9;
    stroke-width: 28;
    stroke-linejoin: round;
    opacity: 0.8;
  }
  .wet-sand {
    fill: none;
    stroke: #bfa56b;
    stroke-width: 17;
    stroke-linejoin: round;
  }
  .sand {
    fill: none;
    stroke: #e8d7a6;
    stroke-width: 12;
    stroke-linejoin: round;
  }
  .roll {
    fill: #d9c49a;
    stroke: #6b5534;
    stroke-width: 1.5;
  }
  .scroll {
    fill: #fbf3dc;
    stroke: #6b5534;
    stroke-width: 1.6;
  }
  .scroll-rule {
    fill: none;
    stroke: #b8862b;
    stroke-width: 1;
  }
  .map-name {
    font: italic 700 21px/1 var(--font-display);
    fill: #3d2f1a;
    letter-spacing: 0.04em;
  }
  .compass .ring {
    fill: #fbf3dc;
    fill-opacity: 0.55;
    stroke: #6b5534;
    stroke-width: 1.4;
  }
  .compass .ring.thin {
    fill: none;
    stroke-width: 0.8;
    stroke-dasharray: 2 3;
  }
  .compass .point {
    fill: #8e2b22;
    stroke: #3d2f1a;
    stroke-width: 0.8;
    stroke-linejoin: round;
  }
  .compass .point.dim {
    fill: #6b5534;
  }
  .compass .point.light {
    fill: #fbf3dc;
    fill-opacity: 0.55;
    stroke: none;
  }
  .compass .hub {
    fill: #b8862b;
    stroke: #3d2f1a;
    stroke-width: 0.8;
  }
  .ship .wake {
    fill: none;
    stroke: #f2fafa;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .ship .hull {
    fill: #7a5230;
    stroke: #3a2616;
    stroke-width: 1.2;
    stroke-linejoin: round;
  }
  .ship .hull-trim {
    stroke: #d7b56b;
    stroke-width: 1.2;
  }
  .ship .mast {
    stroke: #3a2616;
    stroke-width: 1.4;
  }
  .ship .sail {
    fill: #fbf3dc;
    stroke: #6b5534;
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .ship .pennant {
    fill: #8e2b22;
  }
</style>
