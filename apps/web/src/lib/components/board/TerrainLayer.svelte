<script lang="ts">
  // Illustrated terrain over the Region fills (see art/terrain.ts): a soft
  // painted edge along every border, then the merged motif paths. It is
  // static, never takes pointer events and sits under Routes, pieces and
  // highlights. High contrast keeps only the streams and ridges that explain
  // bridges and passes; Board.svelte shows the flat hatch patterns there.
  import type { MapDefinition } from "@manors-menaces/content";
  import { terrainArt } from "../../art/terrain.js";
  import { settings } from "../../stores/settings.svelte.js";

  let { map }: { map: MapDefinition } = $props();

  const art = $derived(terrainArt(map));
</script>

<g class="terrain" clip-path="url(#island-clip)" pointer-events="none" aria-hidden="true">
  {#if !settings.highContrast}
    <path d={art.edges} class="edge wide" />
    <path d={art.edges} class="edge" />
  {/if}
  <path d={art.streams[0]} class="stream" />
  <path d={art.streams[1]} class="stream-shine" />
  <path d={art.ridges[0]} class="ridge" />
  <path d={art.ridges[1]} class="ridge-lit" />
  {#if !settings.highContrast}
    {#each art.layers as layer (layer.id)}
      <path
        d={layer.d}
        data-ink={layer.id}
        fill={layer.style.fill ?? "none"}
        stroke={layer.style.stroke ?? "none"}
        stroke-width={layer.style.width}
        opacity={layer.style.opacity}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {/each}
  {/if}
</g>

<style>
  /* Darkens both sides of every border a little, like pooled paint. */
  .edge {
    fill: none;
    stroke: #2b2115;
    stroke-width: 7;
    stroke-linejoin: round;
    opacity: 0.1;
  }
  .stream {
    fill: #6aa6c6;
    stroke: #3f6f8a;
    stroke-width: 1;
  }
  .stream-shine {
    fill: none;
    stroke: #d6eef6;
    stroke-width: 1.2;
    stroke-linecap: round;
    opacity: 0.8;
  }
  .ridge {
    fill: #8f887b;
    stroke: #4a453d;
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .ridge-lit {
    fill: #c9c2b4;
  }
  .edge.wide {
    stroke-width: 18;
    opacity: 0.07;
  }
</style>
