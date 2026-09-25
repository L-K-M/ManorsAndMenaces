<script lang="ts">
  // Harvested resources flying from their Region to the counter of the
  // player who earned them (spec §50). Each token pops up over its Region,
  // arcs to the counter and lands there, and only then does the counter tick
  // up. Where no counter is on screen the token rises and fades in place.
  import type { FeedbackController, Token } from "../game/feedback.svelte.js";
  import { arcFrames } from "../game/harvestFlights.js";
  import { boardToClient, landingPoint } from "../boardScreen.js";
  import ResourceIcon from "./ResourceIcon.svelte";

  let { feedback }: { feedback: FeedbackController } = $props();

  /** Share of a flight spent popping up over the Region before it sets off. */
  const POP = 0.22;
  const SIZE = 30;

  function fly(node: HTMLElement, token: Token) {
    const from = boardToClient(token.from);
    if (!from || typeof node.animate !== "function") {
      feedback.landed(token);
      return;
    }
    const to = landingPoint(token.playerId, token.resource);
    const place = (p: { x: number; y: number }, scale: number) => `translate(${p.x - SIZE / 2}px, ${p.y - SIZE / 2}px) scale(${scale})`;
    const lifted = { x: from.x, y: from.y - 22 };
    const keyframes: { transform: string; opacity: number; offset: number }[] = [
      { transform: place(from, 0.3), opacity: 0, offset: 0 },
      { transform: place(lifted, 1.2), opacity: 1, offset: POP * 0.7 },
      { transform: place(lifted, 1), opacity: 1, offset: POP },
    ];
    if (to) {
      for (const f of arcFrames(lifted, to).slice(1)) {
        keyframes.push({ transform: place(f, 1 - 0.3 * f.offset), opacity: 1, offset: POP + (1 - POP) * f.offset });
      }
    } else {
      keyframes.push({ transform: place({ x: from.x, y: from.y - 70 }, 0.9), opacity: 0, offset: 1 });
    }
    const animation = node.animate(keyframes, { duration: token.duration, delay: token.delay, easing: "linear", fill: "both" });
    animation.onfinish = () => feedback.landed(token);
    return { destroy: () => animation.cancel() };
  }
</script>

<div class="flights" aria-hidden="true">
  {#each feedback.tokens as token (token.key)}
    <div class="fx-token" use:fly={token}><ResourceIcon resource={token.resource} size={SIZE} label={false} /></div>
  {/each}
</div>

<style>
  .flights {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 40;
    overflow: hidden;
  }
  .fx-token {
    position: absolute;
    left: 0;
    top: 0;
    opacity: 0;
    filter: drop-shadow(0 3px 3px #0006);
    will-change: transform;
  }
</style>
