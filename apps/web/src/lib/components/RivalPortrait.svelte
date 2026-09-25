<script lang="ts">
  // A rival's face, composed from the parts named in its content data and
  // dressed in the seat colour. The emblem badge keeps the seat's heraldic
  // shape visible, so the portrait never relies on colour alone.
  import type { RivalPortrait } from "@manors-menaces/content";
  import { emblemPath, type PlayerTheme } from "../theme.js";

  let { portrait, theme, size = 40, badge = true, title }: { portrait: RivalPortrait; theme: PlayerTheme; size?: number; badge?: boolean; title?: string } = $props();

  const clipId = $props.id();
  const INK = "#3a2616";
  const skin = $derived(portrait.face === "troll" ? { fill: "#9fb27f", line: "#4d5c35" } : portrait.face === "goblin" ? { fill: "#a9c56a", line: "#4f6a22" } : { fill: "#f3d3b1", line: "#8a6446" });
</script>

<svg class="portrait" width={size} height={size} viewBox="-24 -24 48 48" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"}>
  {#if title}<title>{title}</title>{/if}
  <defs>
    <clipPath id={clipId}><circle r="21.6" /></clipPath>
  </defs>
  <circle r="22.8" fill={theme.light} stroke={theme.color} stroke-width="2.4" />
  <g clip-path="url(#{clipId})">
    <!-- Shoulders in the seat colour. -->
    <path d="M-21,26 C-20,14 -9,12.5 0,12.5 C9,12.5 20,14 21,26 Z" fill={theme.color} stroke={theme.dark} stroke-width="1.2" />
    <path d="M-4,12.6 L0,17 L4,12.6" fill="none" stroke={theme.light} stroke-width="1.4" />

    <!-- Hair and ears behind the face. -->
    {#if portrait.headwear === "witch_hat"}
      <path d="M-10,-6 C-14,4 -13,12 -9,15 L-6,4 Z M10,-6 C14,4 13,12 9,15 L6,4 Z" fill="#5a3a2a" />
    {:else if portrait.headwear === "coronet"}
      <ellipse cx="-10.5" cy="-2" rx="3" ry="4.5" fill="#d9d4cc" stroke="#8d877c" stroke-width="0.8" />
      <ellipse cx="10.5" cy="-2" rx="3" ry="4.5" fill="#d9d4cc" stroke="#8d877c" stroke-width="0.8" />
    {/if}
    {#if portrait.face === "goblin"}
      <path d="M-8,-1 L-21,-8 L-9,6 Z M8,-1 L21,-8 L9,6 Z" fill={skin.fill} stroke={skin.line} stroke-width="1" stroke-linejoin="round" />
    {/if}

    <!-- Face. -->
    {#if portrait.face === "troll"}
      <path d="M-13,0 C-13,-12 13,-12 13,0 C13,10 8,15.5 0,15.5 C-8,15.5 -13,10 -13,0 Z" fill={skin.fill} stroke={skin.line} stroke-width="1" />
    {:else if portrait.face === "goblin"}
      <ellipse cy="3" rx="10" ry="10.5" fill={skin.fill} stroke={skin.line} stroke-width="1" />
    {:else if portrait.face === "long"}
      <ellipse cy="2" rx="9.5" ry="12.5" fill={skin.fill} stroke={skin.line} stroke-width="1" />
    {:else}
      <ellipse cy="2" rx="11" ry="12" fill={skin.fill} stroke={skin.line} stroke-width="1" />
    {/if}

    <!-- Nose and a touch of cheek. -->
    {#if portrait.face === "troll"}
      <ellipse cy="4" rx="3.4" ry="2.6" fill="#8a9e6a" stroke={skin.line} stroke-width="0.8" />
    {:else if portrait.face === "goblin"}
      <path d="M0,1 L5,7.5 L0,7" fill="#98b45a" stroke={skin.line} stroke-width="0.8" stroke-linejoin="round" />
    {:else}
      <path d="M0.2,1.5 Q2.2,4.5 0,5.4" fill="none" stroke={skin.line} stroke-width="0.9" stroke-linecap="round" />
      <circle cx="-6" cy="5" r="2" fill="#e89a8a" opacity="0.45" />
      <circle cx="6" cy="5" r="2" fill="#e89a8a" opacity="0.45" />
    {/if}

    <!-- Eyes. -->
    {#if portrait.eyes === "narrow"}
      <path d="M-7,-3.5 L-2,-2 M7,-3.5 L2,-2" stroke={INK} stroke-width="1.6" stroke-linecap="round" />
      <path d="M-6,-0.5 h3.4 M2.6,-0.5 h3.4" stroke={INK} stroke-width="1.6" stroke-linecap="round" />
    {:else if portrait.eyes !== "visor"}
      <circle cx="-4" cy="-1" r="1.5" fill={INK} />
      <circle cx="4" cy="-1" r="1.5" fill={INK} />
      {#if portrait.eyes === "spectacles"}
        <circle cx="-4" cy="-1" r="3.3" fill="#ffffff40" stroke={INK} stroke-width="1" />
        <circle cx="4" cy="-1" r="3.3" fill="#ffffff40" stroke={INK} stroke-width="1" />
        <path d="M-0.7,-1.4 Q0,-2.2 0.7,-1.4" fill="none" stroke={INK} stroke-width="1" />
      {:else if portrait.eyes === "monocle"}
        <circle cx="4" cy="-1" r="3.4" fill="#ffffff40" stroke="#b08500" stroke-width="1.1" />
        <path d="M7.2,0 Q9,6 7,11" fill="none" stroke="#b08500" stroke-width="0.7" />
        <path d="M-6.5,-4.2 Q-4,-5.6 -1.8,-4.4" fill="none" stroke={INK} stroke-width="0.9" stroke-linecap="round" />
      {/if}
    {/if}

    <!-- Mouth. -->
    {#if portrait.mouth === "moustache"}
      <path d="M-2.5,9.6 Q0,10.8 2.5,9.6" fill="none" stroke={INK} stroke-width="0.9" stroke-linecap="round" />
      <path d="M0,6.4 C-3,5.2 -6.5,6 -8.5,8.6 C-6,7.6 -3,8.4 0,7.6 C3,8.4 6,7.6 8.5,8.6 C6.5,6 3,5.2 0,6.4 Z" fill="#8a8378" stroke="#5d574e" stroke-width="0.6" />
    {:else if portrait.mouth === "tusks"}
      <path d="M-6,9 Q0,11.5 6,9" fill="none" stroke={INK} stroke-width="1.2" stroke-linecap="round" />
      <path d="M-4.6,9.9 L-4,5.6 L-2.6,10.3 Z M4.6,9.9 L4,5.6 L2.6,10.3 Z" fill="#f5eedc" stroke="#8d8367" stroke-width="0.6" stroke-linejoin="round" />
    {:else if portrait.mouth === "smirk"}
      <path d="M-3,9.4 Q1,10.8 4,7.6" fill="none" stroke={INK} stroke-width="1.1" stroke-linecap="round" />
    {:else if portrait.mouth === "grin"}
      <path d="M-5,7.6 Q0,13.4 5,7.6 Z" fill="#7a2a1f" stroke={INK} stroke-width="0.8" stroke-linejoin="round" />
      <path d="M-4.2,8 L4.2,8 L3.6,9.2 L-3.6,9.2 Z" fill="#fff" />
    {:else}
      <path d="M-3.6,8.2 Q0,11.2 3.6,8.2" fill="none" stroke={INK} stroke-width="1.1" stroke-linecap="round" />
    {/if}

    <!-- Headwear, mostly in the seat colour. -->
    {#if portrait.headwear === "coronet"}
      <path d="M-10,-7.5 L-10.5,-15 L-6,-11 L-3,-17.5 L0,-12 L3,-17.5 L6,-11 L10.5,-15 L10,-7.5 Z" fill={theme.color} stroke={theme.dark} stroke-width="1" stroke-linejoin="round" />
      <path d="M-10,-9.5 L10,-9.5" stroke="#f0c850" stroke-width="1.6" />
      <circle cy="-9.5" r="1.3" fill="#fff6d0" />
    {:else if portrait.headwear === "horns"}
      <path d="M-9,-7 C-14,-10 -16,-16 -13,-21 C-12,-16 -9,-13 -4.5,-10.5 Z M9,-7 C14,-10 16,-16 13,-21 C12,-16 9,-13 4.5,-10.5 Z" fill="#efe4c8" stroke="#8d7f5d" stroke-width="0.9" stroke-linejoin="round" />
      <path d="M-11,-6.5 Q0,-12 11,-6.5" fill="none" stroke={theme.color} stroke-width="2.6" stroke-linecap="round" />
    {:else if portrait.headwear === "feathered_hat"}
      <path d="M4,-12 C9,-21 15,-24 20,-23 C16,-20 12,-16 7,-10.5 Z" fill="#fffdf6" stroke="#9a948a" stroke-width="0.8" />
      <ellipse cy="-8.5" rx="15.5" ry="3.6" fill={theme.color} stroke={theme.dark} stroke-width="1" />
      <path d="M-9,-8.8 C-9.5,-17 9.5,-17 9,-8.8 Z" fill={theme.color} stroke={theme.dark} stroke-width="1" />
      <path d="M-9.2,-10.6 Q0,-12 9.2,-10.6" fill="none" stroke={theme.dark} stroke-width="1.6" />
    {:else if portrait.headwear === "helm"}
      <path d="M0,-12 C2,-21 10,-24 15,-19 C10,-19.5 6,-17 2.5,-11 Z" fill={theme.color} stroke={theme.dark} stroke-width="0.9" />
      <path d="M-12,5 C-13,-17 13,-17 12,5 L8,5 L8,2.5 L-8,2.5 L-8,5 Z" fill="#c3c8d0" stroke="#4a505a" stroke-width="1" stroke-linejoin="round" />
      <rect x="-8.5" y="-3" width="17" height="2.8" rx="1.2" fill="#1c1f24" />
      <path d="M0,-12.5 L0,-4" stroke="#8b919b" stroke-width="1.1" />
    {:else if portrait.headwear === "eyeshade"}
      <path d="M-9,-6.5 C-8,-10 8,-10 9,-6.5" fill="#3d3a2e" />
      <path d="M-12,-6.5 Q0,-9.5 12,-6.5 L13.5,-3.4 Q0,0.4 -13.5,-3.4 Z" fill={theme.color} fill-opacity="0.85" stroke={theme.dark} stroke-width="0.9" stroke-linejoin="round" />
    {:else if portrait.headwear === "witch_hat"}
      <ellipse cy="-8" rx="15.5" ry="3.3" fill={theme.color} stroke={theme.dark} stroke-width="1" />
      <path d="M-8,-8.6 C-6,-15 -2,-21 5,-25 L8,-23.5 C4,-19.5 5,-14 8,-8.6 Z" fill={theme.color} stroke={theme.dark} stroke-width="1" stroke-linejoin="round" />
      <path d="M-7.6,-10.4 Q0,-12 7.8,-10.4" fill="none" stroke={theme.dark} stroke-width="1.8" />
      <rect x="-1.6" y="-12.4" width="3.2" height="3" rx="0.5" fill="none" stroke="#f0c850" stroke-width="0.9" />
    {/if}
  </g>
  {#if badge}
    <g transform="translate(16.5 16.5)">
      <path d={emblemPath(theme.shape, 4.6)} fill={theme.color} stroke="#fffaf0" stroke-width="1.6" stroke-linejoin="round" />
    </g>
  {/if}
</svg>

<style>
  .portrait {
    display: block;
    flex: none;
    overflow: visible;
  }
</style>
