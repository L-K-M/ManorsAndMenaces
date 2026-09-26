import { expect, test, type Browser, type Page } from "@playwright/test";
import { INVITE_SERVER, operatorInvite } from "./invites";

// An invite-only server, reached like the desktop and Android apps reach it:
// from another origin, so the lobby asks for the invite once. Everyone
// invited may then invite friends of their own.

async function lobby(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false })));
  await page.reload();
  await page.getByRole("button", { name: "Play online" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByText("Server", { exact: true }).click();
  await page.getByLabel("Server address").fill(INVITE_SERVER);
  await page.getByRole("button", { name: "Continue as guest" }).click();
  return page;
}

async function acceptInvite(page: Page, link: string) {
  await expect(page.getByText(/This server is invite-only/)).toBeVisible();
  await page.getByLabel("Invite link or code").fill(link);
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByRole("heading", { name: /Your matches/ })).toBeVisible();
}

test("the apps ask for the invite once, and invited players invite friends", async ({ browser }) => {
  const ivy = await lobby(browser, "Ivy");
  await expect(ivy.getByLabel("Invite link or code")).toBeVisible();
  await ivy.getByLabel("Invite link or code").fill("not-a-code");
  await ivy.getByRole("button", { name: "Continue as guest" }).click();
  await expect(ivy.getByRole("alert")).toContainText("That invite doesn't work");
  await acceptInvite(ivy, operatorInvite("Ivy"));

  // Remembered: the next visit goes straight in.
  await ivy.reload();
  await ivy.getByRole("button", { name: "Play online" }).click();
  await expect(ivy.getByRole("heading", { name: /Your matches/ })).toBeVisible();

  const friends = ivy.getByRole("region", { name: "Invite friends" });
  await expect(friends).toContainText("You can invite 10 more people.");
  await friends.getByLabel("Their name").fill("Jo");
  await friends.getByRole("button", { name: "Make invite link" }).click();
  await expect(friends).toContainText("You can invite 9 more people.");
  await expect(friends.getByText("Not used yet")).toBeVisible();
  await expect(friends.getByLabel("Invite link for Jo")).toHaveValue(new RegExp(`^${INVITE_SERVER}/invite/[a-z0-9]{12}$`));

  // A link made by mistake can be taken back while nobody has used it.
  await friends.getByRole("button", { name: "Withdraw" }).click();
  await expect(friends.getByLabel("Invite link for Jo")).toHaveCount(0);
  await expect(friends).toContainText("You can invite 10 more people.");

  await friends.getByLabel("Their name").fill("Kim");
  await friends.getByRole("button", { name: "Make invite link" }).click();
  const kimLink = await friends.getByLabel("Invite link for Kim").inputValue();
  const kim = await lobby(browser, "Kimberly");
  await acceptInvite(kim, kimLink);
  // Accepting an invite names the player after it.
  expect(await kim.evaluate(() => localStorage.getItem("mm.playerName.v1"))).toBe("Kim");
  await expect(kim.getByRole("region", { name: "Invite friends" })).toContainText("You can invite 10 more people.");

  await ivy.getByRole("button", { name: "Back" }).last().click();
  await ivy.getByRole("button", { name: "Play online" }).click();
  await expect(ivy.getByRole("region", { name: "Invite friends" }).getByText("Used on 1 of 3 devices")).toBeVisible();
  await expect(ivy.getByRole("region", { name: "Invite friends" }).getByRole("button", { name: "Withdraw" })).toHaveCount(0);
});
