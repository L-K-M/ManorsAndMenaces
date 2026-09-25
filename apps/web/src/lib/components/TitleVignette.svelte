<script lang="ts">
  // Decorative backdrop for the title screens: the island realm with a
  // castle flying the four player banners, a napping dragon that puffs smoke
  // now and then, a bobbing ship and drifting clouds. Purely presentational
  // (aria-hidden, no pointer events). Motion is CSS only and stops entirely
  // when `animate` is false (Animation "Off" or Reduced motion) or when the
  // OS asks for reduced motion.
  import { PLAYER_THEMES } from "../theme.js";

  let { animate = true }: { animate?: boolean } = $props();

  // Clouds are separate compositor layers (HTML-positioned SVGs moved with
  // transforms), so their drift never repaints the scene.
  const CLOUDS = [
    { top: 7, scale: 1.1, duration: 150, delay: -40, rest: 6 },
    { top: 17, scale: 0.75, duration: 190, delay: -125, rest: 64 },
    { top: 27, scale: 0.95, duration: 170, delay: -85, rest: 30 },
    { top: 4, scale: 0.6, duration: 230, delay: -190, rest: 82 },
  ];

  // Flag poles on the castle: left tower, keep (two) and right tower.
  const POLES = [
    { x: 430, top: 296, base: 338 },
    { x: 470, top: 300, base: 362 },
    { x: 530, top: 314, base: 362 },
    { x: 570, top: 296, base: 338 },
  ];

  const FIRS = [
    [262, 668, 1],
    [292, 690, 1.2],
    [330, 672, 0.9],
    [352, 700, 1.1],
    [238, 704, 0.8],
    [1212, 700, 1.1],
    [1246, 682, 0.9],
    [1276, 712, 1.2],
    [1312, 690, 1],
    [1340, 720, 0.85],
    [660, 600, 0.8],
    [690, 612, 0.7],
    [1150, 760, 0.8],
    [1178, 778, 0.95],
    [900, 640, 0.75],
  ] as const;

  // A village below the castle, roofs in the player colours.
  const HOUSES = [
    { x: 424, y: 716, roof: 0 },
    { x: 466, y: 736, roof: 1 },
    { x: 530, y: 712, roof: 2 },
    { x: 574, y: 738, roof: 3 },
  ];
</script>

