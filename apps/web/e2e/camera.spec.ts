import { expect, test, type Page } from "@playwright/test";

// Board camera (spec §48): drag, wheel, pinch-wheel, keyboard and framing.

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function startHotseat(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByRole("radio", { name: /Core/ }).check();
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-seed");
  await page.getByRole("button", { name: "Begin" }).click();
  await passCurtain(page);
  await expect(page.locator(".site.hl").first()).toBeVisible();
}

async function passCurtain(page: Page) {
  await page
    .getByRole("button", { name: "Tap to begin turn" })
    .click({ timeout: 1500 })
    .catch(() => undefined);
}

async function viewBox(page: Page): Promise<Box> {
  // Camera writes are batched to the next animation frame; read after it.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const raw = (await page.locator("svg.board").getAttribute("data-camera")) ?? "";
  const [x, y, w, h] = raw.split(/[\s,]+/).map(Number) as [number, number, number, number];
  return { x, y, w, h };
}

async function boardRect(page: Page) {
  const r = await page.locator("svg.board").boundingBox();
  if (!r) throw new Error("board not visible");
  return r;
}

async function zoomIn(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByRole("button", { name: "Zoom in" }).click();
}

test("a slow mouse drag pans the board and does not pick", async ({ page }) => {
  await startHotseat(page);
  await zoomIn(page, 2);
  const r = await boardRect(page);
  const before = await viewBox(page);
  const unitsPerPx = before.w / r.width;

  // 120 px in 2 px steps: each step is below the drag threshold on its own.
  const start = { x: r.x + r.width * 0.3, y: r.y + r.height * 0.5 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y, { steps: 60 });
  await page.mouse.up();

  const after = await viewBox(page);
  expect(before.x - after.x).toBeGreaterThan(110 * unitsPerPx);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  // The drag ended over the board, but it must not count as a click.
  await expect(page.locator(".site.hl").first()).toBeVisible();
  await expect(page.locator(".route.hl")).toHaveCount(0);
});

test("releasing a drag outside the board leaves no stale pointer", async ({ page }) => {
  await startHotseat(page);
  await zoomIn(page, 2);
  const r = await boardRect(page);

  // Press near the bottom edge, creep out of the board and release there.
  const start = { x: r.x + r.width * 0.5, y: r.y + r.height - 6 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, r.y + r.height + 30, { steps: 18 });
  await page.mouse.up();
  const released = await viewBox(page);

  // Hovering afterwards with no button pressed must not pan.
  await page.mouse.move(start.x - 200, r.y + r.height * 0.4, { steps: 10 });
  await page.mouse.move(start.x + 150, r.y + r.height * 0.6, { steps: 10 });
  expect(await viewBox(page)).toEqual(released);
});

test("two-finger scroll pans, ctrl+wheel and wheel notches zoom", async ({ page }) => {
  await startHotseat(page);
  await zoomIn(page, 2);
  const r = await boardRect(page);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);

  // Horizontal swipe: pans sideways only.
  let before = await viewBox(page);
  await page.mouse.wheel(40, 0);
  let after = await viewBox(page);
  expect(after.w).toBeCloseTo(before.w, 5);
  expect(after.y).toBeCloseTo(before.y, 5);
  expect(after.x).toBeGreaterThan(before.x);

  // Ten small trackpad deltas barely change the zoom.
  before = after;
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -2);
  after = await viewBox(page);
  expect(Math.abs(after.w / before.w - 1)).toBeLessThan(0.05);

  // Pinch on a trackpad arrives as ctrl+wheel and zooms in around the pointer.
  before = after;
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -20);
  await page.keyboard.up("Control");
  after = await viewBox(page);
  expect(after.w).toBeLessThan(before.w * 0.9);

  // A mouse wheel notch zooms out by a gentle, fixed step.
  before = after;
  await page.mouse.wheel(0, 100);
  after = await viewBox(page);
  expect(after.w / before.w).toBeGreaterThan(1.1);
  expect(after.w / before.w).toBeLessThan(1.25);
});

test("a two-finger pinch zooms and pans together @mobile", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "needs touch input");
  await startHotseat(page);
  const r = await boardRect(page);
  const before = await viewBox(page);
  const toBoard = (vb: Box, px: number, py: number) => ({ x: vb.x + ((px - r.x) * vb.w) / r.width, y: vb.y + ((py - r.y) * vb.h) / r.height });

  // Spread two fingers apart while moving their midpoint down and right.
  const cdp = await page.context().newCDPSession(page);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const fingers = (i: number) => {
    const spread = 40 + i * 4;
    const mx = cx + i * 2;
    const my = cy + i * 3;
    return [
      { x: mx - spread, y: my, id: 0 },
      { x: mx + spread, y: my, id: 1 },
    ];
  };
  const anchor = toBoard(before, cx, cy);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(0) });
  for (let i = 1; i <= 15; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(i) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  const after = await viewBox(page);
  expect(after.w).toBeLessThan(before.w * 0.7);
  // The board point that began under the fingers ends under their midpoint.
  const now = toBoard(after, cx + 30, cy + 45);
  expect(Math.abs(now.x - anchor.x)).toBeLessThan(2);
  expect(Math.abs(now.y - anchor.y)).toBeLessThan(2);
  // A pinch is never a pick.
  await expect(page.locator(".route.hl")).toHaveCount(0);
});

test("a tap on a target still picks it @mobile", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "needs touch input");
  await startHotseat(page);
  await page.locator(".site.hl").first().tap();
  await expect(page.locator(".route.hl").first()).toBeAttached();
});

test("arrow keys pan and double-click zooms in", async ({ page }) => {
  await startHotseat(page);
  await zoomIn(page, 2);
  const before = await viewBox(page);
  await page.keyboard.press("ArrowRight");
  const panned = await viewBox(page);
  expect(panned.x).toBeGreaterThan(before.x);
  expect(panned.w).toBeCloseTo(before.w, 5);

  const r = await boardRect(page);
  await page.mouse.dblclick(r.x + 30, r.y + 30);
  expect((await viewBox(page)).w).toBeLessThan(panned.w * 0.8);
});

test("a new targeting step brings off-screen targets into view @mobile", async ({ page }) => {
  await startHotseat(page);
  await page.locator(".site.hl").first().click();
  // Zoom right in, so most of the island is off-screen, then place the
  // Route from the keyboard (it need not be on screen for that).
  for (let i = 0; i < 8; i++) await page.keyboard.press("+");
  await page.locator(".route.hl").first().focus();
  await page.keyboard.press("Enter");

  // Player 2's Manor placement highlights sites all over the island.
  await passCurtain(page);
  await expect(page.locator(".site.hl").first()).toBeAttached();
  const r = await boardRect(page);
  await viewBox(page);
  const centres = await page.locator(".site.hl").evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }),
  );
  const inside = centres.filter((c) => c.x >= r.x && c.x <= r.x + r.width && c.y >= r.y && c.y <= r.y + r.height);
  expect(inside.length).toBeGreaterThanOrEqual(centres.length / 2);
});
