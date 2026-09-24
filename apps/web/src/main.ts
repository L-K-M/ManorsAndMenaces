import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const target = document.getElementById("app");
if (!target) throw new Error("#app missing");
mount(App, { target });

// Offline support for the web build (spec §76): cache the app shell.
if ("serviceWorker" in navigator && import.meta.env.PROD && !("__TAURI__" in window)) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
