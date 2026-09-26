<script lang="ts">
  import type { CardRulesDefinition } from "@manors-menaces/rules";
  import type { GameSession } from "../game/session.svelte.js";
  import { animationScale } from "../stores/settings.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";
  import CardFace from "./CardFace.svelte";

  let { session }: { session: GameSession } = $props();
  let played: { key: number; def: CardRulesDefinition; duration: number } | null = $state(null);
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear() {
    clearTimeout(timer);
    played = null;
  }

  $effect(() => {
    let disposed = false;
    const unsubscribe = session.events.on((batch) => {
      if (batch.provisional) return;
      // A committed card identity is public. Never read another player's hand
      // or animate a selection that can still be cancelled. Let the session
      // raise any hot-seat curtain before displaying the confirmed event.
      queueMicrotask(() => {
        if (disposed || session.curtainFor || document.hidden || !animationScale()) return;
        for (const event of batch.events) {
          if (event.type !== "card_played") continue;
          clear();
          const duration = 1600 * animationScale();
          played = { key: ++sequence, def: session.ctx.cardOf(event.cardId), duration };
          // New events replace the flourish instead of building a visual backlog.
          timer = setTimeout(clear, duration);
        }
      });
    });
    return () => { disposed = true; unsubscribe(); clear(); };
  });
  $effect(() => {
    if (!animationScale() || session.curtainFor) clear();
  });
</script>

<svelte:document onvisibilitychange={() => { if (document.hidden) clear(); }} />

{#if played}
  {#key played.key}
    <div class="card-magic" aria-hidden="true" style="--duration: {played.duration}ms">
      <div class="halo"></div>
      <div class="sigil"></div>
      {#each Array.from({ length: 12 }, (_, i) => i) as i}
        <span class="spark" style="--angle: {i * 30}deg; --reach: {i % 2 ? 8 : 11}rem"><ToolIcon name="sparkle" size={20} /></span>
      {/each}
      <div class="cast-card"><CardFace def={played.def} /></div>
    </div>
  {/key}
{/if}

<style>
  .card-magic {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 12;
    overflow: hidden;
  }
  .cast-card {
    grid-area: 1 / 1;
    width: clamp(7rem, 16vw, 11rem);
    height: clamp(10.5rem, 24vw, 16.5rem);
    filter: drop-shadow(0 8px 12px #38231888);
    animation: cast var(--duration) both;
  }
  .halo, .sigil {
    grid-area: 1 / 1;
    width: 22rem;
    aspect-ratio: 1;
    border-radius: 50%;
    animation: bloom var(--duration) both;
  }
  .halo { background: radial-gradient(circle, #fff9cfbb, #fbd16c44 40%, transparent 68%); }
  .sigil {
    width: 17rem;
    border: 1px solid #ffe6a0;
    outline: 2px dotted #fff2c488;
    outline-offset: 8px;
    box-shadow: 0 0 20px #ffdb82, inset 0 0 20px #ffdb8277;
  }
  .spark {
    grid-area: 1 / 1;
    color: #fff5c6;
    filter: drop-shadow(0 0 8px #eeb45d);
    font-size: 1.25rem;
    animation: scatter var(--duration) both;
  }
  @keyframes cast {
    0% { opacity: 0; transform: translateY(80px) rotate(-12deg) scale(0.5); }
    22%, 62% { opacity: 1; transform: translateY(0) rotate(-3deg) scale(1); }
    100% { opacity: 0; transform: translateY(-45px) rotate(5deg) scale(0.85); }
  }
  @keyframes bloom {
    0% { opacity: 0; transform: scale(0.3) rotate(-20deg); }
    35% { opacity: 1; }
    100% { opacity: 0; transform: scale(1.2) rotate(25deg); }
  }
  @keyframes scatter {
    0%, 18% { opacity: 0; transform: rotate(var(--angle)) translateX(2rem) scale(0); }
    40% { opacity: 1; }
    100% { opacity: 0; transform: rotate(var(--angle)) translateX(var(--reach)) scale(0.5); }
  }
  @media (prefers-reduced-motion: reduce) { .card-magic { display: none; } }
</style>
