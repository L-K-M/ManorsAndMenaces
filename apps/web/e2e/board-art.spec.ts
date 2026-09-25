import { expect, test, type Page } from "@playwright/test";

// The illustrated board: terrain, landmark art, Menace figures, the sea
// cartouche, and how settings (animation, high contrast) change them.

async function startHotseat(page: Page, settings: Record<string, unknown> = {}) {
  await page.goto("/");
  await page.evaluate((extra) => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true, ...extra }));
    indexedDB.deleteDatabase("manors-menaces");
  }, settings);
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-seed");
  await page.getByRole("button", { name: "Begin" }).click();
  await page
    .getByRole("button", { name: "Tap to begin turn" })
    .click({ timeout: 1500 })
    .catch(() => undefined);
}

test("landmarks, Menaces and the map name are drawn as art", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await startHotseat(page);

  // Every landmark has its own illustration.
  const landmarks = await page.locator("[data-landmark]").evaluateAll((els) => els.map((e) => e.getAttribute("data-landmark")));
  expect(new Set(landmarks).size).toBe(5);

  // A Manor built on the Royal Castle stands in front of it, not over it.
  const castleSite = page.locator(".site", { has: page.locator('[data-landmark="royal_castle"]') });
  await expect(castleSite).toHaveClass(/\bhl\b/);
  await castleSite.click();
  await expect(castleSite.locator(".holding")).toBeVisible();
  const art = (await castleSite.locator("[data-landmark]").boundingBox())!;
  const holding = (await castleSite.locator(".holding").boundingBox())!;
  expect(art.x).toBeLessThan(holding.x - 4);
  expect(art.y).toBeLessThan(holding.y);

  // Menaces are figures, not medallions, and keep their accessible names.
  const menaces = page.locator(".menace");
  expect(await menaces.count()).toBeGreaterThan(0);
  for (const menace of await menaces.all()) {
    await expect(menace.locator("[data-menace]")).toHaveCount(1);
    await expect(menace).toHaveAttribute("aria-label", /^(Toll Troll|Young Dragon|Bog Witch|Highwayman|Goblin Tinkers): /);
    expect((await menace.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  }
  // Animation is off in these settings, so nothing idles.
  await expect(page.locator(".figure.idle")).toHaveCount(0);

  // The map's name sits on a cartouche in the sea.
  await expect(page.locator("svg.board .map-name")).toHaveText("The Greenvale");

  // Terrain art is decoration: it never takes the pointer.
  const terrain = page.locator("svg.board .terrain");
  await expect(terrain).toHaveCount(1);
  expect(await terrain.locator("path[data-ink]").count()).toBeGreaterThan(50);
  expect(await terrain.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  expect(errors).toEqual([]);
});

/** Pixels inside `clip` that differ clearly between two PNG screenshots. */
async function changedPixels(page: Page, a: Buffer, b: Buffer, clip: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(
    async ([a, b, clip]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = `data:image/png;base64,${src}`;
        });
      const pixels = (img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const g = canvas.getContext("2d")!;
        g.drawImage(img, 0, 0);
        return g.getImageData(clip.x, clip.y, clip.width, clip.height).data;
      };
      const [pa, pb] = (await Promise.all([load(a), load(b)])).map(pixels) as [Uint8ClampedArray, Uint8ClampedArray];
      let n = 0;
      for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!) > 60) n++;
      return n;
    },
    [a.toString("base64"), b.toString("base64"), clip] as const,
  );
}

test("highlighted Routes stay clearly visible over the terrain art", async ({ page }) => {
  await startHotseat(page);
  await page.locator(".site.hl").first().click();
  const routes = await page.locator(".route.hl").all();
  expect(routes.length).toBeGreaterThan(0);
  // Hold the highlight's pulse at its brightest (still an animation, as
  // players see it) so the two shots are comparable.
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = 0;
    }),
  );
  for (const route of routes) {
    const box = (await route.boundingBox())!;
    const clip = { x: Math.round(box.x - 6), y: Math.round(box.y - 6), width: Math.round(box.width + 12), height: Math.round(box.height + 12) };
    const lit = await page.screenshot();
    await route.locator(".hl-line").evaluate((e) => ((e as SVGElement).style.display = "none"));
    const unlit = await page.screenshot();
    await route.locator(".hl-line").evaluate((e) => ((e as SVGElement).style.display = ""));
    // A visible highlight changes a band a few pixels wide along the Route.
    const length = Math.hypot(box.width, box.height);
    expect(await changedPixels(page, lit, unlit, clip), (await route.getAttribute("aria-label")) ?? "").toBeGreaterThan(length * 2);
  }
});

test("high contrast swaps the terrain art for hatching; Menaces idle when animation is on", async ({ page }) => {
  await startHotseat(page, { animationSpeed: "normal", highContrast: true });
  await expect(page.locator(".site.hl").first()).toBeVisible();
  await expect(page.locator("svg.board .terrain path[data-ink]")).toHaveCount(0);
  const hatch = page.locator('svg.board .region path[fill^="url(#hatch-"]').first();
  expect(await hatch.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");
  expect(await page.locator(".figure.idle").count()).toBeGreaterThan(0);
});
