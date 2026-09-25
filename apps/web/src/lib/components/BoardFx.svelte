<script lang="ts">
  // Marks drawn onto the board for a moment: a ring in the acting player's
  // colour on the piece they just changed, and a badge where a Menace (or a
  // card) changed a harvest. Drawn in board coordinates with the board's own
  // screen transform, so they stay on their piece while the camera moves.
  import { t } from "../i18n.js";
  import type { FeedbackController } from "../game/feedback.svelte.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { animationScale } from "../stores/settings.svelte.js";
  import { MENACE_THEME, PLAYER_THEMES } from "../theme.js";
  import { boardMatrix } from "../boardScreen.js";

  let { session, feedback }: { session: GameSession; feedback: FeedbackController } = $props();

  let svg: SVGSVGElement | undefined = $state();
  let matrix = $state("matrix(1 0 0 1 0 0)");
  const active = $derived(feedback.pulses.length + feedback.badges.length > 0);
  const moving = $derived(animationScale() > 0);

  // Follow the camera only while something is drawn.
  $effect(() => {
    if (!active || !svg) return;
    const el = svg;
    let frame = 0;
    const follow = () => {
      const m = boardMatrix();
      const box = el.getBoundingClientRect();
      if (m) matrix = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e - box.left} ${m.f - box.top})`;
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  });

  function colorOf(playerId: string | null): string {
    if (!playerId) return "#3b3b46";
    return (PLAYER_THEMES[session.seat(playerId)?.color ?? 0] ?? PLAYER_THEMES[0]!).color;
  }

  const BADGE_GLYPH = {
    blocked_by_troll: MENACE_THEME.toll_troll,
    taken_by_dragon: MENACE_THEME.young_dragon,
    converted_by_witch: MENACE_THEME.bog_witch,
    druids_blessing: null,
  } as const;
</script>

<svg class="fx" class:moving bind:this={svg} aria-hidden="true">
  {#if active}
    <g transform={matrix}>
      {#each feedback.pulses as p (p.key)}
        <g transform="translate({p.at.x},{p.at.y})" style="--pc: {colorOf(p.actorId)}">
          <circle class="glow" r="30" />
          <circle class="pulse" r="24" />
          <circle class="pulse late" r="24" />
        </g>
      {/each}
      {#each feedback.badges as b (b.key)}
        {@const glyph = BADGE_GLYPH[b.note]}
        {@const label = t(`feed.badge.${b.note}`)}
        {@const half = (36 + label.length * 7.5) / 2}
        <!-- Above the Region's name, clear of its Banners and Menace. -->
        <g transform="translate({b.at.x},{b.at.y - 52})">
          <g class="badge">
            <rect x={-half} y="-15" width={half * 2} height="30" rx="15" class="pill" class:good={!glyph} />
            <g transform="translate({-half + 16},0)">
              {#if glyph}
                <g transform="scale(0.8)"><path d={glyph.glyph} fill={glyph.color} stroke="#1f1f1f" stroke-width="1" fill-rule="evenodd" /></g>
              {:else}
                <path d="M-7,6 C-9,-4 -1,-10 8,-9 C9,0 3,7 -7,6 Z M-7,6 L2,-3" fill="#4e8a3a" stroke="#2d5a24" stroke-width="1.4" />
              {/if}
            </g>
            <text x={-half + 31} y="5" class="label">{label}</text>
          </g>
        </g>
      {/each}
    </g>
  {/if}
</svg>

<style>
  .fx {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    z-index: 3;
  }
  .glow {
    fill: var(--pc);
    opacity: 0;
    animation: glow 1.6s ease-out forwards;
  }
  .pulse {
    fill: none;
    stroke: var(--pc);
    stroke-width: 6;
    opacity: 0;
    animation: fade 1.6s ease-out forwards;
  }
  .pulse.late {
    display: none;
  }
  .moving .pulse {
    transform-box: fill-box;
    transform-origin: center;
    animation: ring 1.1s ease-out forwards;
  }
  .moving .pulse.late {
    display: inline;
    animation-delay: 0.3s;
  }
  .pill {
    fill: #fffaf0;
    stroke: #7a1d10;
    stroke-width: 2.5;
  }
  .pill.good {
    stroke: #2d5a24;
  }
  .label {
    font: 700 13px/1 var(--font-body);
    fill: #3d2f1a;
  }
  .moving .badge {
    transform-box: fill-box;
    transform-origin: center;
    animation: pop 0.35s cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  @keyframes ring {
    from {
      transform: scale(0.5);
      opacity: 0.95;
    }
    to {
      transform: scale(2.2);
      opacity: 0;
    }
  }
  @keyframes fade {
    0% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes glow {
    0% {
      opacity: 0.35;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      transform: scale(0.2);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
