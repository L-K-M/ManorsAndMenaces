import { mount } from "svelte";
import App from "./App.svelte";
import { takeInvitedName } from "./lib/game/playerName.js";
import { registerServiceWorker } from "./lib/pwa.svelte.js";
import "./app.css";

// Before the app reads the remembered name: an invite just accepted names the player.
const invited = takeInvitedName(new URL(location.href));
if (invited) history.replaceState(history.state, "", invited.pathname + invited.search + invited.hash);

const target = document.getElementById("app");
if (!target) throw new Error("#app missing");
mount(App, { target });

// Offline support for the web build (spec §76).
registerServiceWorker();
