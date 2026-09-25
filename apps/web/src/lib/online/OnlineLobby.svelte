<script lang="ts">
  import { t } from "../i18n.js";
  import { RIVALS, rivalById } from "@manors-menaces/content";
  import { assignRivals, rivalName } from "../game/rivals.js";
  // Online lobby (spec §86): guest session, private invite links first,
  // your asynchronous matches, and joining by code.
  import type { AiLevel, MatchHistoryResponse, MatchView, SeatConfig } from "@manors-menaces/protocol";
  import { mapFor } from "../game/engine.js";
  import { historyLog } from "../game/log.js";
  import { ui } from "../stores/ui.svelte.js";
  import { GameSession } from "../game/session.svelte.js";
  import { ApiError, OnlineClient, onlineTransport } from "./client.js";
  import { clearMatchRoute, matchRoute, setMatchRoute } from "./route.js";
  import { lastSeenRevision, watchSeen } from "./seen.js";
  import ToolIcon from "../components/ToolIcon.svelte";

  let { onopen, onback }: { onopen: (s: GameSession) => void; onback: () => void } = $props();

  const client = new OnlineClient();
  let name = $state(client.displayName || "");
  let serverUrl = $state(client.serverUrl);
  let signedIn = $state(!!client.token);
  let error: string | null = $state(null);
  let notice: string | null = $state(null);
  let busy = $state(false);
  let matches: MatchView[] = $state([]);
  let seatCount = $state(2);
  let rules: "standard" | "mvp" | "async" = $state("standard");
  let aiCount = $state(0);
  let aiLevel: AiLevel = $state("normal");
  let joinCode = $state(new URLSearchParams(location.hash.replace(/^#\/?join\/?/, "code=")).get("code") ?? "");
  let lobbyMatch: MatchView | null = $state(null);
  /** The HTTP status of the last failed request, if the server answered. */
  let errorStatus: number | null = null;

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    busy = true;
    error = null;
    errorStatus = null;
    try {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof ApiError && e.sessionInvalid)) throw e;
        // The server no longer knows the saved session: start a new guest
        // session and try once more instead of stranding the lobby.
        await renewSession();
        return await fn();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      errorStatus = e instanceof ApiError ? e.status : null;
      return undefined;
    } finally {
      busy = false;
    }
  }

  async function renewSession() {
    try {
      await client.ensureGuest(name.trim() || "Guest");
    } catch (e) {
      signedIn = false; // back to the form, where the server address can be changed
      notice = null; // an earlier renewal's "signed in as a new guest" is no longer true
      throw e;
    }
    notice = t("ui.session_renewed");
  }

  async function signIn() {
    client.serverUrl = serverUrl.trim();
    await guard(async () => {
      await client.ensureGuest(name.trim() || "Guest");
      signedIn = true;
      await refresh();
    });
  }
  async function refresh() {
    const list = await guard(() => client.listMatches());
    if (list) matches = list;
  }
  $effect(() => {
    if (signedIn) void refresh();
  });

  // A reload (or a link) with #/match/ID reopens that match straight away.
  const resumeId = matchRoute();
  if (resumeId && client.token) void resume(resumeId);
  async function resume(matchId: string) {
    await openMatch(matchId);
    // Not this guest's match (or gone): drop the link so the next reload opens
    // the lobby instead of failing again. After a network error, keep it.
    if (errorStatus === 403 || errorStatus === 404) clearMatchRoute();
  }

  async function create() {
    // A random offset varies the line-up between matches, as in New Game.
    const rivalIds = assignRivals(
      Array.from({ length: Math.min(aiCount, seatCount - 1) }, () => "ai" as const),
      Math.floor(Math.random() * RIVALS.length),
    );
    const res = await guard(() =>
      client.createMatch({
        displayName: name.trim() || "Guest",
        seatCount,
        rulesetName: rules,
        aiSeats: rivalIds.map((id) => {
          const rival = rivalById(id);
          return { displayName: rival ? rivalName(rival) : "Robot", level: aiLevel };
        }),
      }),
    );
    if (res) await openMatch(res.matchId);
  }
  async function join() {
    const res = await guard(() => client.joinMatch(joinCode.trim(), name.trim() || "Guest"));
    if (res) await openMatch(res.matchId);
  }

  let unsubscribeLobby: (() => void) | null = null;
  async function openMatch(matchId: string) {
    const opened = await guard(() => client.history(matchId));
    if (!opened) return;
    if (!opened.match.state) {
      // Still in the lobby: wait for players, then open.
      lobbyMatch = opened.match;
      unsubscribeLobby?.();
      unsubscribeLobby = client.subscribe(
        matchId,
        (m) => {
          lobbyMatch = m;
          if (m.state) {
            unsubscribeLobby?.();
            unsubscribeLobby = null;
            // Fetch the history too: an AI seat may already have moved.
            void openMatch(matchId);
          }
        },
        () => {},
      );
      return;
    }
    launch(opened);
  }

  function launch({ match: view, entries, complete }: MatchHistoryResponse) {
    if (!view.state) return;
    const seats: SeatConfig[] = view.seats.map((s) => ({
      playerId: s.playerId,
      displayName: s.displayName,
      kind: s.kind === "ai" ? "ai" : "human",
      color: s.seat,
    }));
    let session: GameSession | null = null;
    const revision = () => session?.authoritative.revision ?? view.revision;
    // Read before this visit marks anything seen: the moves after it are new.
    const lastSeen = lastSeenRevision(view.matchId);
    const seen = watchSeen(view.matchId, revision);
    let stopEvents = () => {};
    const unsubscribe = client.subscribe(
      view.matchId,
      (m, events) => {
        if (!session) return;
        session.presence = Object.fromEntries(m.seats.map((s) => [s.playerId, s.connected]));
        if (m.state) session.receiveRemote(m.state, events);
      },
      (connected) => (session ? (session.error = connected ? null : "Reconnecting…") : undefined),
      // Each (re)connection asks for the moves made since what is on screen.
      revision,
    );
    const log = historyLog(entries, complete, lastSeen, view.state, mapFor(view.mapId));
    // Moves were made while this player was away: open the Chronicle at them.
    if (log.some((e) => e.kind === "divider")) ui.panel = "log";
    session = new GameSession({
      mapId: view.mapId,
      seats,
      initialState: view.state,
      state: view.state,
      log,
      transport: onlineTransport(client, view.matchId, () => {
        unsubscribe();
        stopEvents();
        seen.stop();
        clearMatchRoute(view.matchId);
      }),
      onlinePlayerId: view.youAre,
    });
    stopEvents = session.events.on(() => seen.update());
    seen.update();
    // Keep the match in the address so a reload comes back to it.
    setMatchRoute(view.matchId);
    onopen(session);
  }

  const inviteLinkFor = (m: MatchView | null): string => (m ? `${location.origin}${location.pathname}#/join/${m.inviteCode}` : "");
  const inviteLink = $derived(inviteLinkFor(lobbyMatch));
  $effect(() => () => unsubscribeLobby?.());
