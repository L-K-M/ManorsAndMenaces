import { mount } from "svelte";
import App from "./App.svelte";
import { registerServiceWorker } from "./lib/pwa.svelte.js";
import "./app.css";

const target = document.getElementById("app");
if (!target) throw new Error("#app missing");
mount(App, { target });

// Offline support for the web build (spec §76).
registerServiceWorker();
