import { expect, test, type Page } from "@playwright/test";
import { ISLANDS } from "@manors-menaces/content";
import { pick } from "./pick";

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
    await expect(menace).toHaveAttribute("aria-label", /^(Toll Troll|Young Dragon|Bog Witch|Highwaywoman|Goblin Tinkers): /);
    expect((await menace.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  }
  // Animation is off in these settings, so nothing idles.
  await expect(page.locator(".figure.idle")).toHaveCount(0);

  // The island's name sits on a cartouche in the sea.
  await expect(page.locator("svg.board .map-name")).toHaveText(new RegExp(`^(${ISLANDS.map((i) => i.name).join("|")})$`));

  // Terrain art is decoration: it never takes the pointer.
  const terrain = page.locator("svg.board .terrain");
  await expect(terrain).toHaveCount(1);
  expect(await terrain.locator("path[data-ink]").count()).toBeGreaterThan(50);
  expect(await terrain.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  // It replaces the hatch patterns, which only high contrast keeps.
  await expect(page.locator('svg.board path[fill^="url(#hatch-"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("targeting keeps creature artwork saturated without enabling unavailable targets", async ({ page }) => {
  await startHotseat(page);
  const creature = page.locator(".menace:not(.hl)").first();
  await expect(creature).toBeVisible();
  expect(await creature.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(await creature.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(creature).toHaveAttribute("tabindex", "-1");
});

test("Holdings and Menaces stand out from the resource discs @mobile", async ({ page }) => {
  await startHotseat(page);
  await page.locator(".site.hl").first().click();
  const disc = (await page.locator('.region circle[r="17"]').first().boundingBox())!;
  const manor = page.locator(".holding .piece.manor");
  await expect(manor).toBeVisible();
  expect((await manor.boundingBox())!.width).toBeGreaterThan(disc.width * 1.15);
  for (const image of await page.locator(".menace .painted image").all()) {
    expect((await image.boundingBox())!.width).toBeGreaterThan(disc.width * 1.9);
  }
  // The larger figures must not intercept the free Route being placed next.
  await pick(page.locator(".route.hl").first());
  await expect(page.locator(".route[aria-label*='owned by']")).toHaveCount(1);
});

test("painted menaces load with transparent backgrounds", async ({ page }) => {
  await startHotseat(page);
  await expect(page.locator(".menace .painted image")).toHaveCount(2);
  const assets = await page.evaluate(async () => {
    const names = ["toll-troll", "young-dragon", "highwayman", "bog-witch", "goblin-tinkers"];
    return Promise.all(names.map(async (name) => {
      const image = new Image();
      image.src = `/art/menaces/${name}.png`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return { name, width: image.naturalWidth, height: image.naturalHeight,
        cornerAlpha: context.getImageData(0, 0, 1, 1).data[3],
        centreAlpha: context.getImageData(128, 128, 1, 1).data[3] };
    }));
  });
  for (const asset of assets) {
    expect(asset, asset.name).toMatchObject({ width: 256, height: 256, cornerAlpha: 0 });
    expect(asset.centreAlpha, asset.name).toBeGreaterThan(0);
  }
});

test("painted landmarks load as transparent miniatures", async ({ page }) => {
  await startHotseat(page);
  const images = page.locator("svg.board .painted-landmark");
  await expect(images).toHaveCount(5);
  const assets = await images.evaluateAll(async (els) => Promise.all(els.map(async (el) => {
    const image = new Image();
    image.src = el.getAttribute("href")!;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return { source: image.src, width: image.naturalWidth, height: image.naturalHeight,
      cornerAlpha: context.getImageData(0, 0, 1, 1).data[3],
      centreAlpha: context.getImageData(128, 128, 1, 1).data[3] };
  })));
  expect(new Set(assets.map((asset) => asset.source)).size).toBe(5);
  for (const asset of assets) {
    expect(asset, asset.source).toMatchObject({ width: 256, height: 256, cornerAlpha: 0 });
    expect(asset.centreAlpha, asset.source).toBeGreaterThan(0);
  }
});

test("high contrast and failed image loads retain vector creatures and landmarks", async ({ page }) => {
  await startHotseat(page, { highContrast: true });
  await expect(page.locator(".menace image")).toHaveCount(0);
  expect(await page.locator(".menace .body path").count()).toBeGreaterThan(10);
  await expect(page.locator(".landmark-art image")).toHaveCount(0);
  expect(await page.locator(".landmark-art path").count()).toBeGreaterThan(20);

  await page.route("**/art/menaces/*.png", (route) => route.abort());
  await page.route("**/art/landmarks/*.png", (route) => route.abort());
  await startHotseat(page);
  await expect(page.locator(".menace image")).toHaveCount(0);
  expect(await page.locator(".menace .body path").count()).toBeGreaterThan(10);
  await expect(page.locator(".landmark-art image")).toHaveCount(0);
  expect(await page.locator(".landmark-art path").count()).toBeGreaterThan(20);
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

/** Every highlighted Route's glow changes a clearly visible band of pixels. */
async function expectRoutesLit(page: Page) {
  const routes = await page.locator(".route.hl").all();
  expect(routes.length).toBeGreaterThan(0);
  // Chrome runs an SVG element's looping opacity animation on the
  // compositor, and over the terrain those layers sometimes never showed,
  // leaving legal targets unmarked. The marks inside the board stay still;
  // only the separate glow <svg> above the board breathes.
  const loopingMarks = await page.evaluate(
    () =>
      document
        .getAnimations()
        .map((a) => a.effect as KeyframeEffect | null)
        .filter((e) => e?.target?.matches(".hl-casing, .hl-edge, .hl-line, .hl-ring, .dest, .veil") && e.getComputedTiming().iterations === Infinity).length,
  );
  expect(loopingMarks).toBe(0);
  // Freeze every animation (the glow, idle Menaces) so the two shots are
  // comparable. Rate 0 keeps them running animations, laid out as players
  // see them; pausing would change how Chrome layers them.
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      a.currentTime = 0;
      a.playbackRate = 0;
    }),
  );
  // Hide every glow at once for the comparison shot: hiding one at a time
  // re-layers the others and can make a missing glow reappear.
  const lit = await page.screenshot();
  await page.locator(".hl-line").evaluateAll((els) => els.forEach((e) => ((e as SVGElement).style.display = "none")));
  const unlit = await page.screenshot();
  await page.locator(".hl-line").evaluateAll((els) => els.forEach((e) => ((e as SVGElement).style.display = "")));
  for (const route of routes) {
    const box = (await route.boundingBox())!;
    const clip = { x: Math.round(box.x - 6), y: Math.round(box.y - 6), width: Math.round(box.width + 12), height: Math.round(box.height + 12) };
    // A visible highlight changes a band a few pixels wide along the Route.
    const length = Math.hypot(box.width, box.height);
    expect(await changedPixels(page, lit, unlit, clip), (await route.getAttribute("aria-label")) ?? "").toBeGreaterThan(length * 2);
  }
}

test("highlighted Routes stay clearly visible over the terrain art", async ({ page }) => {
  await startHotseat(page);
  await page.locator(".site.hl").first().click();
  await expectRoutesLit(page);
});

test("highlighted Routes stay visible on a busy main-phase board", async ({ page }) => {
  // On this board (three players, their Holdings, Routes and Banners) an
  // opacity pulse, which Chrome animates on the compositor, left the
  // Route highlights invisible over the terrain.
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "3", exact: true }).check({ force: true });
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("review-seed");
  await page.getByRole("button", { name: "Begin" }).click();
  const mainTurn = page.getByRole("button", { name: /Assign Banners →/ });
  for (let k = 0; k < 30 && !(await mainTurn.count()); k++) {
    const status = page.locator(".actions .status").first();
    const s = (await status.count()) ? ((await status.textContent()) ?? "") : "";
    if (/place a Manor/.test(s)) await page.locator(".site.hl").first().click();
    else if (/free Route/.test(s)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(s)) {
      const n = await page.locator(".banner.hl").count();
      for (let i = 0; i < n; i++) {
        await page.locator(".banner.hl").nth(i).click();
        const regions = page.locator(".region.hl");
        if (await regions.count()) await pick(regions.first());
      }
      await page.getByRole("button", { name: /Confirm Banners/ }).click();
    }
    await page.waitForTimeout(700);
  }
  await expect(mainTurn).toBeVisible();
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Build Route/ }).click();
  await expectRoutesLit(page);
});