<div class="vignette" class:still={!animate} aria-hidden="true">
  <div class="sun"></div>
  {#each CLOUDS as c, i (i)}
    <div class="cloud-track" style="top: {c.top}%; --dur: {c.duration}s; --delay: {c.delay}s; --rest: {c.rest}vw">
      <svg class="cloud" viewBox="-10 -14 170 70" style="width: {c.scale * 11}rem">
        <path
          d="M6,44 C-4,40 0,24 16,24 C18,6 44,0 58,14 C68,-8 108,-8 114,16 C132,10 150,24 144,40 C150,46 146,52 136,52 L14,52 C4,52 0,48 6,44 Z"
          fill="#ffffff"
        />
        <path d="M14,52 L136,52 C146,52 150,46 144,40 C136,48 110,46 96,44 C76,50 44,50 28,44 C18,48 8,46 6,44 C0,48 4,52 14,52 Z" fill="#dcebf2" />
      </svg>
    </div>
  {/each}

  <svg class="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="tv-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9cfd8" />
        <stop offset="0.35" stop-color="#7db4c8" />
        <stop offset="1" stop-color="#4f8aa8" />
      </linearGradient>
      <linearGradient id="tv-land" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9cc56c" />
        <stop offset="1" stop-color="#6f9f4a" />
      </linearGradient>
      <linearGradient id="tv-hill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b3d27f" />
        <stop offset="1" stop-color="#86b35c" />
      </linearGradient>
      <linearGradient id="tv-dragon" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d65a3c" />
        <stop offset="1" stop-color="#a23a26" />
      </linearGradient>
      <g id="tv-fir">
        <path d="M0,-34 L11,-14 L6,-14 L15,2 L-15,2 L-6,-14 L-11,-14 Z" fill="#3f7a3a" stroke="#27502a" stroke-width="2" stroke-linejoin="round" />
        <path d="M-2,2 L-2,8 L2,8 L2,2" fill="#6b4a2a" />
      </g>
    </defs>

    <!-- Sea, with a hazy band on the horizon and far islands. -->
    <rect x="0" y="500" width="1600" height="400" fill="url(#tv-sea)" />
    <rect x="0" y="498" width="1600" height="10" fill="#e8f1ee" opacity="0.7" />
    <path d="M40,506 C90,470 150,462 210,482 C250,470 290,480 320,506 Z" fill="#9fb6bf" />
    <path d="M1300,506 C1340,480 1400,466 1460,478 C1500,470 1550,484 1580,506 Z" fill="#a7bcc3" />

    <!-- Distant mountains behind the island. -->
    <path d="M560,580 L660,452 L712,498 L800,392 L884,486 L940,440 L1060,580 Z" fill="#a4acb8" />
    <path d="M776,420 L800,392 L826,422 L812,416 L800,428 L788,416 Z M650,466 L660,452 L672,466 Z M932,450 L940,440 L950,452 Z" fill="#f4f4f0" />

    <!-- Island: shallows, sand, grass. -->
    <path
      id="tv-coast"
      d="M170,700 C180,620 260,575 360,560 C520,540 640,575 800,565 C960,555 1100,540 1240,560 C1360,578 1440,640 1430,705 C1420,780 1330,820 1180,830 C1000,845 880,815 740,828 C560,845 380,835 280,800 C200,772 165,745 170,700 Z"
      fill="none"
      stroke="#bfe3e2"
      stroke-width="44"
      stroke-linejoin="round"
      opacity="0.75"
    />
    <path
      d="M170,700 C180,620 260,575 360,560 C520,540 640,575 800,565 C960,555 1100,540 1240,560 C1360,578 1440,640 1430,705 C1420,780 1330,820 1180,830 C1000,845 880,815 740,828 C560,845 380,835 280,800 C200,772 165,745 170,700 Z"
      fill="url(#tv-land)"
      stroke="#e9d49c"
      stroke-width="14"
      stroke-linejoin="round"
    />

    <!-- Hills for the castle (left) and the dragon (right). -->
    <path transform="translate(-40,0)" d="M280,650 C330,548 420,472 500,468 C590,464 668,548 726,650 Z" fill="url(#tv-hill)" />
    <path transform="translate(30,0)" d="M920,660 C986,574 1068,530 1150,528 C1244,526 1324,586 1388,660 Z" fill="url(#tv-hill)" />

    <!-- Fields: grain with furrows, an essence meadow and a quarry. -->
    <g stroke-linejoin="round">
      <path d="M602,752 C640,742 700,736 748,740 L758,792 C704,790 650,794 612,802 Z" fill="#e6cd6c" stroke="#b89a3a" stroke-width="2" />
      <path d="M608,768 C650,759 704,754 752,756 M612,786 C654,777 706,772 756,774" fill="none" stroke="#c9ab4a" stroke-width="3" stroke-linecap="round" />
      <path d="M784,748 C830,742 870,744 902,752 L896,796 C860,790 820,792 790,798 Z" fill="#e6cd6c" stroke="#b89a3a" stroke-width="2" />
      <path d="M788,764 C830,758 868,760 900,768 M790,782 C828,776 864,777 898,784" fill="none" stroke="#c9ab4a" stroke-width="3" stroke-linecap="round" />
      <path d="M1000,712 C1040,700 1090,702 1122,716 L1112,764 C1076,752 1036,754 1006,764 Z" fill="#bca3dc" stroke="#7f64a8" stroke-width="2" />
      <path d="M1030,730 l4,-8 4,8 -4,8 Z M1086,744 l3,-6 3,6 -3,6 Z M1062,720 l3,-6 3,6 -3,6 Z" fill="#fff6d6" />
      <path d="M228,742 C252,730 300,728 330,740 L336,786 C300,792 262,792 236,784 Z" fill="#c9c2b4" stroke="#7d766a" stroke-width="2" />
      <path d="M248,770 l14,-12 16,4 4,14 -18,6 Z M290,752 l12,-8 12,6 -2,12 -16,2 Z" fill="#a39b8c" stroke="#6f685d" stroke-width="2" />
    </g>

    <!-- A dirt road from the castle gate through the village and east. -->
    <path
      d="M460,478 C470,560 470,620 496,690 C520,752 640,720 760,712 C880,704 960,690 1060,652"
      fill="none"
      stroke="#d9c08a"
      stroke-width="9"
      stroke-linecap="round"
      stroke-dasharray="1 16"
    />

    {#each FIRS as [x, y, s], i (i)}
      <use href="#tv-fir" transform="translate({x},{y}) scale({s})" />
    {/each}

    <!-- Village cottages with roofs in the player colours. -->
    {#each HOUSES as h, i (i)}
      {@const theme = PLAYER_THEMES[h.roof] ?? PLAYER_THEMES[0]!}
      <g transform="translate({h.x},{h.y})">
        <rect x="-13" y="-14" width="26" height="18" fill="#f4ead2" stroke="#6b5a3a" stroke-width="2" />
        <path d="M-17,-13 L0,-28 L17,-13 Z" fill={theme.color} stroke={theme.dark} stroke-width="2" stroke-linejoin="round" />
        <rect x="-3" y="-6" width="6" height="10" fill="#6b4a2a" />
      </g>
    {/each}

    <!-- The castle, flying the four player banners. -->
    <g transform="translate(-40,0)">
      <g stroke="#5d4c30" stroke-width="3" stroke-linejoin="round">
        <path
          d="M425,478 L425,430 L437,430 L437,422 L449,422 L449,430 L461,430 L461,422 L473,422 L473,430 L527,430 L527,422 L539,422 L539,430 L551,430 L551,422 L563,422 L563,430 L575,430 L575,478 Z"
          fill="#e2d8c3"
        />
        <path d="M410,478 L410,386 L450,386 L450,478 Z M550,478 L550,386 L590,386 L590,478 Z" fill="#d6cab1" />
        <path d="M465,432 L465,362 L477,362 L477,352 L489,352 L489,362 L511,362 L511,352 L523,352 L523,362 L535,362 L535,432 Z" fill="#e8dfcb" />
        <path d="M404,388 L430,334 L456,388 Z M544,388 L570,334 L596,388 Z" fill="#8e2b22" />
        <path d="M487,478 L487,460 A13,13 0 0 1 513,460 L513,478 Z" fill="#4a3b28" />
        <path
          d="M426,410 L426,398 A4,4 0 0 1 434,398 L434,410 Z M566,410 L566,398 A4,4 0 0 1 574,398 L574,410 Z M496,396 L496,384 A4,4 0 0 1 504,384 L504,396 Z"
          fill="#4a3b28"
          stroke-width="1.5"
        />
      </g>
      {#each POLES as p, i (i)}
        {@const theme = PLAYER_THEMES[i] ?? PLAYER_THEMES[0]!}
        <line x1={p.x} y1={p.top} x2={p.x} y2={p.base} stroke="#4a3b28" stroke-width="3" stroke-linecap="round" />
        <circle cx={p.x} cy={p.top} r="3.5" fill="#d9a93a" />
        <path
          class="flag"
          style="animation-delay: {-i * 0.45}s"
          d="M{p.x + 1},{p.top + 3} q15,-4 32,2 l-8,8 8,8 q-17,-5 -32,-1 Z"
          fill={theme.color}
          stroke={theme.dark}
          stroke-width="2"
          stroke-linejoin="round"
        />
      {/each}
    </g>

    <!-- The dragon, curled up asleep on its hill. -->
    <g transform="translate(1180,530)">
      <!-- Tail curled round the front, tapering to a spade. -->
      <path
        d="M96,-16 C146,-8 146,36 84,38 C44,40 -4,36 -34,32 L-34,20 C-2,24 44,26 80,24 C114,22 118,0 94,-2 Z"
        fill="#b8452f"
        stroke="#6e1b16"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path d="M-30,18 L-52,10 L-46,26 L-54,42 L-30,34 Z" fill="#7a2419" stroke="#5a140f" stroke-width="2.5" stroke-linejoin="round" />
      <g class="breathe">
        <path d="M-70,2 C-72,-48 -22,-80 30,-78 C86,-76 112,-40 106,2 Z" fill="url(#tv-dragon)" stroke="#6e1b16" stroke-width="3" stroke-linejoin="round" />
        <path
          d="M-44,-58 l8,-14 6,12 Z M-16,-72 l9,-15 6,14 Z M14,-78 l9,-15 7,14 Z M44,-74 l9,-14 6,13 Z M70,-60 l10,-12 4,13 Z M90,-40 l12,-8 1,12 Z"
          fill="#6e1b16"
        />
        <path
          d="M-6,-34 C8,-70 40,-98 64,-98 L58,-76 L82,-84 L72,-60 L96,-62 L74,-34 Z"
          fill="#7a2419"
          stroke="#5a140f"
          stroke-width="3"
          stroke-linejoin="round"
        />
        <path d="M6,-40 L58,-76 M22,-38 L72,-60" stroke="#b8503a" stroke-width="2.5" stroke-linecap="round" />
        <path
          d="M-40,-12 q10,-6 20,0 M-10,-14 q10,-6 20,0 M20,-14 q10,-6 20,0 M50,-12 q10,-6 20,0"
          fill="none"
          stroke="#e38a5c"
          stroke-width="2.5"
          stroke-linecap="round"
          opacity="0.8"
        />
      </g>
      <!-- Head resting on the ground: swept-back horns, closed eye, snout. -->
      <path d="M-92,-34 C-84,-50 -66,-60 -46,-60 C-62,-52 -72,-44 -76,-32 Z" fill="#eadbb4" stroke="#6e1b16" stroke-width="2" stroke-linejoin="round" />
      <path
        d="M-52,-4 C-60,-26 -80,-38 -100,-38 C-114,-38 -124,-32 -130,-26 C-140,-24 -152,-22 -158,-16 C-164,-10 -162,-2 -154,0 L-54,4 Z"
        fill="url(#tv-dragon)"
        stroke="#6e1b16"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path d="M-104,-37 C-98,-47 -86,-52 -74,-52 C-84,-46 -90,-40 -92,-33 Z" fill="#eadbb4" stroke="#6e1b16" stroke-width="2" stroke-linejoin="round" />
      <path d="M-66,-30 l6,-9 3,9 M-78,-35 l5,-9 3,9" fill="#6e1b16" stroke="#6e1b16" stroke-width="2" stroke-linejoin="round" />
      <path d="M-122,-24 q7,6 14,0" fill="none" stroke="#3b140c" stroke-width="3" stroke-linecap="round" />
      <path d="M-156,-6 C-146,-3 -136,-4 -126,-8" fill="none" stroke="#6e1b16" stroke-width="2" stroke-linecap="round" />
      <circle cx="-151" cy="-15" r="2.4" fill="#3b140c" />
      <path d="M-100,4 C-100,-8 -74,-8 -72,4 Z" fill="#a23a26" stroke="#6e1b16" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M-100,4 l-3,3 M-93,4 l-2,4 M-86,4 l-1,4" stroke="#f1e6cc" stroke-width="2" stroke-linecap="round" />
      <g class="smoke">
        <circle class="puff" cx="-160" cy="-18" r="7" />
        <circle class="puff" cx="-160" cy="-18" r="9" style="animation-delay: 0.35s" />
        <circle class="puff" cx="-160" cy="-18" r="6" style="animation-delay: 0.7s" />
      </g>
      <g class="snore" style="font-family: var(--font-label)" font-style="italic" font-size="22" fill="#fffaf0" stroke="#5a4a32" stroke-width="0.6">
        <text class="z" x="-104" y="-44">z</text>
        <text class="z" x="-96" y="-58" font-size="28" style="animation-delay: 1.2s">z</text>
      </g>
    </g>

    <!-- A little ship off the east coast. -->
    <g transform="translate(1470,768)">
      <g class="bob">
        <path d="M-40,0 L40,0 L30,16 L-30,16 Z" fill="#7a5530" stroke="#4a3320" stroke-width="3" stroke-linejoin="round" />
        <line x1="0" y1="0" x2="0" y2="-62" stroke="#4a3320" stroke-width="3" />
        <path d="M3,-58 C24,-48 26,-20 3,-8 Z" fill="#f6eedb" stroke="#6b5a3a" stroke-width="2" />
        <path d="M-3,-52 C-20,-42 -22,-22 -3,-12 Z" fill="#f6eedb" stroke="#6b5a3a" stroke-width="2" />
        <path d="M0,-62 l16,4 -16,4 Z" fill="#8e2b22" />
      </g>
    </g>

    <!-- Wave marks. -->
    <g class="waves" fill="none" stroke="#eaf5f5" stroke-width="3" stroke-linecap="round" opacity="0.8">
      <path d="M120,620 q10,-7 20,0 q10,-7 20,0" />
      <path d="M90,820 q10,-7 20,0 q10,-7 20,0" />
      <path d="M1480,640 q10,-7 20,0 q10,-7 20,0" />
      <path d="M560,872 q10,-7 20,0 q10,-7 20,0" />
      <path d="M1040,880 q10,-7 20,0 q10,-7 20,0" />
      <path d="M1360,860 q10,-7 20,0 q10,-7 20,0" />
    </g>
  </svg>
</div>

<style>
  .vignette {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background: linear-gradient(180deg, #8fc3df 0%, #c4e1ec 42%, #f4ead2 78%, #f7eedb 100%);
  }
  .sun {
    position: absolute;
    top: 6%;
    right: 12%;
    width: 7rem;
    height: 7rem;
    border-radius: 50%;
    background: radial-gradient(circle, #fff9dc 0 42%, #fff4c466 58%, #fff4c400 72%);
  }
  .cloud-track {
    position: absolute;
    left: 0;
    will-change: transform;
    animation: drift var(--dur) linear var(--delay) infinite;
  }
  .cloud {
    display: block;
    opacity: 0.92;
  }
  @keyframes drift {
    from {
      transform: translateX(-16rem);
    }
    to {
      transform: translateX(100vw);
    }
  }
  .scene {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
  }
  /* Portrait: the island sits in the lower part, under the menu, scaled so
     both the castle and the dragon stay in frame. */
  @media (max-aspect-ratio: 1/1) {
    .scene {
      height: 40%;
    }
  }
  /* Short landscape (phones on their side): lower the island so the castle
     sits below the logo instead of behind it. */
  @media (max-height: 560px) and (orientation: landscape) {
    .scene {
      translate: 0 18%;
    }
  }
  .flag {
    transform-box: fill-box;
    transform-origin: 0 50%;
    animation: flutter 1.9s ease-in-out infinite;
  }
  @keyframes flutter {
    0%,
    100% {
      transform: skewY(0deg) scaleX(1);
    }
    50% {
      transform: skewY(-7deg) scaleX(0.9);
    }
  }
  .breathe {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: breathe 4.6s ease-in-out infinite;
  }
  @keyframes breathe {
    0%,
    100% {
      transform: scaleY(1);
    }
    50% {
      transform: scaleY(1.04);
    }
  }
  .puff {
    fill: #d9d4ca;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: 50% 50%;
    animation: puff 9s ease-out infinite;
  }
  @keyframes puff {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.4);
    }
    4% {
      opacity: 0.9;
    }
    22% {
      opacity: 0;
      transform: translate(-26px, -46px) scale(1.5);
    }
    100% {
      opacity: 0;
      transform: translate(-26px, -46px) scale(1.5);
    }
  }
  .z {
    opacity: 0;
    animation: snore 4.6s ease-in-out infinite;
  }
  @keyframes snore {
    0% {
      opacity: 0;
      transform: translate(0, 0);
    }
    30% {
      opacity: 1;
    }
    70% {
      opacity: 0;
      transform: translate(8px, -22px);
    }
    100% {
      opacity: 0;
    }
  }
  .bob {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: bob 5.5s ease-in-out infinite;
  }
  @keyframes bob {
    0%,
    100% {
      transform: rotate(-2.5deg) translateY(0);
    }
    50% {
      transform: rotate(2.5deg) translateY(3px);
    }
  }
  /* Static picture when motion is off: nothing moves, and the sleeping
     dragon's "z" stays visible so the still frame still tells the joke. */
  .still * {
    animation: none !important;
  }
  .still .cloud-track {
    transform: translateX(var(--rest));
  }
  .still .z {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .vignette * {
      animation: none !important;
    }
    .vignette .cloud-track {
      transform: translateX(var(--rest));
    }
    .vignette .z {
      opacity: 1;
    }
  }
</style>
