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
  import TitleVignette from "./lib/components/TitleVignette.svelte";
  import ToolIcon from "./lib/components/ToolIcon.svelte";

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
  // The logo sets the ampersand as a flourish when the title has one.
  const titleWords = t("app.title").split(" & ");

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
          {#if s.id !== "autosave"}<button class="ghost" aria-label={t("ui.delete_save")} onclick={() => platform.remove(s.id).then(refreshSaves)}><ToolIcon name="close" size={20} /></button>{/if}
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
  /* Portrait: keep the menu high so the island shows beneath it. */
  @media (max-aspect-ratio: 1/1) {
    .hero {
      align-self: start;
      margin-top: max(0.5rem, 5vh);
    }
  }
  /* Short screens: tighten the stack so the card still fits once the
     Continue button appears (a 1024x600 netbook, a 360x640 phone). */
  @media (max-height: 700px) {
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
