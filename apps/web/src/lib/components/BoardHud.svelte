<script lang="ts">
  // Everything layered over the board that tells you what just happened:
  // harvest flights, Menace badges and pulses, the action feed and, on wide
  // screens, your own resources. Mounted once inside the board area.
  import { onDestroy, untrack } from "svelte";
  import { t } from "../i18n.js";
  import { FeedbackController } from "../game/feedback.svelte.js";
  import type { GameSession } from "../game/session.svelte.js";
  import ActionFeed from "./ActionFeed.svelte";
  import BoardFx from "./BoardFx.svelte";
  import HarvestFlights from "./HarvestFlights.svelte";
  import ResourcePurse from "./ResourcePurse.svelte";

  let { session }: { session: GameSession } = $props();

  const feedback = untrack(() => new FeedbackController(session));
  onDestroy(() => feedback.destroy());

  $effect(() => {
    feedback.controlChanged(session.localActor);
  });
  let curtainWasUp = false;
  $effect(() => {
    const up = session.curtainFor !== null;
    if (curtainWasUp && !up) feedback.revealed();
    curtainWasUp = up;
  });

  const viewer = $derived(session.viewerId);
</script>

<BoardFx {session} {feedback} />
<ActionFeed {session} {feedback} />
{#if viewer}
  <div class="purse" aria-label={t("ui.your_resources")}>
    <ResourcePurse {session} playerId={viewer} size={28} />
  </div>
{/if}
<HarvestFlights {feedback} />

<style>
  /* Wide screens only: narrower layouts show your resources in the top bar
     (or the dock). Matches the "wide" game layout (width > 900, height > 560). */
  .purse {
    display: none;
  }
  @media (min-width: 901px) and (min-height: 561px) {
    .purse {
      position: absolute;
      left: 50%;
      bottom: 0.75rem;
      translate: -50% 0;
      display: flex;
      gap: 0.9rem;
      padding: 0.35rem 0.9rem;
      background: color-mix(in srgb, var(--paper) 92%, transparent);
      border: 2px solid #8a7650;
      border-radius: 999px;
      box-shadow: 0 4px 14px #0003;
      font-size: 1.3rem;
      font-weight: 700;
      pointer-events: none;
      z-index: 4;
    }
  }
</style>
