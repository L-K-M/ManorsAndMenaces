<script lang="ts">
  // A Holding as a raised game piece in three-quarter view (spec §49): cream
  // walls, roofs and door in the owner's colour, a light top edge and one
  // shared offset shadow of the same silhouette (no filters, so it costs no
  // more to paint than the piece itself). The owner's emblem above the piece
  // stays in Board.svelte as the colour-independent channel.
  import type { PlayerTheme } from "../../theme.js";

  let { type, theme }: { type: "manor" | "stronghold"; theme: PlayerTheme } = $props();

  // Outer outlines, used for the cast shadow.
  const SILHOUETTE = {
    manor: "M-14,13 L-14,0 L-5,-11.5 L7,-14.5 L15,-3.5 L15,10 L4,13 Z",
    stronghold: "M-19,15 L-19,-4 L-14,-16 L-9,-4 L-9,-11 L-5,-11 L-5,-13 L5,-13 L5,-11 L9,-11 L9,-4 L14,-16 L19,-4 L19,15 Z",
  } as const;
</script>

<g class="piece {type}">
  <path d={SILHOUETTE[type]} transform="translate(3.5,3)" class="cast" />
  {#if type === "manor"}
    <!-- side wall, gable front, roof, chimney, door and window -->
    <path class="wall side" d="M3,13 L3,0 L15,-3.5 L15,10 Z" />
    <path class="wall" d="M-14,13 L-14,0 L-5.5,-11 L3,0 L3,13 Z" />
    <path class="chimney" d="M8.5,-11.5 L8.5,-17.5 L11.5,-18 L11.5,-8.5 Z" />
    <path d="M-5.5,-11 L6.5,-14.5 L15.5,-3.5 L3,0 Z" fill={theme.color} stroke={theme.dark} class="roof" />
    <path d="M-5.2,-11.4 L6.6,-14.8" stroke={theme.light} class="edge" />
    <path d="M-5.5,-11 L-14,0 M-5.5,-11 L3,0" stroke={theme.dark} class="trim" />
    <path d="M-8,13 L-8,6.5 Q-5.5,3.8 -3,6.5 L-3,13 Z" fill={theme.dark} class="door" />
    <path class="window" d="M7,4.8 L11,3.8 L11,7.4 L7,8.4 Z" />
  {:else}
    <!-- two round towers with conical roofs either side of a crenellated keep -->
    <path class="wall side" d="M9,15 L9,-4 L19,-4 L19,15 Z" />
    <path class="wall" d="M-19,15 L-19,-4 L-9,-4 L-9,15 Z" />
    <path class="wall" d="M-9,15 L-9,-11 L-5,-11 L-5,-8 L-2,-8 L-2,-11 L2,-11 L2,-8 L5,-8 L5,-11 L9,-11 L9,15 Z" />
    <path d="M-20,-4 L-14,-16.5 L-8,-4 Z M8,-4 L14,-16.5 L20,-4 Z" fill={theme.color} stroke={theme.dark} class="roof" />
    <path d="M-19.6,-4.4 L-14,-16 M8.4,-4.4 L14,-16" stroke={theme.light} class="edge" />
    <path d="M-4.5,15 L-4.5,5 A4.5,4.5 0 0,1 4.5,5 L4.5,15 Z" fill={theme.dark} class="door" />
    <path class="window" d="M-15,3 L-13,3 L-13,7 L-15,7 Z M13,3 L15,3 L15,7 L13,7 Z" />
    <path class="edge wall-edge" d="M-18.6,14.5 L-18.6,-3.6 M-8.6,-3 L-8.6,-10.6 L-5.4,-10.6" />
  {/if}
</g>

<style>
  .cast {
    fill: #1d160c;
    opacity: 0.28;
  }
  .wall {
    fill: #f4ead3;
    stroke: #5a4a32;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .wall.side {
    fill: #d9c9a8;
  }
  .roof {
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
  .trim {
    fill: none;
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .edge {
    fill: none;
    stroke-width: 1.4;
    stroke-linecap: round;
    opacity: 0.9;
  }
  .wall-edge {
    stroke: #fffaf0;
    stroke-width: 1;
    opacity: 0.8;
  }
  .chimney {
    fill: #b9a585;
    stroke: #5a4a32;
    stroke-width: 1.2;
  }
  .window {
    fill: #4b3c28;
  }
</style>
