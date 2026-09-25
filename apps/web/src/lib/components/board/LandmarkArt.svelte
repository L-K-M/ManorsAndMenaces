<script lang="ts">
  // A small illustration per landmark (spec §49), standing up and to the left
  // of its Site so a Holding built there stands in front of it rather than on
  // top of it. Player-neutral colours; decorative, so it takes no pointer
  // events (the Site's own hit area covers it).
  import type { LandmarkId } from "@manors-menaces/rules";

  let { id }: { id: LandmarkId } = $props();
  const paintId = $props.id();
</script>

<g class="landmark-art {id}" data-landmark={id} transform="translate(-22,-8) scale(0.9)" pointer-events="none"
  style="--stone-paint: url(#{paintId}-stone); --slate-paint: url(#{paintId}-slate); --thatch-paint: url(#{paintId}-thatch)">
  <defs>
    <linearGradient id="{paintId}-stone" x2="0.8" y2="1">
      <stop stop-color="#fff6d9" /><stop offset="0.5" stop-color="#e8d3a7" /><stop offset="1" stop-color="#b5986b" />
    </linearGradient>
    <linearGradient id="{paintId}-slate" x2="0.9" y2="0.7">
      <stop stop-color="#8295a3" /><stop offset="0.4" stop-color="#4c6273" /><stop offset="1" stop-color="#283b50" />
    </linearGradient>
    <linearGradient id="{paintId}-thatch" x2="0.3" y2="1">
      <stop stop-color="#edcb74" /><stop offset="0.55" stop-color="#bf8c45" /><stop offset="1" stop-color="#81522d" />
    </linearGradient>
  </defs>
  <ellipse cx="3" cy="11.5" rx="16" ry="4" class="cast" />
  {#if id === "royal_castle"}
    <path class="stone" d="M-6,11 L-6,-3 L-4,-3 L-4,-6 L-1,-6 L-1,-3 L1,-3 L1,-6 L4,-6 L4,-3 L6,-3 L6,11 Z" />
    <path class="stone" d="M-14,11 L-14,-7 L-6,-7 L-6,11 Z M6,11 L6,-7 L14,-7 L14,11 Z" />
    <path class="slate" d="M-15,-7 L-10,-19 L-5,-7 Z M5,-7 L10,-19 L15,-7 Z" />
    <path class="pole" d="M-10,-19 L-10,-25 M10,-19 L10,-25" />
    <path class="gold" d="M-10,-25 L-4.5,-23.2 L-10,-21.4 Z M10,-25 L15.5,-23.2 L10,-21.4 Z" />
    <path class="gate" d="M-3,11 L-3,4 A3,3 0 0,1 3,4 L3,11 Z" />
    <path class="slit" d="M-10,-2 L-10,2 M10,-2 L10,2" />
    <path class="masonry" d="M-13,5 h3 M-8,8 h2 M7,4 h3 M10,8 h3 M-4,0 h3 M2,3 h2" />
    <path class="roof-light" d="M-13.4,-8 L-10,-16 M7,-8 L10,-16" />
    <path class="gate-bars" d="M-1.3,5 v6 M1.3,5 v6 M-2.5,7 h5" />
    <path class="ivy" d="M-14,10 q-4,-3 -2,-6 q4,0 3,4 q4,-2 4,2 Z" />
  {:else if id === "wizard_tower"}
    <path class="lilac" d="M-5,11 L-4,-7 L4,-7 L5,11 Z" />
    <path class="lilac" d="M-6.5,-7 L-6.5,-9.5 L6.5,-9.5 L6.5,-7 Z" />
    <path class="night" d="M-7.5,-9.5 L-1,-26 Q1,-28 2,-25 L7.5,-9.5 Z" />
    <path class="star" d="M2,-29.5 L2.9,-27.1 L5.4,-26.8 L3.5,-25.2 L4.1,-22.8 L2,-24.1 L-0.1,-22.8 L0.5,-25.2 L-1.4,-26.8 L1.1,-27.1 Z" />
    <path class="star small" d="M-3,-16 L-2.4,-14.6 L-1,-14.4 L-2.1,-13.5 L-1.7,-12.1 L-3,-12.9 L-4.3,-12.1 L-3.9,-13.5 L-5,-14.4 L-3.6,-14.6 Z" />
    <path class="lit" d="M-1.6,-1 L-1.6,-3.4 A1.6,1.6 0 0,1 1.6,-3.4 L1.6,-1 Z M-1.8,7 L-1.8,4.4 A1.8,1.8 0 0,1 1.8,4.4 L1.8,7 Z" />
    <path class="door" d="M-2,11 L-2,8.6 L2,8.6 L2,11 Z" />
    <path class="masonry" d="M-3,1 h2 M2,4 h2 M-3,-5 h2" />
    <path class="roof-light" d="M-4,-11 L-0.5,-21" />
    <path class="window-glint" d="M-0.7,-3 v1 M-0.8,4.5 v1.5" />
  {:else if id === "adventurers_inn"}
    <path class="plaster" d="M-13,11 L-13,-2 L7,-2 L7,11 Z" />
    <path class="beam" d="M-13,-2 L7,-2 M-13,4 L7,4 M-13,-2 L-7,4 M-7,-2 L-13,4 M1,-2 L7,4 M7,-2 L1,4 M-3,-2 L-3,11" />
    <path class="thatch" d="M-15.5,-2 L-9,-13 L4,-13 L9.5,-2 Z" />
    <path class="thatch-line" d="M-11,-7 L6,-7" />
    <path class="door" d="M-7,11 L-7,6 L-4,6 L-4,11 Z" />
    <path class="lit" d="M2,6.5 L5,6.5 L5,9 L2,9 Z" />
    <path class="beam" d="M7,0 L15,0 M13,0 L13,2" />
    <rect x="10" y="2" width="6" height="6" rx="1" class="sign" />
    <path class="tankard" d="M11.6,3.4 L14,3.4 L14,7 L11.6,7 Z M14,4.2 Q15.4,4.4 14,6.2" />
    <path class="thatch-line" d="M-8,-11 l-3,7 M-4,-11 l-2,7 M0,-11 l1,7 M3,-11 l3,7" />
    <path class="window-glint" d="M3,7 v1.2" />
    <path class="ivy" d="M-13,11 q-4,-1 -3,-4 q3,-2 4,1 q3,-1 3,3 Z" />
  {:else if id === "dwarven_hall"}
    <path class="rock" d="M-15,11 C-15,-4 -8,-13 0,-13 C8,-13 15,-5 15,11 Z" />
    <path class="rock-light" d="M-12,4 C-12,-6 -6,-11 0,-11.4 C-5,-8 -8,-3 -8.6,4 Z" />
    <path class="frame" d="M-7,11 L-7,-2 L0,-8 L7,-2 L7,11 Z" />
    <path class="door" d="M-5,11 L-5,-1 L0,-5.4 L5,-1 L5,11 Z" />
    <path class="rune" d="M-2.6,1 L-2.6,7 M-2.6,3 L-1,1.6 M2.6,1 L2.6,7 M2.6,4 L1,5.4 M-1,-2 L0,-3.2 L1,-2" />
    <path class="masonry" d="M-12,1 l2,-4 3,-1 M7,-7 l3,4 -1,3" />
    <path class="steps" d="M-7,11 h14 M-8,13 h16" />
  {:else if id === "sacred_grove"}
    <path class="menhir" d="M-12,1 L-12.5,-6 Q-10,-8.5 -7.5,-6 L-8,1 Z M8,1 L7.5,-6 Q10,-8.5 12.5,-6 L12,1 Z" />
    <path class="trunk" d="M-1.5,10 L-1,-2 L1,-2 L1.5,10 Z" />
    <path class="leaf" d="M-9,-6 A5.5,5.5 0 0,1 -2,-14 A6,6 0 0,1 7,-12 A5.5,5.5 0 0,1 9,-4 A5.5,5.5 0 0,1 2,1 A6,6 0 0,1 -6,0 A5,5 0 0,1 -9,-6 Z" />
    <path class="leaf-light" d="M-6,-9 A3,3 0 0,1 -1.5,-12 A3,3 0 0,1 -3,-8 Z" />
    <path
      class="menhir"
      d="M-16,11 L-16.5,2 Q-14,-0.5 -11.5,2 L-12,11 Z M12,11 L11.5,2 Q14,-0.5 16.5,2 L16,11 Z M-5,12 L-5.4,5 Q-3,3 -0.6,5 L-1,12 Z M1.5,12 L1.1,5.4 Q3.4,3.4 5.8,5.4 L5.4,12 Z"
    />
    <path class="glow" d="M0,-18 L0.8,-16 L2.8,-15.4 L0.8,-14.8 L0,-12.8 L-0.8,-14.8 L-2.8,-15.4 L-0.8,-16 Z" />
    <path class="rune" d="M-14,4 v4 l1,-1 M14,4 v4 l-1,-1 M-3,7 v3 M3.4,7 v3" />
  {:else}
    <!-- LandmarkId is any string: a landmark without its own art gets a generic keep -->
    <path class="stone" d="M-14,11 L-14,-5 L-9,-5 L-9,-11 L-4,-11 L-4,-5 L4,-5 L4,-11 L9,-11 L9,-5 L14,-5 L14,11 Z" />
  {/if}
</g>

<style>
  :where(.landmark-art) :where(path, rect) {
    stroke: #3a2d1a;
    stroke-width: 1.2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .cast {
    fill: #1d160c;
    opacity: 0.25;
  }
  .stone {
    fill: var(--stone-paint);
  }
  .slate {
    fill: var(--slate-paint);
  }
  .pole {
    stroke-width: 1;
  }
  .gold {
    fill: #e0b64a;
    stroke-width: 0.7;
  }
  .gate,
  .door {
    fill: #4a3522;
  }
  .slit {
    stroke-width: 1.4;
  }
  .lilac {
    fill: #d8d0e6;
  }
  .night {
    fill: #2f3558;
  }
  .star {
    fill: #ffe27a;
    stroke-width: 0.5;
  }
  .star.small {
    stroke: none;
  }
  .lit {
    fill: #ffd76a;
    stroke-width: 0.8;
  }
  .plaster {
    fill: #f3e8cb;
  }
  .beam {
    fill: none;
    stroke: #5b3d22;
    stroke-width: 1.2;
  }
  .thatch {
    fill: var(--thatch-paint);
  }
  .thatch-line {
    stroke: #7d5a2c;
    stroke-width: 0.8;
  }
  .sign {
    fill: #7a5530;
    stroke-width: 0.8;
  }
  .tankard {
    fill: #f0c24e;
    stroke-width: 0.6;
  }
  .rock {
    fill: #938a7b;
  }
  .rock-light {
    fill: #b4ab9c;
    stroke: none;
  }
  .frame {
    fill: #c9bfae;
  }
  .rune {
    fill: none;
    stroke: #e8bf57;
    stroke-width: 1.1;
  }
  .menhir {
    fill: #b8b0a2;
  }
  .trunk {
    fill: #5b3d22;
  }
  .leaf {
    fill: #3f8034;
  }
  .leaf-light {
    fill: #86c267;
    stroke: none;
  }
  .glow {
    fill: #fffbe0;
    stroke-width: 0.5;
  }
  .masonry {
    fill: none;
    stroke: #977e58;
    stroke-width: 0.7;
  }
  .roof-light, .window-glint {
    fill: none;
    stroke: #fff4c7;
    stroke-width: 0.9;
  }
  .gate-bars {
    fill: none;
    stroke: #967045;
    stroke-width: 0.65;
  }
  .ivy {
    fill: #527c3b;
    stroke: #345331;
    stroke-width: 0.7;
  }
  .steps {
    fill: none;
    stroke: #c9bfae;
    stroke-width: 1.3;
  }
</style>
