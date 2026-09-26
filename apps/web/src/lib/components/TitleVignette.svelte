<script lang="ts">
  let { animate = true }: { animate?: boolean } = $props();
  let imageFailed = $state(false);
  // Only the tiny foreground motes move. The painting stays still so the
  // title and menu never feel as though they are floating over a moving camera.
  const MOTES = [
    { left: 8, bottom: 19, delay: -2, duration: 13 },
    { left: 19, bottom: 8, delay: -9, duration: 17 },
    { left: 47, bottom: 12, delay: -5, duration: 15 },
    { left: 78, bottom: 9, delay: -12, duration: 19 },
    { left: 92, bottom: 24, delay: -7, duration: 16 },
  ];
</script>

<div class="vignette" class:still={!animate} aria-hidden="true">
  {#if !imageFailed}
    <img
      class="landscape"
      src={`${import.meta.env.BASE_URL}art/title-coast.webp`}
      srcset={`${import.meta.env.BASE_URL}art/title-coast-small.webp 960w, ${import.meta.env.BASE_URL}art/title-coast.webp 1920w`}
      sizes="(max-aspect-ratio: 1/1) 178vh, 100vw"
      alt=""
      fetchpriority="high"
      onerror={() => (imageFailed = true)}
    />
  {/if}
  <div class="light"></div>
  {#each MOTES as mote, i (i)}
    <span class="mote" style="left: {mote.left}%; bottom: {mote.bottom}%; --delay: {mote.delay}s; --duration: {mote.duration}s"></span>
  {/each}
</div>

<style>
  .vignette {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    /* A quiet, usable backdrop while the painting loads or if it is unavailable. */
    background: radial-gradient(ellipse at 35% 10%, #fff5d8, transparent 65%), linear-gradient(#d9e3ce, #bac9ad 65%, #70875b);
  }
  .landscape {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
  .light {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 64% 35%, #fff6dd30, transparent 62%);
    box-shadow: inset 0 0 8vw #283c2426;
  }
  .mote {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #fff0b9;
    box-shadow: 0 0 9px 3px #f9e5a74d;
    opacity: 0;
    animation: float-mote var(--duration) ease-in-out var(--delay) infinite;
  }
  @keyframes float-mote {
    0%, 100% { opacity: 0; transform: translate(0, 0); }
    25%, 65% { opacity: 0.65; }
    90% { opacity: 0; transform: translate(18px, -45px); }
  }
  .still .mote { animation: none; }
  @media (prefers-reduced-motion: reduce) {
    .mote { animation: none; }
  }
  @media (max-aspect-ratio: 1/1) {
    .landscape { object-position: 57% center; }
    .light { background: linear-gradient(#fff5de66, transparent 65%); }
  }
  :global(.high-contrast) .vignette { background: #fff8e8; }
  :global(.high-contrast) .landscape,
  :global(.high-contrast) .light,
  :global(.high-contrast) .mote { display: none; }
</style>
