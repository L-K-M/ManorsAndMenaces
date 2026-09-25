import { expect, test, type Page } from "@playwright/test";

// Storybook look: self-hosted fonts, SVG icons, the illustrated title
// screen and the parchment form controls.

async function openTitle(page: Page, settings: Record<string, unknown> = {}) {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "normal", sound: false, ...s }));
    indexedDB.deleteDatabase("manors-menaces");
  }, settings);
  await page.reload();
}

test("fonts are self-hosted Alegreya faces, never a font CDN @mobile", async ({ page }) => {
  const fontRequests: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "font") fontRequests.push(r.url());
  });
  await openTitle(page);
  await page.evaluate(() => document.fonts.ready);

  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")));
  expect(loaded).toContain("Alegreya SC");
  expect(loaded).toContain("Alegreya Sans");
  expect(await page.getByRole("heading", { name: "Manors & Menaces" }).evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Alegreya SC/);
  expect(await page.getByRole("button", { name: "Tutorial" }).evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Alegreya Sans/);

  expect(fontRequests.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  for (const url of fontRequests) {
    expect(new URL(url).origin).toBe(origin);
    expect(url).toMatch(/\.woff2(\?|$)/);
  }
});

test("the title screen is an illustrated realm with the menu on a card @mobile", async ({ page }) => {
  await openTitle(page);
  const vignette = page.locator(".vignette");
  await expect(vignette).toBeVisible();
  await expect(vignette).toHaveAttribute("aria-hidden", "true");
  // One banner per player colour on the castle, plus the dragon's smoke.
  await expect(vignette.locator(".flag")).toHaveCount(4);
  await expect(vignette.locator(".puff")).toHaveCount(3);
  await expect(page.getByText("Build wisely. Trouble wanders.")).toBeVisible();

  const viewport = page.viewportSize()!;
  for (const name of ["New game", "Tutorial", "Play online", "Load game", "How to play", "Settings"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.y + box!.height, `${name} fits on screen`).toBeLessThanOrEqual(viewport.height);
    expect(box!.x + box!.width, `${name} fits on screen`).toBeLessThanOrEqual(viewport.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
});

test("the title vignette holds still when animation is off", async ({ page }) => {
  await openTitle(page);
  const flag = page.locator(".vignette .flag").first();
  expect(await flag.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");

  await openTitle(page, { animationSpeed: "off" });
  await expect(page.locator(".vignette")).toHaveClass(/still/);
  expect(await flag.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(
    await page
      .locator(".vignette .cloud-track")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

test("radio options are compact selectable cards", async ({ page }) => {
  await openTitle(page);
  await page.getByRole("button", { name: "New game" }).click();

  // A global min-height for text fields used to stretch radios to 40px.
  const radio = page.getByRole("radio", { name: /Standard/ });
  const box = await radio.boundingBox();
  expect(box!.height).toBeLessThan(24);

  const card = page.locator("label", { has: radio });
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(accent).toBe("#2f6b3a");
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(47, 107, 58)");

  await page.getByRole("radio", { name: /Core/ }).check();
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe("rgb(47, 107, 58)");
});

test("icon-only buttons draw SVG icons and keep their names", async ({ page }) => {
  await openTitle(page, { animationSpeed: "off", privacyCurtain: false });
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: "Begin" }).click();

  for (const name of ["Main menu", "Settings", "Zoom in", "Zoom out", "Reset view", "Zoom to my holdings"]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button.locator("svg")).toHaveCount(1);
    expect((await button.textContent())?.trim(), `${name} has no glyph text`).toBe("");
  }
});

test("high contrast drops the paper texture and gradients", async ({ page }) => {
  await openTitle(page, { highContrast: true });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).not.toMatch(/url\(/);
  const primary = page.getByRole("button", { name: "New game" });
  expect(await primary.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
  expect(await primary.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(0, 54, 163)");
  expect(await primary.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
});
