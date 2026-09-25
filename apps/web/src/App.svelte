<script lang="ts">
  import { isSaveFile, type SaveFile, type SeatConfig } from "@manors-menaces/protocol";
  import { BALANCE, mvpRuleset, type RulesetConfig } from "@manors-menaces/rules";
  import { t } from "./lib/i18n.js";
  import { GameSession } from "./lib/game/session.svelte.js";
  import { TUTORIAL_SEED, describeSaves, exportFileName, isAutosave, isTutorialSave, latestAutosave, relativeTime, rulesetLabel, saveLabel, type SaveEntry } from "./lib/game/saves.js";
  import { PLAYER_THEMES, emblemPath } from "./lib/theme.js";
  import { platform } from "./lib/platform/adapter.js";
  import { resetTool, ui } from "./lib/stores/ui.svelte.js";
  import { settings } from "./lib/stores/settings.svelte.js";
  import GameScreen from "./lib/components/GameScreen.svelte";
  import NewGame from "./lib/components/NewGame.svelte";
  import SettingsDialog from "./lib/components/SettingsDialog.svelte";
  import Modal from "./lib/components/Modal.svelte";
  import OnlineLobby from "./lib/online/OnlineLobby.svelte";
  import UpdatePrompt from "./lib/components/UpdatePrompt.svelte";

  type Screen = "title" | "new" | "game" | "online";
  // Invite links (#/join/CODE) open the online lobby directly (spec §86).
  let screen: Screen = $state(location.hash.startsWith("#/join/") ? "online" : "title");
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
  let lastConfig: { seats: SeatConfig[]; ruleset: RulesetConfig } | null = null;
  let loadError: string | null = $state(null);

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

  function start(opts: { seats: SeatConfig[]; ruleset: RulesetConfig; seed?: string }, isTutorial = false) {
    session?.destroy();
    resetTool();
    ui.bannerDraft = {};
    lastConfig = { seats: opts.seats, ruleset: opts.ruleset };
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
          { playerId: "P2", displayName: "Lord Mumble", kind: "ai", aiLevel: "easy", color: 1 },
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
  /** The pressed ✕ is replaced by the confirmation: focus its safe choice. */
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
  function exit() {
    session?.destroy();
    ui.dialog = null;
    ui.bannerDraft = {};
    ui.inspect = null;
    session = null;
    screen = "title";
  }
  function rematch() {
    if (lastConfig) start(lastConfig);
    else exit();
  }
  $effect(() => {
    document.documentElement.style.setProperty("--text-scale", String(settings.textScale));
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
  });
</script>

{#if screen === "game" && session}
  {#key session}
    <GameScreen {session} {tutorial} onexit={exit} onrematch={rematch} />
  {/key}
{:else}
  <div class="title-screen">
    {#if screen === "title"}
      <section class="hero">
        <h1>{t("app.title")}</h1>
        <p class="tagline">{t("app.tagline")}</p>
        <nav class="menu">
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
      <OnlineLobby onopen={openSession} onback={() => (screen = "title")} />
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
                  <span class="player" class:winner={meta.winner === p.name}>
                    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d={emblemPath(theme.shape, 5.5)} fill={theme.color} stroke={theme.dark} stroke-width="1.2" /></svg>{p.name}
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
            <button class="ghost icon" aria-label={t("ui.delete_save")} title={t("ui.delete_save")} onclick={() => (confirmDelete = s.id)}>✕</button>
          {/if}
        </li>
      {/each}
    </ul>
    <label class="import">{t("ui.import_a_save_file")} <input type="file" accept="application/json,.json" onchange={importFile} /></label>
    {#if loadError}<p class="error">{loadError}</p>{/if}
  </Modal>
{/if}

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
    place-items: center;
    padding: 1rem;
    background:
      radial-gradient(ellipse at 50% 35%, #f4ecd2 0%, #e2d2a4 55%, #b9a06a 100%);
  }
  .hero {
    text-align: center;
  }
  h1 {
    font: 700 clamp(2.6rem, 8vw, 5rem) / 1 var(--font-display);
    margin: 0;
    color: #3d2f1a;
    text-shadow: 0 2px 0 #fff8;
  }
  .tagline {
    font: italic 1.3rem var(--font-display);
    margin: 0.4rem 0 1.6rem;
  }
  .menu {
    display: grid;
    gap: 0.5rem;
    width: min(18rem, 80vw);
    margin: 0 auto;
  }
  .menu button {
    font-size: 1.1rem;
    padding: 0.6rem 1rem;
  }
  .version {
    opacity: 0.5;
    font-size: 0.8rem;
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
  .player.winner::after {
    content: "♛";
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