</script>

<section class="panel">
  <h2>{t("ui.play_online")}</h2>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if !signedIn}
    <form onsubmit={(e) => (e.preventDefault(), signIn())}>
      <label>{t("ui.your_name")} <input bind:value={name} maxlength="24" required /></label>
      <details>
        <summary>{t("ui.server")}</summary>
        <label>{t("ui.server_address")} <input bind:value={serverUrl} /></label>
      </details>
      <div class="row">
        <button type="button" onclick={onback}>{t("ui.back")}</button>
        <button class="primary" disabled={busy}>{t("ui.continue_as_guest")}</button>
      </div>
    </form>
  {:else if lobbyMatch}
    <p>{t("ui.waiting_for_players_share_this")}</p>
    <p class="code">{lobbyMatch.inviteCode}</p>
    <input class="link" readonly value={inviteLink} onfocus={(e) => (e.target as HTMLInputElement).select()} aria-label={t("ui.invite_link")} />
    <ul>
      {#each lobbyMatch.seats as s}<li>{s.displayName} — {s.kind === "open" ? t("ui.seat_waiting") : s.kind}</li>{/each}
    </ul>
    <button onclick={() => ((lobbyMatch = null), unsubscribeLobby?.())}>{t("ui.back_to_lobby")}</button>
  {:else}
    <div class="cols">
      <form onsubmit={(e) => (e.preventDefault(), create())}>
        <h3>{t("ui.new_match")}</h3>
        <label>{t("ui.seats")} <select bind:value={seatCount}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
        <label>{t("ui.computer_players")} <input type="number" min="0" max={seatCount - 1} bind:value={aiCount} /></label>
        {#if aiCount > 0}
          <label>{t("ui.difficulty")} <select bind:value={aiLevel}><option value="easy">{t("ui.easy")}</option><option value="normal">{t("ui.normal")}</option><option value="hard">{t("ui.hard")}</option></select></label>
        {/if}
        <label>{t("ui.rules")}
          <select bind:value={rules}>
            <option value="standard">{t("ui.standard_live")}</option>
            <option value="async">{t("ui.asynchronous_no_reactions")}</option>
            <option value="mvp">{t("ui.core")}</option>
          </select>
        </label>
        <button class="primary" disabled={busy}>{t("ui.create_get_invite_link")}</button>
      </form>
      <form onsubmit={(e) => (e.preventDefault(), join())}>
        <h3>{t("ui.join_with_a_code")}</h3>
        <label>{t("ui.invite_code")} <input bind:value={joinCode} maxlength="12" required /></label>
        <button class="primary" disabled={busy}>{t("ui.join")}</button>
      </form>
    </div>
    <h3>{t("ui.your_matches")} <button class="ghost" onclick={refresh} aria-label={t("ui.refresh")}><ToolIcon name="refresh" size={20} /></button></h3>
    {#if matches.length === 0}<p class="muted">{t("ui.no_matches_yet")}</p>{/if}
    <ul class="matches">
      {#each matches as m (m.matchId)}
        {@const yourTurn = m.state && m.state.status === "playing" && m.state.activePlayerId === m.youAre}
        <li>
          <button onclick={() => openMatch(m.matchId)}>
            {m.seats.map((s) => s.displayName).join(" · ")}
            <small>{m.status}{yourTurn ? t("ui.your_turn_suffix") : ""} · {t("ui.match_code", { code: m.inviteCode })}</small>
          </button>
        </li>
      {/each}
    </ul>
    <button onclick={onback}>{t("ui.back")}</button>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .panel {
    background: var(--paper);
    border: 3px solid #8a7650;
    border-radius: 16px;
    padding: 1.2rem 1.4rem;
    width: min(44rem, 100%);
  }
  h2 {
    margin-top: 0;
    font: 700 1.6rem/1 var(--font-display);
  }
  form {
    display: grid;
    gap: 0.5rem;
    align-content: start;
  }
  label {
    display: grid;
    gap: 0.2rem;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1rem;
  }
  .row {
    display: flex;
    justify-content: space-between;
  }
  .code {
    font: 700 2rem/1 ui-monospace, monospace;
    letter-spacing: 0.2em;
  }
  .link {
    width: 100%;
  }
  .matches {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .matches button {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .error {
    color: #a3190c;
  }
  .notice {
    margin: 0 0 0.8rem;
    padding: 0.5rem 0.8rem;
    border-left: 4px solid #8a7650;
    border-radius: 6px;
    background: rgba(138, 118, 80, 0.14);
  }
  .muted {
    opacity: 0.7;
  }
</style>
