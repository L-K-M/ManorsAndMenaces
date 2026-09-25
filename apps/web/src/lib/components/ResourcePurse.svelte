<script lang="ts">
  // A player's resource counters. Each counter is a landing target for
  // harvest flights (`data-res-target`), holds back tokens still in flight,
  // and pops when its count goes up; with animation off it only flashes.
  import { RESOURCE_TYPES, type PlayerId, type Resources } from "@manors-menaces/rules";
  import type { GameSession } from "../game/session.svelte.js";
  import { resourceKey } from "../game/harvestFlights.js";
  import { shownCount } from "../stores/fx.svelte.js";
  import { animationScale } from "../stores/settings.svelte.js";
  import ResourceIcon from "./ResourceIcon.svelte";

  let { session, playerId, size = 18 }: { session: GameSession; playerId: PlayerId; size?: number } = $props();
  // While the viewer's own move is being submitted, the draft already holds
  // its outcome, including the next player's harvest (online, for a network
  // round trip). A rival's counters keep their settled values until the
  // confirmed batch arrives and holds the harvest tokens back, so they never
  // jump up, drop back and tick up again.
  let settled: Resources | undefined;
  const resources = $derived.by(() => {
    const current = session.draft.players[playerId]?.resources;
    if (session.busy && playerId !== session.viewerId) return settled ?? current;
    settled = current;
    return current;
  });

  // Keyed by counter, so switching whose purse this is (hot-seat) never pops.
  function bump(node: HTMLElement, value: { key: string; n: number }) {
    let last = value;
    return {
      update(next: { key: string; n: number }) {
        const rose = next.key === last.key && next.n > last.n;
        last = next;
        if (!rose || typeof node.animate !== "function") return;
        // A move can show its new totals a moment before its harvest tokens
        // are held back; only pop if the rise is still there when painted.
        requestAnimationFrame(() => {
          if (last.key === next.key && last.n >= next.n) pop();
        });
      },
    };
    function pop() {
      const scale = animationScale();
      const glow = [{ backgroundColor: "#ffe38a" }, { backgroundColor: "transparent" }];
      if (scale === 0) node.animate(glow, { duration: 900, easing: "ease-out" });
      else
        node.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.35)", backgroundColor: "#ffe38a", offset: 0.3 },
            { transform: "scale(1)", backgroundColor: "transparent" },
          ],
          {
            duration: 420 * Math.max(scale, 0.6),
            easing: "ease-out",
          },
        );
    }
  }
</script>

{#if resources}
  {#each RESOURCE_TYPES as r}
    {@const key = resourceKey(playerId, r)}
    {@const n = shownCount(resources[r], key)}
    <span class="r" data-res-target={key}>
      <ResourceIcon resource={r} {size} />
      <b class="n" use:bump={{ key, n }}>{n}</b>
    </span>
  {/each}
{/if}

<style>
  .r {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-variant-numeric: tabular-nums;
  }
  .n {
    display: inline-block;
    min-width: 1.1em;
    padding: 0 0.1em;
    border-radius: 4px;
    font-weight: inherit;
    text-align: center;
  }
</style>
