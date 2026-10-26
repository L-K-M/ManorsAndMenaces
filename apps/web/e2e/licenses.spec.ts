import { expect, test } from "@playwright/test";

// Settings > Licenses (LicenseNotices.svelte). The production build writes
// the notices (scripts/check-build.mjs checks them); the dev server this
// suite runs against has none, so the test serves a stand-in.
test("settings show the third-party notices", async ({ page }) => {
  await page.route("**/Third-Party-Notices.txt", (route) =>
    route.fulfill({ contentType: "text/plain; charset=utf-8", body: "Third-party notices for Manors & Menaces web app\n\nsvelte 5.0.0\nLicense: MIT\n" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Licenses", { exact: true }).click();
  await expect(page.getByText(/own code is public domain \(Unlicense\)/)).toBeVisible();
  // Only the Tauri apps link the Rust standard library.
  await expect(page.getByText("Rust standard library", { exact: true })).toHaveCount(0);
  await page.getByText("Third-party notices", { exact: true }).click();
  await expect(page.getByText("svelte 5.0.0")).toBeVisible();
  // The dev server has no LICENSE.txt either (the build emits it).
  await page.getByText("The game's license (Unlicense)", { exact: true }).click();
  await expect(page.getByText("This build does not include this file.")).toBeVisible();
});
