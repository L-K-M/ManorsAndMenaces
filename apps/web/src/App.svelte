<script lang="ts">
  import { untrack } from "svelte";
  import { isSaveFile, type SaveFile } from "@manors-menaces/protocol";
  import { BALANCE, mvpRuleset } from "@manors-menaces/rules";
  import { t } from "./lib/i18n.js";
  import { planRematch } from "./lib/game/rematch.js";
  import { GameSession, type NewGameOptions } from "./lib/game/session.svelte.js";
  import { TUTORIAL_SEED, describeSaves, exportFileName, isAutosave, isTutorialSave, latestAutosave, relativeTime, rulesetLabel, saveLabel, type SaveEntry } from "./lib/game/saves.js";
  import { PLAYER_THEMES, emblemPath } from "./lib/theme.js";
  import { platform } from "./lib/platform/adapter.js";
  import { resetTool, ui } from "./lib/stores/ui.svelte.js";
  import { animationScale, settings } from "./lib/stores/settings.svelte.js";
  import GameScreen from "./lib/components/GameScreen.svelte";
  import NewGame from "./lib/components/NewGame.svelte";
  import SettingsDialog from "./lib/components/SettingsDialog.svelte";
  import Modal from "./lib/components/Modal.svelte";
  import OnlineLobby from "./lib/online/OnlineLobby.svelte";
  import NoticeBanner from "./lib/online/NoticeBanner.svelte";
  import { dismissNotice, watchNotices } from "./lib/online/notices.svelte.js";
  import { setMatchRoute } from "./lib/online/route.js";
  import UpdatePrompt from "./lib/components/UpdatePrompt.svelte";
  import TitleVignette from "./lib/components/TitleVignette.svelte";
  import ToolIcon from "./lib/components/ToolIcon.svelte";

  type Screen = "title" | "new" | "game" | "online";
  // Invite links (#/join/CODE) open the online lobby directly (spec §86), and
  // a match address (#/match/ID, e.g. after a reload) reopens that match.
  let screen: Screen = $state(location.hash.startsWith("#/join/") || location.hash.startsWith("#/match/") ? "online" : "title");
  let session: GameSession | null = $state(null);
  let tutorial = $state(false);
  let saves: SaveEntry[] = $state([]);
  let savesListedAt = $state(Date.now());
  let savesUnavailable = $state(false);
  /** The Load list row awaiting "Delete this save?" confirmation. */
  let confirmDelete: string | null = $state(null);
  // Finished games are not continued (an older build's shared slot may hold one).
  const continueSave = $derived(latestAutosave(saves.filter((s) => s.meta && s.meta.status !== "finished")));
  let showLoad = $state(false);
  let showRules = $state(false);
  let loadError: string | null = $state(null);
  // The logo sets the ampersand as a flourish when the title has one.
  const titleWords = t("app.title").split(" & ");

  async function refreshSaves() {
    try {
      saves = describeSaves(await platform.listSaves());
      savesUnavailable = false;
    } catch {
      saves = [];
      savesUnavailable = true;
    }
    savesListedAt = Date.now();
  }
  $effect(() => {
    if (screen === "title") void refreshSaves();
  });

  function start(opts: NewGameOptions, isTutorial = false) {
    session?.destroy();
    resetTool();
    ui.bannerDraft = {};
    // The tutorial is never autosaved, so it cannot displace a real game's Continue.
    session = GameSession.create(isTutorial ? { ...opts, autosave: false } : opts);
    tutorial = isTutorial;
    screen = "game";
  }
  function startTutorial() {
    start(
      {
        seats: [
          { playerId: "P1", displayName: "You", kind: "human", color: 0 },
          { playerId: "P2", displayName: t("rival.lord_mumble.name"), rivalId: "lord_mumble", kind: "ai", aiLevel: "easy", color: 1 },
        ],
        ruleset: mvpRuleset(),
        seed: TUTORIAL_SEED,
      },
      true,
    );
  }
  function openSession(s: GameSession, isTutorial = false) {
    session?.destroy();
    resetTool();
    ui.bannerDraft = {};
    ui.inspect = null;
    session = s;
    tutorial = isTutorial;
    screen = "game";
  }
  /**
   * Tutorial saves (e.g. an older build's shared autosave) reopen with the
   * coach. `autosaveSlot` is the autosave being resumed, if any; any other
   * save continues in a new autosave row (see saves.ts).
   */
  function openSave(data: SaveFile, autosaveSlot?: string) {
    showLoad = false;
    loadError = null;
    confirmDelete = null;
    const isTutorial = isTutorialSave(data);
    openSession(GameSession.fromSave(data, isTutorial ? { autosave: false } : autosaveSlot ? { autosaveSlot } : {}), isTutorial);
  }
  async function readSave(id: string): Promise<SaveFile | null> {
    try {
      const data = await platform.load(id);
      if (data && isSaveFile(data)) return data;
    } catch {
      // Reported below like an unreadable save.
    }
    loadError = t("ui.save_unreadable");
    return null;
  }
  async function loadSave(id: string) {
    const data = await readSave(id);
    if (data) openSave(data, isAutosave(id) ? id : undefined);
  }
  async function exportSave(id: string) {
    const data = await readSave(id);
    if (!data) return;
    try {
      await platform.exportFile(exportFileName(data), JSON.stringify(data, null, 2));
    } catch {
      loadError = t("ui.export_failed");
    }
  }
  /** The pressed delete button is replaced by the confirmation: focus its safe choice. */
  function focusNow(node: HTMLElement) {
    node.focus();
  }
  async function deleteSave(id: string) {
    confirmDelete = null;
    try {
      await platform.remove(id);
    } catch {
      loadError = t("ui.delete_failed");
    }
    await refreshSaves();
  }
  async function importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as SaveFile;
      if (!isSaveFile(data)) throw new Error("not a save");
      openSave(data);
    } catch {
      loadError = t("ui.not_a_save_file");
    }
  }
  // Notices about online matches that are not on screen (spec §85): heard
  // while this device has a guest session, from any screen.
  watchNotices({ openMatchId: () => (session?.transport.kind === "online" ? session.authoritative.matchId : null) });
  $effect(() => {
    // A match on screen needs no notice, however it was opened.
    const matchId = session?.transport.kind === "online" ? session.authoritative.matchId : null;
    if (matchId) untrack(() => dismissNotice(matchId));
  });
  /** Remounting the lobby makes it open the match in the address. */
  let lobbyKey = $state(0);
  /**
   * Opening a notice leaves the current game without the menu's warnings, so
   * not from one that would be lost: a tutorial, or a game that could not be saved.
   */
  const canLeave = (s: GameSession | null, isTutorial: boolean): boolean => !s || s.transport.kind === "online" || (!isTutorial && !s.autosaveFailed);
  const canLeaveForNotice = $derived(canLeave(session, tutorial));
  /** Opens an online match from a notice or a clicked system notification. */
  function openMatchFromNotice(matchId: string) {
    if (!canLeaveForNotice) return;
    dismissNotice(matchId);
    if (session) exit();
    setMatchRoute(matchId);
    screen = "online";
    lobbyKey++;
  }
  $effect(() => {
    if (!("serviceWorker" in navigator)) return;
    // The service worker hands over clicks on its notifications (sw.template.js).
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; matchId?: unknown } | null;
      if (data?.type === "OPEN_MATCH" && typeof data.matchId === "string") openMatchFromNotice(data.matchId);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  });

  function exit() {
    session?.destroy();
    ui.dialog = null;
    ui.bannerDraft = {};
    ui.inspect = null;
    session = null;
    screen = "title";
  }
  function rematch() {
    if (!session) return exit();
    const { seats, mapId, initialState } = session;
    const plan = planRematch({ transport: session.transport.kind, tutorial, seats, mapId, initialState });
    if (plan.kind === "local") return start(plan.options);

    exit();
    screen = plan.kind === "lobby" ? "online" : "new";
  }
  $effect(() => {
    document.documentElement.style.setProperty("--text-scale", String(settings.textScale));
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
    // The in-app Reduced motion / Animation: Off settings must stop CSS
    // animations too, not only the OS preference (see app.css).
    document.documentElement.classList.toggle("reduce-motion", animationScale() === 0);
  });
