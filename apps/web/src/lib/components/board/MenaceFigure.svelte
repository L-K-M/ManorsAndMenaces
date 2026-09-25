<script lang="ts">
  // A Menace as a little painted miniature on a round base (spec §49: each
  // Menace has its own silhouette and idle animation). Drawn around 0,0 in
  // about a 48-unit box so the highlight rings around the Menace still fit.
  // Colours are player-neutral; the idle motion is off whenever animation is.
  import type { MenaceType } from "@manors-menaces/rules";

  let { type, animate }: { type: MenaceType; animate: boolean } = $props();
</script>

<g class="figure {type}" class:idle={animate} data-menace={type}>
  <circle r="22" class="hit-area" />
  <ellipse cx="2.5" cy="16.5" rx="18" ry="5.5" class="cast" />
  <ellipse cy="14" rx="16.5" ry="5.2" class="base" />
  <ellipse cy="13" rx="14.5" ry="3.9" class="base-top" />

  {#if type === "toll_troll"}
    <g class="body">
      <path class="skin shade" d="M-9,13 L-9,6 L-3,6 L-3,13 Z M3,13 L3,6 L9,6 L9,13 Z" />
      <path class="skin halo" d="M-13,8 C-15,-3 -9,-11 0,-11 C9,-11 15,-5 14,6 C13,10 -12,11 -13,8 Z" />
      <ellipse cx="1" cy="1" rx="7" ry="5.5" class="belly" />
      <path class="cloth" d="M-12.5,5 L12.5,5 L10.5,9.5 L3,8 L0,11 L-3,8 L-10.5,9.5 Z" />
      <path class="skin" d="M-8,-16 L-12.5,-19.5 L-8.5,-12 Z M4,-16 L8.5,-19.5 L4.5,-12 Z" />
      <circle cx="-2" cy="-13" r="6.8" class="skin" />
      <path class="brow" d="M-6.5,-16.5 L-3,-15.5 M3,-16.5 L-0.5,-15.5" />
      <circle cx="-4.4" cy="-14.2" r="1" class="eye" />
      <circle cx="0.6" cy="-14.2" r="1" class="eye" />
      <ellipse cx="-1.8" cy="-11" rx="2.8" ry="2.2" class="skin nose" />
      <path class="tusk" d="M-5,-8.4 L-4.4,-10 L-3.8,-8.4 Z M0.4,-8.4 L1,-10 L1.6,-8.4 Z" />
      <path class="arm" d="M11,-4 C15,-2 16,2 14,5" />
      <g class="club">
        <path class="wood" d="M13,5 L18,-8" />
        <path class="club-head" d="M16.4,-5 C14.5,-11 17,-17.5 21,-16 C24.5,-14.5 23,-8 19.5,-4.5 Z" />
      </g>
    </g>
  {:else if type === "highwayman"}
    <g class="body">
      <path class="cloak halo" d="M-12,13 C-11,3 -9,-5 -7,-11 C-6,-16 -3,-20 1,-22 C3,-23 6,-22 7,-19 C6,-18 6,-15 7,-11 C9,-5 11,3 12,13 Z" />
      <path class="fold" d="M-3,-5 C-4,2 -5,8 -6,13 M3,-5 C4,2 5,8 6,13" />
      <path class="hood" d="M-4.8,-11 C-4.8,-16.5 4.8,-16.5 4.8,-11 C4.8,-6.8 -4.8,-6.8 -4.8,-11 Z" />
      <ellipse cx="-1.9" cy="-11.6" rx="1.1" ry="0.7" class="glint" />
      <ellipse cx="1.9" cy="-11.6" rx="1.1" ry="0.7" class="glint" />
      <circle cx="0" cy="-6" r="1.4" class="clasp" />
      <path class="strap" d="M-11,-1 L-14.5,3" />
      <rect x="-17.5" y="3" width="6" height="7" rx="1.2" class="lantern" />
      <path class="lantern-top" d="M-17,3 L-14.5,0.6 L-12,3 Z" />
      <path class="blade" d="M10.5,0 L18,-9" />
    </g>
  {:else if type === "young_dragon"}
    <g class="body">
      <path class="wing" d="M2,-4 L9,-21 L11.5,-13.5 L16,-19 L16.5,-10 L22,-12.5 L16,0 Z" />
      <path class="wing-rib" d="M9,-21 L6,-5 M16,-19 L10,-3 M22,-12.5 L13,-1" />
      <path class="scales halo" d="M-10,5 C-10,-3 -3,-6 4,-6 C12,-6 16,-1 15,6 C14,11 -9,12 -10,5 Z" />
      <path class="scales tail" d="M14,6 C18,12 8,15 -2,14 C-9,13.4 -13,11 -13,7" />
      <path class="scales" d="M-13,7 L-17.5,4 L-12,2.5 Z" />
      <path class="belly" d="M-7,8 C-3,11.5 7,11.5 12,6 C7,8.5 -2,9 -7,6 Z" />
      <path class="spine" d="M-2,-5 L0,-8.5 L2,-5.8 Z M4.5,-5.9 L7,-9 L8.5,-5.4 Z M10.5,-4.2 L13.5,-6.4 L13.6,-2.4 Z" />
      <path class="scales neck" d="M-4,-2 C-8,-6 -9,-11 -8,-15" />
      <path class="scales" d="M-13.5,-16.5 C-13.5,-21 -7.5,-23 -4,-20.5 C-1.5,-18.5 -2,-14.8 -5,-13.8 L-11.5,-12.6 C-13.6,-13.4 -14,-15 -13.5,-16.5 Z" />
      <path class="horn" d="M-6.5,-21 L-4,-26.5 L-3.4,-19.6 Z M-9.5,-21.6 L-9,-26 L-7,-21 Z" />
      <circle cx="-7.8" cy="-18" r="1.5" class="dragon-eye" />
      <circle cx="-8.2" cy="-18" r="0.6" class="eye" />
      <path class="nostril" d="M-12.6,-16.4 L-11.6,-16.8" />
    </g>
  {:else if type === "bog_witch"}
    <g class="body">
      <path class="robe halo" d="M-15,13 C-14,4 -12,-3 -9.5,-7.5 L-3,-7.5 C-1,-3 1,4 2,13 Z" />
      <path class="hair" d="M-10.5,-11 C-12.5,-7 -11.5,-4 -9.5,-2.5 M-2,-11 C-0.5,-7 -1.5,-4 -2.8,-2.5" />
      <circle cx="-6.2" cy="-10.5" r="4" class="witch-skin" />
      <path class="witch-skin" d="M-9.8,-10.8 L-12.8,-9.2 L-9.6,-8.8 Z" />
      <circle cx="-7.4" cy="-11" r="0.8" class="eye" />
      <ellipse cx="-6" cy="-13.8" rx="8.4" ry="2.1" class="hat" />
      <path class="hat" d="M-10.6,-14 C-8.4,-18 -7.4,-24 -2.6,-29 C-3.6,-24 -2.8,-18 -1.4,-14 Z" />
      <path class="hat-band" d="M-9.8,-15.6 C-7,-16.6 -4.4,-16.6 -2,-15.8" />
      <path class="spoon" d="M4,-11 L8.5,3" />
      <path class="arm robe" d="M-5,-4 C-1,-3 2,-5 5,-7" />
      <path class="cauldron" d="M0.5,3.5 C0,13 18,13 17.5,3.5 Z" />
      <path class="cauldron-leg" d="M3,11 L2,13.5 M15,11 L16,13.5" />
      <ellipse cx="9" cy="3.5" rx="9" ry="2.5" class="rim" />
      <ellipse cx="9" cy="3.5" rx="7.2" ry="1.6" class="brew" />
      <circle cx="7" cy="0.6" r="1.6" class="bubble b1" />
      <circle cx="11.4" cy="-1" r="1.1" class="bubble b2" />
    </g>
  {:else if type === "goblin_tinkers"}
    <g class="body">
      <path class="cart halo" d="M1,-2 L19,-2 L18,7 L2,7 Z" />
      <path class="plank" d="M1.6,1.5 L18.6,1.5 M7,-2 L7,7 M13,-2 L13,7" />
      <path class="handle" d="M1.5,1 L-3,4" />
      <path
        class="gear"
        d="M7.2,-9.6 L8.8,-9.6 L9.1,-8.2 L10.3,-7.6 L11.4,-8.6 L12.5,-7.5 L11.5,-6.4 L12.1,-5.2 L13.5,-4.9 L13.5,-3.3 L12.1,-3 L11.6,-2 L4.4,-2 L3.9,-3 L2.5,-3.3 L2.5,-4.9 L3.9,-5.2 L4.5,-6.4 L3.5,-7.5 L4.6,-8.6 L5.7,-7.6 L6.9,-8.2 Z"
      />
      <circle cx="8" cy="-4.4" r="1.6" class="gear-hole" />
      <path class="wrench" d="M15,-2 L18.5,-11" />
      <path class="wrench-head" d="M17,-12.6 L18.8,-14.4 L20.8,-12.2 L20,-11.6 L19.2,-12.4 L18.4,-11.6 Z" />
      <circle cx="10" cy="9" r="4.6" class="wheel" />
      <circle cx="10" cy="9" r="1.3" class="hub" />
      <g class="goblin g1">
        <path class="tunic halo" d="M-13,12.5 C-14,5 -12,0 -8,-1 C-4,0 -3,5 -3.5,12.5 Z" />
        <path class="gob-skin" d="M-11.5,-6 L-17,-9.4 L-11.5,-3.4 Z M-3.5,-6 L2,-9.4 L-3.5,-3.4 Z" />
        <circle cx="-7.5" cy="-5.2" r="4.8" class="gob-skin" />
        <path class="cap" d="M-12,-7 C-11,-12 -4,-12 -3,-7 Z" />
        <circle cx="-9.2" cy="-5" r="0.9" class="gob-eye" />
        <circle cx="-5.8" cy="-5" r="0.9" class="gob-eye" />
        <path class="grin" d="M-9.4,-2.4 Q-7.5,-1.2 -5.6,-2.4" />
      </g>
      <g class="goblin g2">
        <path class="gob-skin" d="M12.5,-12.5 L8.4,-15 L12.4,-10.6 Z M18.5,-12.5 L22.6,-15 L18.6,-10.6 Z" />
        <circle cx="15.5" cy="-11.6" r="3.6" class="gob-skin halo" />
        <circle cx="14.3" cy="-11.8" r="0.7" class="gob-eye" />
        <circle cx="16.7" cy="-11.8" r="0.7" class="gob-eye" />
        <path class="goggles" d="M12.4,-14 L18.6,-14" />
      </g>
    </g>
  {/if}
</g>

<style>
  .figure {
    --ink: #22190e;
  }
  /* Zero specificity, so each part's own class below can override it. */
  :where(.figure) :where(path, circle, ellipse, rect) {
    stroke: var(--ink);
    stroke-width: 1.1;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  /* A cream rim around the main silhouette keeps it readable on any terrain. */
  .figure .halo {
    paint-order: stroke;
    stroke: #fff8e6;
    stroke-width: 3.4;
  }
  .hit-area {
    fill: transparent;
    stroke: none;
  }
  .figure .cast {
    fill: #1d160c;
    opacity: 0.28;
    stroke: none;
  }
  .base {
    fill: #5d4a32;
  }
  .base-top {
    fill: #8a7656;
    stroke: none;
  }
  .eye {
    fill: #1b140b;
    stroke: none;
  }

  /* Toll Troll: mossy stone-grey, club in hand. */
  .skin {
    fill: #8c9a66;
  }
  .skin.shade {
    fill: #66733f;
  }
  .belly {
    fill: #a9b67f;
    stroke: none;
  }
  .nose {
    fill: #9fad72;
  }
  .brow {
    fill: none;
    stroke-width: 1.3;
  }
  .tusk {
    fill: #f6efd8;
    stroke-width: 0.6;
  }
  .cloth {
    fill: #7b5a36;
  }
  .arm {
    fill: none;
    stroke: #8c9a66;
    stroke-width: 4;
  }
  .wood {
    stroke: #5b3d22;
    stroke-width: 2.6;
  }
  .club-head {
    fill: #7a5530;
  }

  /* Highwayman: dark hooded cloak, lantern and blade. */
  .cloak {
    fill: #3e4252;
  }
  .fold {
    fill: none;
    stroke: #262935;
  }
  .hood {
    fill: #121319;
  }
  .glint {
    fill: #f6d56f;
    stroke: none;
  }
  .clasp {
    fill: #c9a646;
  }
  .strap {
    stroke-width: 1.4;
  }
  .lantern {
    fill: #f3c14e;
  }
  .lantern-top {
    fill: #3e4252;
  }
  .blade {
    stroke: #c7ccd4;
    stroke-width: 1.8;
  }

  /* Young Dragon: copper scales, curled around itself, wing raised. */
  .wing {
    fill: #8a3a1e;
  }
  .wing-rib {
    fill: none;
    stroke: #5c2310;
    stroke-width: 0.8;
  }
  .scales {
    fill: #cf6a2e;
  }
  .scales.tail,
  .scales.neck {
    fill: none;
    stroke: #cf6a2e;
    stroke-width: 5.4;
  }
  .scales.neck {
    stroke-width: 6;
  }
  .dragon-eye {
    fill: #fff0a0;
    stroke-width: 0.6;
  }
  .nostril {
    stroke-width: 0.8;
  }
  .spine,
  .horn {
    fill: #f1e1bd;
    stroke-width: 0.7;
  }
  .young_dragon .belly {
    fill: #f2cf8c;
  }

  /* Bog Witch: tall hat, green face, bubbling cauldron. */
  .robe {
    fill: #4c6b58;
  }
  .arm.robe {
    fill: none;
    stroke: #4c6b58;
    stroke-width: 3;
  }
  .witch-skin {
    fill: #a9c381;
  }
  .hair {
    fill: none;
    stroke: #cfcfc4;
    stroke-width: 1.8;
  }
  .hat {
    fill: #2c3a32;
  }
  .hat-band {
    fill: none;
    stroke: #9a5a9c;
    stroke-width: 1.6;
  }
  .spoon {
    stroke: #7a5530;
    stroke-width: 1.6;
  }
  .cauldron {
    fill: #2c2c2c;
  }
  .cauldron-leg {
    stroke-width: 1.6;
  }
  .rim {
    fill: #474747;
  }
  .brew {
    fill: #8bd46f;
    stroke: none;
  }
  .bubble {
    fill: #c2f3a6;
    stroke-width: 0.6;
  }

  /* Goblin Tinkers: two goblins and a cart of cogs. */
  .cart {
    fill: #a06f3e;
  }
  .plank {
    fill: none;
    stroke: #6b4726;
    stroke-width: 0.8;
  }
  .handle {
    stroke: #6b4726;
    stroke-width: 1.8;
  }
  .gear {
    fill: #b0b3b8;
    stroke-width: 0.8;
  }
  .gear-hole {
    fill: #6b6e73;
    stroke: none;
  }
  .wrench,
  .wrench-head {
    fill: #8f949b;
    stroke: #8f949b;
    stroke-width: 1.8;
  }
  .wrench-head {
    stroke: var(--ink);
    stroke-width: 0.6;
  }
  .wheel {
    fill: #4a3520;
  }
  .hub {
    fill: #b0b3b8;
    stroke-width: 0.6;
  }
  .tunic {
    fill: #7b5a36;
  }
  .gob-skin {
    fill: #74a13d;
  }
  .cap {
    fill: #b24f2e;
  }
  .gob-eye {
    fill: #f7e26b;
    stroke-width: 0.4;
  }
  .grin {
    fill: none;
    stroke-width: 0.8;
  }
  .goggles {
    stroke: #c9a646;
    stroke-width: 1.4;
  }

  /* Idle motion, only while animation is on (Board passes `animate`). Each
     Menace fidgets briefly and then holds still for most of its cycle: the
     board is one SVG, so every animated frame repaints it, and Chrome skips
     the repaint while a keyframe value holds. Cycle lengths differ so the
     five never move in step. */
  .idle .body {
    transform-origin: 0 13px;
    animation: squash 6.2s ease-in-out infinite;
  }
  .idle.toll_troll .club {
    transform-origin: 14px 4px;
    animation: swing 6.2s ease-in-out infinite;
  }
  .idle.highwayman .body {
    animation: lean 7.4s ease-in-out infinite;
  }
  .idle.young_dragon .body {
    animation-duration: 5.6s;
  }
  .idle.young_dragon .wing {
    transform-origin: 4px -3px;
    animation: flap 5.6s ease-in-out infinite;
  }
  .idle.bog_witch .body {
    animation: none;
  }
  .idle.bog_witch .bubble {
    animation: bubble 4.8s ease-in infinite;
  }
  .idle.bog_witch .b2 {
    animation-delay: -0.7s;
  }
  .idle.goblin_tinkers .body {
    animation: none;
  }
  .idle .goblin {
    transform-origin: 0 12px;
    animation: hop 4.2s ease-in-out infinite;
  }
  .idle .g2 {
    animation-delay: -2.1s;
  }
  @keyframes squash {
    0%,
    82%,
    100% {
      transform: none;
    }
    88% {
      transform: scale(1.04, 0.95);
    }
    94% {
      transform: scale(0.98, 1.03);
    }
  }
  @keyframes swing {
    0%,
    82%,
    100% {
      transform: none;
    }
    90% {
      transform: rotate(-8deg);
    }
  }
  @keyframes lean {
    0%,
    80%,
    100% {
      transform: none;
    }
    87% {
      transform: rotate(-3deg);
    }
    94% {
      transform: rotate(2deg);
    }
  }
  @keyframes flap {
    0%,
    78%,
    100% {
      transform: none;
    }
    84%,
    94% {
      transform: rotate(-10deg);
    }
    89% {
      transform: rotate(-2deg);
    }
  }
  @keyframes bubble {
    0%,
    72% {
      transform: none;
      opacity: 1;
    }
    90% {
      transform: translateY(-6px);
      opacity: 0;
    }
    90.1% {
      transform: none;
      opacity: 0;
    }
    100% {
      transform: none;
      opacity: 1;
    }
  }
  @keyframes hop {
    0%,
    80%,
    100% {
      transform: none;
    }
    87% {
      transform: translateY(-2.5px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .idle * {
      animation: none;
    }
  }
</style>
