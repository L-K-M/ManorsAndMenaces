<script lang="ts">
  // Settings > Licenses: the game's own license and the notices of the
  // third-party code and fonts the build bundles. Every build ships
  // Third-Party-Notices.txt and LICENSE.txt; the Tauri apps add the Rust
  // crates to the notices and ship Rust-Licenses.html (scripts/tauri-notices.mjs),
  // and the Android app lists its Android libraries on a native screen.
  import { t } from "../i18n.js";
  import { platform } from "../platform/adapter.js";

  interface NoticeFile {
    file: string;
    label: string;
    html?: boolean;
  }

  const files: NoticeFile[] = [
    { file: "Third-Party-Notices.txt", label: t("ui.third_party_notices") },
    ...(platform.kind === "tauri" ? [{ file: "Rust-Licenses.html", label: t("ui.rust_licenses"), html: true }] : []),
    { file: "LICENSE.txt", label: t("ui.own_license") },
  ];
  const opened: Record<string, boolean> = $state({});
  const texts: Record<string, string> = $state({});
  const failed: Record<string, boolean> = $state({});

  // Fetched on first open: the notices of the desktop and Android apps run to megabytes.
  // A failed fetch (offline, say) is retried on the next open.
  async function toggle(notice: NoticeFile, open: boolean) {
    opened[notice.file] = open;
    if (!open || notice.html || (texts[notice.file] !== undefined && !failed[notice.file])) return;
    failed[notice.file] = false;
    texts[notice.file] = t("ui.license_loading");
    try {
      const response = await fetch(`./${notice.file}`);
      // A dev server or SPA host answers a missing file with the app's page.
      if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error(`no ${notice.file}`);
      texts[notice.file] = await response.text();
    } catch {
      texts[notice.file] = t("ui.license_unavailable");
      failed[notice.file] = true;
    }
  }

  function openAndroidLicenses() {
    platform.openAndroidLicenses?.().catch((e: unknown) => console.warn("Opening the Android licenses screen failed", e));
  }
</script>

<details class="licenses">
  <summary>{t("ui.licenses")}</summary>
  <p>{t("ui.licenses_description")}</p>
  {#each files as notice (notice.file)}
    <details ontoggle={(e) => toggle(notice, e.currentTarget.open)}>
      <summary>{notice.label}</summary>
      {#if opened[notice.file]}
        {#if notice.html}
          <iframe src={`./${notice.file}`} title={notice.label}></iframe>
        {:else}
          <pre>{texts[notice.file]}</pre>
        {/if}
      {/if}
    </details>
  {/each}
  {#if platform.openAndroidLicenses}
    <button type="button" onclick={openAndroidLicenses}>{t("ui.android_licenses")}</button>
  {/if}
</details>

<style>
  .licenses { font-size: 0.9rem; line-height: 1.5; }
  .licenses summary { cursor: pointer; }
  .licenses p { margin-block: 0.5rem; }
  .licenses details { margin: 0.4rem 0 0 1rem; }
  pre,
  iframe {
    width: 100%;
    height: 50vh;
    margin: 0.4rem 0 0;
    border: 1px solid currentColor;
    background: white;
    color: black;
  }
  pre { overflow: auto; padding: 0.5rem; font-size: 0.75rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  button { margin-top: 0.5rem; }
</style>