</script>

{#if screen === "game" && session}
  {#key session}
    <GameScreen {session} {tutorial} onexit={exit} onrematch={rematch} />
  {/key}
{:else}
  <div class="title-screen">
    <TitleVignette animate={animationScale() > 0} />
    {#if screen === "title"}
      <section class="hero">
        <img class="title-art" src={`${import.meta.env.BASE_URL}art/manor-troll.png`} alt="" width="640" height="640" fetchpriority="high" />
        <h1 class="logo">
          {#if titleWords.length === 2}
            {titleWords[0]} <span class="amp">&amp;</span>
            {titleWords[1]}
          {:else}
            {t("app.title")}
          {/if}
        </h1>
        <p class="tagline"><span>{t("app.tagline")}</span></p>
        <nav class="menu">
          <svg class="seal" viewBox="-24 -24 48 48" aria-hidden="true">
            <path d="M0,-21 C8,-22 14,-18 18,-12 C23,-6 22,3 20,9 C17,16 10,21 1,21 C-8,22 -15,17 -19,10 C-23,3 -22,-6 -18,-12 C-14,-18 -8,-21 0,-21 Z" fill="#8e2b22" stroke="#6a1d16" stroke-width="1.5" />
            <circle r="14" fill="none" stroke="#b8503f" stroke-width="1.5" />
            <path d="M-8.5,5 L-7.5,-5 L-3.5,-1.5 L0,-8 L3.5,-1.5 L7.5,-5 L8.5,5 Z M-8,8 H8" fill="#b8503f" stroke="#b8503f" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          {#if continueSave}
            {@const c = continueSave}
            <button class="primary continue" onclick={() => loadSave(c.id)}>
              {t("ui.continue")}{#if c.meta}<small>{saveLabel(c.meta)}</small>{/if}
            </button>
          {/if}
          <button class="primary" onclick={() => (screen = "new")}>{t("ui.new_game")}</button>
          <button onclick={startTutorial}>{t("ui.tutorial")}</button>
          <button onclick={() => (screen = "online")}>{t("ui.play_online")}</button>
          <button onclick={() => ((showLoad = true), void refreshSaves())}>{t("ui.load_game")}</button>
          <button onclick={() => (showRules = true)}>{t("ui.how_to_play")}</button>
          <button onclick={() => (ui.dialog = "settings")}>{t("ui.settings")}</button>
        </nav>
        <p class="version">v{__APP_VERSION__}</p>
      </section>
    {:else if screen === "new"}
      <NewGame onstart={(o) => start(o)} onback={() => (screen = "title")} />
    {:else if screen === "online"}
      {#key lobbyKey}
        <OnlineLobby onopen={openSession} onback={() => (screen = "title")} />
      {/key}
    {/if}
  </div>
{/if}

{#if ui.dialog === "settings" && screen !== "game"}<SettingsDialog onclose={() => (ui.dialog = null)} />{/if}

{#if showLoad}
  <Modal title={t("ui.load_game")} onclose={() => ((showLoad = false), (loadError = null), (confirmDelete = null))} wide>
    {#if savesUnavailable}<p class="error">{t("ui.saves_unavailable")}</p>
    {:else if saves.length === 0}<p>{t("ui.no_saved_games_yet")}</p>{/if}
    <ul class="saves">
      {#each saves as s (s.id)}
        {@const auto = isAutosave(s.id)}
        <li class:confirming={confirmDelete === s.id}>
          <button class="open" onclick={() => loadSave(s.id)} title={new Date(s.savedAt).toLocaleString()}>
            {#if s.meta}
              {@const meta = s.meta}
              <span class="who">
                {#each meta.players as p}
                  {@const theme = PLAYER_THEMES[p.color] ?? PLAYER_THEMES[0]!}
                  <span class="player">
                    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d={emblemPath(theme.shape, 5.5)} fill={theme.color} stroke={theme.dark} stroke-width="1.2" /></svg>{p.name}
                    {#if meta.winner === p.name}<span class="crown"><ToolIcon name="crown" size={14} /></span>{/if}
                  </span>
                {/each}
              </span>
            {:else}
              <span class="who">{s.label}</span>
            {/if}
            <span class="facts">
              <span class="kind" class:auto>{auto ? t("ui.autosave") : t("ui.manual_save")}</span>
              {#if s.meta}
                <span>{s.meta.winner ? t("ui.won_by", { name: s.meta.winner }) : t("ui.round_n", { n: s.meta.round })}</span>
                <span>{rulesetLabel(s.meta.rulesetName)}</span>
              {:else}
                <span class="error">{t("ui.save_unreadable_short")}</span>
              {/if}
              <span class="when">{relativeTime(s.savedAt, savesListedAt)}</span>
            </span>
          </button>
          {#if confirmDelete === s.id}
            <div class="confirm" role="group" aria-label={t("ui.delete_save_confirm")}>
              <span>{t("ui.delete_save_confirm")}</span>
              <button class="danger" onclick={() => deleteSave(s.id)}>{t("ui.delete")}</button>
              <button use:focusNow onclick={() => (confirmDelete = null)}>{t("ui.keep")}</button>
            </div>
          {:else}
            <button class="ghost icon" aria-label={t("ui.export_save")} title={t("ui.export_save")} onclick={() => exportSave(s.id)}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m-4-4 4 4 4-4M4 14v2.5h12V14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button class="ghost icon" aria-label={t("ui.delete_save")} title={t("ui.delete_save")} onclick={() => (confirmDelete = s.id)}><ToolIcon name="close" size={20} /></button>
          {/if}
        </li>
      {/each}
    </ul>
    <label class="import">{t("ui.import_a_save_file")} <input type="file" accept="application/json,.json" onchange={importFile} /></label>
    {#if loadError}<p class="error">{loadError}</p>{/if}
  </Modal>
{/if}

<NoticeBanner onopen={openMatchFromNotice} canOpen={canLeaveForNotice} />
<UpdatePrompt />

{#if showRules}
  <Modal title={t("ui.how_to_play")} onclose={() => (showRules = false)} wide>
    <ol class="rules">
      {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as n}<li>{t(`tutorial.${n}`)}</li>{/each}
    </ol>
    <h3>{t("ui.costs")}</h3>
    <ul>
      <li>{t("action.build_route")}: {t("cost.route")}</li>
      <li>{t("action.build_manor")}: {t("cost.manor")}</li>
      <li>{t("action.upgrade")}: {t("cost.stronghold")}</li>
      <li>{t("action.buy_card")}: {t("cost.card")}</li>
      <li>{t("action.royal_writ")}: {t("cost.writ")}</li>
      <li>{t("action.warden")}: {t("cost.warden")}</li>
      <li>{t("action.trade")}: {t("help.market", { give: BALANCE.market.give, receive: BALANCE.market.receive, limit: BALANCE.market.maxTradesPerTurn })}</li>
    </ul>
  </Modal>
{/if}

<style>
  .title-screen {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
      max(1rem, env(safe-area-inset-left));
  }
  /* Everything on the title screens floats above the vignette. The New Game
     and online panels become paper sheets without touching their markup. */
  .title-screen > :global(:not(.vignette)) {
    position: relative;
    z-index: 1;
  }
  .title-screen > :global(section.panel) {
    background-image: var(--paper-sheet);
    border-width: 2px;
    border-color: var(--edge);
    box-shadow: var(--sheet-rule), var(--shadow-card);
  }
  .hero {
    display: grid;
    justify-items: center;
    text-align: center;
  }
  .title-art {
    width: clamp(6rem, 15vh, 10rem);
    height: auto;
    margin-bottom: 0.6rem;
    filter: drop-shadow(0 8px 12px #243c2b33);
  }
  @media (min-width: 1050px) and (min-height: 701px) {
    .hero {
      width: min(68rem, 94vw);
      grid-template-columns: 1fr 1fr;
      grid-template-areas: "art logo" "art tagline" "art menu" "art version";
      column-gap: 2rem;
      align-items: center;
    }
    .hero .title-art {
      grid-area: art;
      width: 100%;
      margin: 0;
    }
    .hero .logo {
      grid-area: logo;
      font-size: clamp(3rem, 4.8vw, 4.6rem);
    }
    .hero .tagline { grid-area: tagline; }
    .hero .menu { grid-area: menu; }
    .hero .version { grid-area: version; }
  }
  .logo {
    margin: 0;
    font: 700 clamp(2.5rem, 7.4vw, 5.2rem) / 0.95 var(--font-display);
    color: #3b2a14;
    letter-spacing: 0.01em;
    /* A cream halo keeps the ink legible over sky and clouds. */
    text-shadow:
      0 0 2px #fffaf0,
      0 0 2px #fffaf0,
      0 2px 0 #fffaf0,
      0 4px 14px #fffaf0cc;
  }
  .amp {
    display: inline-block;
    margin: 0 0.06em;
    font: italic 400 1.15em/0.8 var(--font-label);
    color: #8a5f12;
  }
  .tagline {
    margin: 0.7rem 0 1.4rem;
    font: italic 1.25rem/1.2 var(--font-label);
    color: #fff6e0;
    filter: drop-shadow(0 2px 2px #2b211540);
  }
  /* A wax-red ribbon with notched ends. */
  .tagline span {
    display: inline-block;
    padding: 0.3rem 1.9rem 0.35rem;
    background: linear-gradient(#a8392c, var(--wax) 60%, #7a2219);
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.8rem) 50%, 100% 100%, 0 100%, 0.8rem 50%);
  }
  .menu {
    position: relative;
    display: grid;
    gap: 0.55rem;
    width: min(20rem, 86vw);
    margin: 0 auto;
    padding: 1.9rem 1.2rem 1.2rem;
    border: 2px solid var(--edge);
    border-radius: var(--radius-l);
    background: var(--paper-sheet);
    box-shadow: var(--sheet-rule), var(--shadow-card);
  }
  .seal {
    position: absolute;
    top: -1.5rem;
    left: 50%;
    width: 3rem;
    height: 3rem;
    translate: -50% 0;
    filter: drop-shadow(0 2px 2px #2b211559);
  }
  .menu button {
    min-width: 0;
    width: 100%;
    font-size: 1.1rem;
    padding: 0.6rem 1rem;
  }
  .version {
    margin: 0.6rem 0 0;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    background: #fffaf0b3;
    color: var(--ink-soft);
    font-size: 0.8rem;
  }
  /* Portrait: keep the menu high so the painted coastline shows beneath it. */
  @media (max-aspect-ratio: 1/1) {
    .hero {
      align-self: start;
      margin-top: max(0.5rem, 5vh);
    }
  }
  /* Short screens: tighten the stack so the card still fits once the
     Continue button appears (a 1024x600 netbook, a 360x640 phone). */
  @media (max-height: 700px) {
    .title-art {
      display: none;
    }
    .hero {
      margin-top: 0;
    }
    .tagline {
      margin: 0.5rem 0 1.1rem;
    }
    .menu {
      gap: 0.4rem;
      padding: 1.6rem 1rem 1rem;
    }
    .menu button {
      padding: 0.4rem 1rem;
    }
    .version {
      margin-top: 0.4rem;
    }
  }
  /* Short landscape screens (phones on their side): logo beside the menu,
     menu buttons in two columns, so nothing needs scrolling. */
  @media (max-height: 560px) and (orientation: landscape) {
    .hero {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto auto 1fr;
      grid-template-areas:
        "logo menu"
        "tagline menu"
        "version menu";
      column-gap: 2rem;
      align-self: stretch;
      width: min(60rem, 100%);
    }
    .logo {
      grid-area: logo;
      font-size: clamp(1.8rem, 4vw, 2.8rem);
    }
    .tagline {
      grid-area: tagline;
      margin: 0.5rem 0;
      font-size: 1rem;
    }
    .version {
      grid-area: version;
      align-self: end;
    }
    .menu {
      grid-area: menu;
      align-self: center;
      grid-template-columns: 1fr 1fr;
      width: min(26rem, 52vw);
      padding-top: 1.6rem;
    }
    .menu button {
      font-size: 1rem;
      padding: 0.4rem 0.6rem;
    }
  }
  .saves {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .continue {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
  }
  .continue small {
    font-size: 0.78rem;
    font-weight: 400;
    opacity: 0.9;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .saves li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 0.3rem;
    align-items: stretch;
  }
  .saves .open {
    display: grid;
    gap: 0.25rem;
    justify-items: start;
    text-align: left;
    padding: 0.45rem 0.7rem;
  }
  .who {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.7rem;
    font-weight: 600;
  }
  .player {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .crown {
    display: inline-flex;
    color: #b08500;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem 0.8rem;
    font-size: 0.85rem;
    opacity: 0.85;
  }
  .kind {
    padding: 0 0.45rem;
    border-radius: 999px;
    border: 1px solid #8a7650;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kind.auto {
    background: #e7efe2;
    border-color: var(--accent);
    color: var(--accent-dark);
  }
  .saves .icon {
    min-width: 44px;
    padding: 0;
    font-size: 1.1rem;
    display: grid;
    place-items: center;
  }
  .confirm {
    grid-column: 2 / -1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.4rem;
    border-radius: 9px;
    background: #fbe3dc;
  }
  .confirm span {
    font-size: 0.9rem;
  }
  .danger {
    background: #a3190c;
    border-color: #6e1b16;
    color: #fff;
  }
  .danger:hover:not(:disabled) {
    background: #c02414;
  }
  @media (max-width: 560px) {
    /* Stack the row's two icon buttons so the names keep the width. */
    .saves li {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .saves .open {
      grid-row: span 2;
    }
    .saves li.confirming {
      grid-template-columns: minmax(0, 1fr);
    }
    .confirm {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }
  }
  .import {
    display: grid;
    gap: 0.3rem;
    margin-top: 0.6rem;
  }
  .import input {
    min-width: 0;
    max-width: 100%;
  }
  .error {
    color: #a3190c;
  }
  .rules li {
    margin-bottom: 0.4rem;
  }
</style>