test("high contrast swaps the terrain art for hatching; Menaces idle when animation is on", async ({ page }) => {
  await startHotseat(page, { animationSpeed: "normal", highContrast: true });
  await expect(page.locator(".site.hl").first()).toBeVisible();
  await expect(page.locator("svg.board .terrain path[data-ink]")).toHaveCount(0);
  await expect(page.locator('svg.board path[fill^="url(#hatch-"]').first()).toBeVisible();
  expect(
    await page
      .locator("svg.board .layer-fills .fill")
      .first()
      .evaluate((el) => getComputedStyle(el).stroke),
  ).toBe("rgb(0, 0, 0)");
  expect(await page.locator(".figure.idle").count()).toBeGreaterThan(0);
});

test("terrain art paints over the Region fills and under their tints and labels", async ({ page }) => {
  await startHotseat(page);
  await expect(page.locator(".site.hl").first()).toBeVisible();
  // Every terrain path (motifs, streams, ridges) paints after every Region
  // fill and before every Region button's children: the group that holds
  // the target tint, and the label group (disc, pips, name, harvest notes).
  const report = await page.locator("svg.board").evaluate((svg) => {
    const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const art = [...svg.querySelectorAll(".terrain path")];
    const fills = [...svg.querySelectorAll("path.fill")];
    const over = [...svg.querySelectorAll(".region > g")];
    const misplaced = art.filter((p) => !fills.every((f) => follows(f, p)) || !over.every((o) => follows(p, o)));
    return {
      art: art.length,
      fills: fills.length,
      regions: svg.querySelectorAll(".region").length,
      over: over.length,
      misplaced: misplaced.map((p) => p.getAttribute("data-ink") ?? p.getAttribute("class")),
    };
  });
  expect(report.art).toBeGreaterThan(50);
  expect(report.fills).toBe(report.regions);
  expect(report.over).toBe(report.regions * 2);
  expect(report.misplaced).toEqual([]);
});

test("Menace figures hold still when the system asks for reduced motion", async ({ page }) => {
  // Settings saved before the OS preference changed still say animate.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startHotseat(page, { animationSpeed: "normal", reducedMotion: false });
  await expect(page.locator(".figure.idle").first()).toBeAttached();
  const moving = await page
    .locator("svg.board .figure")
    .evaluateAll((figures) => figures.flatMap((f) => [...f.querySelectorAll("*")]).filter((el) => getComputedStyle(el).animationName !== "none").length);
  expect(moving).toBe(0);
});
