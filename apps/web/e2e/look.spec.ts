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
  const landscape = vignette.locator(".landscape");
  await expect(landscape).toBeVisible();
  await expect.poll(() => landscape.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThanOrEqual(960);
  expect(await landscape.evaluate((el) => getComputedStyle(el).objectFit)).toBe("cover");
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

test("with an autosave, the whole title card fits short screens", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await openTitle(page, { animationSpeed: "off", privacyCurtain: false });
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: "Begin" }).click();
  // Main menu opens the in-game menu (#10); leaving from there keeps the autosave.
  await page.getByRole("button", { name: "Main menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Exit to title" }).click();
  await page.getByRole("dialog", { name: "Leave this game?" }).getByRole("button", { name: "Exit to title" }).click();
  await expect(page.getByRole("button", { name: /^Continue/ })).toBeVisible();

  for (const size of [
    { width: 1024, height: 600 },
    { width: 360, height: 640 },
    { width: 1400, height: 900 },
  ]) {
    await page.setViewportSize(size);
    // The card, its last button and the version chip, not just the buttons.
    expect(await page.evaluate(() => document.documentElement.scrollHeight), `${size.width}x${size.height}`).toBeLessThanOrEqual(size.height);
    const menu = (await page.locator(".menu").boundingBox())!;
    const resume = (await page.getByRole("button", { name: /^Continue/ }).boundingBox())!;
    expect(resume.x + resume.width).toBeLessThanOrEqual(menu.x + menu.width);
  }
});

test("title scenery respects animation settings and reduced motion", async ({ page }) => {
  await openTitle(page);
  const mote = page.locator(".vignette .mote").first();
  expect(await mote.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");

  await openTitle(page, { animationSpeed: "off" });
  await expect(page.locator(".vignette")).toHaveClass(/still/);
  expect(await mote.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");

  await openTitle(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await mote.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.locator(".vignette").evaluate((el) => el.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
});

test("title menu stays usable without scenery and in high contrast @mobile", async ({ page }) => {
  await page.route("**/art/title-coast*.webp", (route) => route.abort());
  await openTitle(page);
  await expect(page.locator(".vignette .landscape")).toHaveCount(0);
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Begin", exact: true })).toBeVisible();

  await page.unroute("**/art/title-coast*.webp");
  await openTitle(page, { highContrast: true });
  await expect(page.locator(".vignette .landscape")).toBeHidden();
  expect(await page.locator(".vignette").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 248, 232)");
  await expect(page.getByRole("button", { name: "New game", exact: true })).toBeVisible();
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

test("text-link buttons skip the button bevel", async ({ page }) => {
  await openTitle(page);
  // Same markup as the action hint's Cancel link, which needs a full turn
  // to reach; the global kit must not paint a raised face on it.
  const shadow = await page.evaluate(() => {
    const link = document.createElement("button");
    link.className = "link";
    link.textContent = "Cancel";
    document.body.append(link);
    return getComputedStyle(link).boxShadow;
  });
  expect(shadow).toBe("none");
});

test("pressing a button keeps a component's own transform", async ({ page }) => {
  await openTitle(page);
  // Some buttons are centred with transform (the victory pill, the Chronicle's
  // jump pill); the press must not replace it, or the button jumps away
  // from under the pointer and the click is lost.
  await page.evaluate(() => {
    // A component rule (a class, as Svelte scopes it), not an inline style.
    const style = document.createElement("style");
    style.textContent = ".centred.probe { position: fixed; left: 50%; top: 8px; z-index: 1000; transform: translateX(-50%); }";
    document.head.append(style);
    const b = document.createElement("button");
    b.id = "centred";
    b.className = "centred probe";
    b.textContent = "Centred";
    document.body.append(b);
  });
  const button = page.locator("#centred");
  const before = (await button.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  // Let the press transition finish.
  await page.waitForTimeout(200);
  const pressed = (await button.boundingBox())!;
  await page.mouse.up();
  expect(Math.abs(pressed.x - before.x)).toBeLessThan(1);
});

test("high contrast drops the paper texture and gradients", async ({ page }) => {
  await openTitle(page, { highContrast: true });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).not.toMatch(/url\(/);
  const primary = page.getByRole("button", { name: "New game" });
  expect(await primary.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
  expect(await primary.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(0, 54, 163)");
  expect(await primary.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");

  // --paper-sheet feeds background-image, so it must stay a valid <image>.
  await primary.click();
  expect(await page.locator("section.panel").first().evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/^linear-gradient/);
});

test("storybook portraits load for every rival and keep vector high-contrast alternatives @mobile", async ({ page }) => {
  await openTitle(page);
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  const portraits = {
    lord_mumble: "emperor-mumble", grum: "grum", madame_quill: "madame-quill",
    sir_brash: "dame-brash", tally_nib: "tally-nib", lady_fennick: "lady-fennick",
  };
  for (const [id, file] of Object.entries(portraits)) {
    await page.getByLabel("Player 2 rival", { exact: true }).selectOption(id);
    const image = page.locator(".portrait image");
    await expect(image).toHaveAttribute("href", `/art/rivals/${file}.png`);
    const response = await page.request.get(`/art/rivals/${file}.png`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await openTitle(page, { highContrast: true });
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page.locator(".portrait").first()).toBeVisible();
  await expect(page.locator(".portrait image")).toHaveCount(0);
});
