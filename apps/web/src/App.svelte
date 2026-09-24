<script lang="ts">
  import { isSaveFile, type SaveFile, type SeatConfig } from "@manors-menaces/protocol";
  import { mvpRuleset, type RulesetConfig } from "@manors-menaces/rules";
  import { t } from "./lib/i18n.js";
  import { GameSession } from "./lib/game/session.svelte.js";
  import { platform, type SaveSummary } from "./lib/platform/adapter.js";
  import { resetTool, ui } from "./lib/stores/ui.svelte.js";
  import { animationScale, settings } from "./lib/stores/settings.svelte.js";
  import GameScreen from "./lib/components/GameScreen.svelte";
  import NewGame from "./lib/components/NewGame.svelte";
  import SettingsDialog from "./lib/components/SettingsDialog.svelte";
  import Modal from "./lib/components/Modal.svelte";
  import OnlineLobby from "./lib/online/OnlineLobby.svelte";

  type Screen = "title" | "new" | "game" | "online";
  // Invite links (#/join/CODE) open the online lobby directly (spec §86).
  let screen: Screen = $state(location.hash.startsWith("#/join/") ? "online" : "title");
  let session: GameSession | null = $state(null);
  let tutorial = $state(false);
  let saves: SaveSummary[] = $state([]);
  let showLoad = $state(false);
  let showRules = $state(false);
  let lastConfig: { seats: SeatConfig[]; ruleset: RulesetConfig } | null = null;
  let loadError: string | null = $state(null);

  async function refreshSaves() {
    saves = await platform.listSaves();
  }
  $effect(() => {
    if (screen === "title") void refreshSaves();
  });

  function start(opts: { seats: SeatConfig[]; ruleset: RulesetConfig; seed?: string }, isTutorial = false) {
    session?.destroy();
    resetTool();
    ui.bannerDraft = {};
    lastConfig = { seats: opts.seats, ruleset: opts.ruleset };
    session = GameSession.create(opts);
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
        seed: "tutorial-1",
      },
      true,
    );
  }
  function openSession(s: GameSession) {
    session?.destroy();
    resetTool();
    ui.bannerDraft = {};
    ui.inspect = null;
    session = s;
    tutorial = false;
    screen = "game";
  }
  async function loadSave(id: string) {
    const data = await platform.load(id);
    if (data && isSaveFile(data)) {
      showLoad = false;
      openSession(GameSession.fromSave(data));
    } else loadError = "That save could not be read.";
  }
  async function importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as SaveFile;
      if (!isSaveFile(data)) throw new Error("not a save");
      showLoad = false;
      openSession(GameSession.fromSave(data));
    } catch {
      loadError = "That file is not a Manors & Menaces save.";
    }
  }
  function exit() {
    session?.destroy();
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
    {#if screen === "title"}
      <section class="hero">
        <h1>{t("app.title")}</h1>
        <p class="tagline">{t("app.tagline")}</p>
        <nav class="menu">
          {#if saves.some((s) => s.id === "autosave")}
            <button class="primary" onclick={() => loadSave("autosave")}>{t("ui.continue")}</button>
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
  <Modal title={t("ui.load_game")} onclose={() => ((showLoad = false), (loadError = null))}>
    {#if saves.length === 0}<p>{t("ui.no_saved_games_yet")}</p>{/if}
    <ul class="saves">
      {#each saves as s (s.id)}
        <li>
          <button onclick={() => loadSave(s.id)}>{s.id === "autosave" ? "Autosave" : s.label}<small>{new Date(s.savedAt).toLocaleString()}</small></button>
          {#if s.id !== "autosave"}<button class="ghost" aria-label={t("ui.delete_save")} onclick={() => platform.remove(s.id).then(refreshSaves)}>✕</button>{/if}
        </li>
      {/each}
    </ul>
    <label class="import">{t("ui.import_a_save_file")} <input type="file" accept="application/json,.json" onchange={importFile} /></label>
    {#if loadError}<p class="error">{loadError}</p>{/if}
  </Modal>
{/if}

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
      <li>{t("action.trade")}: {t("help.market")}</li>
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
  .saves li {
    display: flex;
    gap: 0.3rem;
  }
  .saves li button:first-child {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .import {
    display: grid;
    gap: 0.3rem;
    margin-top: 0.6rem;
  }
  .error {
    color: #a3190c;
  }
  .rules li {
    margin-bottom: 0.4rem;
  }
</style>
