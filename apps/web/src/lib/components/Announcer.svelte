<script lang="ts">
  // Always-mounted polite live region (spec §52). It sits outside the game
  // root so it keeps speaking while the privacy curtain makes the game inert.
  import { untrack } from "svelte";
  import { t } from "../i18n.js";
  import { announcementsFor, type Perspective } from "../game/announce.js";
  import type { GameSession } from "../game/session.svelte.js";

  /** Lines kept in the DOM; only additions are announced, so this is just history. */
  const KEPT_LINES = 6;

  let { session }: { session: GameSession } = $props();
  let lines: { id: number; text: string }[] = $state([]);
  let nextLineId = 0;
  // Entries already in the Chronicle when the game screen opened are not news.
  let lastSeen = untrack(() => session.log.at(-1)?.id ?? 0);

  const who = $derived.by((): Perspective => {
    if (session.transport.kind === "online") {
      const me = session.onlinePlayerId;
      return { self: me, isOwn: (pid) => pid === me };
    }
    const humans = session.seats.filter((s) => s.kind === "human");
    return { self: humans.length === 1 ? (humans[0]?.playerId ?? null) : null, isOwn: (pid) => session.isHuman(pid) };
  });

  $effect(() => {
    const fresh = session.log.filter((e) => e.id > lastSeen);
    if (!fresh.length) return;
    lastSeen = fresh[fresh.length - 1]!.id;
    const players = session.authoritative.players;
    const names = Object.fromEntries(Object.entries(players).map(([id, p]) => [id, p.displayName]));
    const texts = announcementsFor(fresh, session.map, names, who);
    if (!texts.length) return;
    const added = texts.map((text) => ({ id: nextLineId++, text }));
    lines = [...untrack(() => lines), ...added].slice(-KEPT_LINES);
  });
</script>

<div class="sr-only" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("ui.announcements")}>
  {#each lines as line (line.id)}<p>{line.text}</p>{/each}
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
