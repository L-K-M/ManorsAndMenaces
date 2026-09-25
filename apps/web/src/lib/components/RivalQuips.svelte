<script lang="ts">
  // Runs the rival chatter for a session and shows current quips over the
  // board. On large screens with the Players tab open the bubbles appear on
  // the player cards instead (PlayersPanel), so this overlay steps aside.
  import { untrack } from "svelte";
  import { chatter, startChatter } from "../game/chatter.svelte.js";
  import { seatRival } from "../game/rivals.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import { PLAYER_THEMES } from "../theme.js";
  import QuipBubble from "./QuipBubble.svelte";
  import RivalPortrait from "./RivalPortrait.svelte";

  let { session }: { session: GameSession } = $props();

  // Only a new session restarts the chatter; startChatter reads reactive
  // game state, which must not re-run this effect on every move.
  $effect(() => {
    const s = session;
    return untrack(() => startChatter(s));
  });
</script>

<div class="rival-quips" class:cards-visible={ui.panel === "players"}>
  {#each chatter.shown as quip (quip.id)}
    {@const seat = session.seat(quip.playerId)}
    {@const rival = seatRival(seat)}
    {@const theme = PLAYER_THEMES[seat?.color ?? 0] ?? PLAYER_THEMES[0]!}
    <div class="quip" data-rival={quip.rivalId}>
      {#if rival}<RivalPortrait portrait={rival.portrait} {theme} size={46} />{/if}
      <QuipBubble text={quip.text} {theme} name={session.authoritative.players[quip.playerId]?.displayName ?? ""} tail="left" />
    </div>
  {/each}
</div>
<!-- One announcement per quip, whichever bubble is on screen. -->
<div class="sr-only" role="status">
  {#each chatter.shown as quip (quip.id)}<p>{session.authoritative.players[quip.playerId]?.displayName}: {quip.text}</p>{/each}
</div>

<style>
  .rival-quips {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    right: 4rem;
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    pointer-events: none;
    z-index: 5;
  }
  /* Short screens stack the camera buttons up the left edge; clear them. */
  @media (max-height: 599px) {
    .rival-quips {
      left: 4.25rem;
    }
  }
  .quip {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    max-width: min(24rem, 100%);
    filter: drop-shadow(0 2px 4px #0002);
  }
  /* Short landscape screens scroll the player list, so keep this one there. */
  @media (min-width: 901px) and (min-height: 600px) {
    .rival-quips.cards-visible {
      display: none;
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
