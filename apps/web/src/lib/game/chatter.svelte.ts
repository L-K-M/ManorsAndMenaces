// Rival chatter for the running game: turns committed event batches into
// quips (see quips.ts), shows each briefly as a speech bubble and records it
// in the Chronicle. Owned by GameScreen, one instance per session.

import type { PlayerId } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { settings } from "../stores/settings.svelte.js";
import { quipEntry } from "./log.js";
import { QuipDirector, detectQuipCandidates, turnKeyOf, type Quip } from "./quips.js";
import { seatRival } from "./rivals.js";
import type { GameSession } from "./session.svelte.js";

export interface ShownQuip extends Quip {
  id: number;
  text: string;
}

/** Long enough to read a short line; independent of animation speed. */
const SHOW_MS = 5200;

let nextId = 1;

/** Quips currently on screen, at most one per rival. */
export const chatter: { shown: ShownQuip[] } = $state({ shown: [] });

export function quipFor(playerId: PlayerId): ShownQuip | undefined {
  return chatter.shown.find((q) => q.playerId === playerId);
}

/** Start listening to a session; returns the teardown. */
export function startChatter(session: GameSession): () => void {
  chatter.shown = [];
  const rivals: Record<PlayerId, string> = {};
  for (const seat of session.seats) {
    const rival = seatRival(seat);
    if (rival) rivals[seat.playerId] = rival.id;
  }
  if (Object.keys(rivals).length === 0) return () => undefined;

  const director = new QuipDirector(session.authoritative.matchId);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let before = session.authoritative;

  const off = session.onEvents((events, state) => {
    // Buffered (undoable) actions notify with a draft ahead of the committed
    // state; they are judged once committed. An online echo of our own batch
    // notifies twice with the same revision; count it once.
    if (state.revision > session.authoritative.revision || state.revision <= before.revision) return;
    const prev = before;
    before = state;
    if (!settings.rivalChatter) return;

    const candidates = detectQuipCandidates({ ctx: session.ctx, before: prev, after: state, events, rivals, isHuman: (pid) => session.isHuman(pid) });
    for (const quip of director.choose(candidates, turnKeyOf(prev), state.revision)) show(quip);
  });

  function show(quip: Quip): void {
    const name = session.authoritative.players[quip.playerId]?.displayName ?? "?";
    const shown: ShownQuip = { ...quip, id: nextId++, text: t(quip.key) };
    session.log = [...session.log, quipEntry(t("log.quip", { name, quip: shown.text }), quip.playerId)].slice(-300);
    chatter.shown = [...chatter.shown.filter((q) => q.playerId !== quip.playerId), shown];
    const timer = setTimeout(() => {
      timers.delete(timer);
      chatter.shown = chatter.shown.filter((q) => q.id !== shown.id);
    }, SHOW_MS);
    timers.add(timer);
  }

  return () => {
    off();
    for (const timer of timers) clearTimeout(timer);
    chatter.shown = [];
  };
}
