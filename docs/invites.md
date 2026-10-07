# Invite-only servers

You can put the game online without opening it to everyone. On an invite-only server, only people you invite can open the web game or play online. Everyone you invite can invite up to ten more people from the online lobby.

- [Turning it on](#turning-it-on)
- [Inviting people](#inviting-people)
- [What invited players can do](#what-invited-players-can-do)
- [Revoking an invite](#revoking-an-invite)
- [Giving invites away from a website](#giving-invites-away-from-a-website)
- [What people without an invite see](#what-people-without-an-invite-see)
- [How access works](#how-access-works)

## Turning it on

Set `INVITE_ONLY=true` for the server. With Docker Compose, set it in the `.env` file next to `docker-compose.yml` (copy `.env.example` to `.env` if you have none; [Hosting a server](../README.md#hosting-a-server) walks through a whole setup):

```sh
INVITE_ONLY=true
PUBLIC_URL=https://play.example.org   # optional: lets the invite command print whole links
```

Then restart the server (`docker compose up -d`). The log says `Invite-only: on`.

Nothing else changes for players who already have an invite. Guest sessions from before invites were turned on keep their matches: the first time such a player opens an invite link (in a browser) or enters its code (in the apps), their session is admitted.

## Inviting people

Create a personal invite for each person with the `invites` command. It runs next to the server, on the same database, while the server keeps running:

```sh
docker compose exec manors node server.mjs invites create Anna
```

```
Invite for Anna (id k3m9x2): any number of devices, no expiry, 10 invites of their own.
https://play.example.org/invite/pnbuxsq7srgq
```

Send Anna the link. In a checkout, `pnpm invites create Anna` does the same against `DB_PATH`.

Options for `create`:

| Option | Meaning | Default |
| --- | --- | --- |
| `--uses N` | How many devices the link admits. `--uses 1` makes a single-use link. | Any number |
| `--days N` | How many days the link admits new devices. Devices already in stay in after that. | No limit |
| `--invites N` | How many invites the person may make for others. `0` for none. | 10 |

`invites list` shows every invite: who made it, how many devices accepted it, the players (their names in the game) who came in through it, how many invites it has made, and its link.

```
k3m9x2  Anna, invited by you, active
  2 devices (any number allowed), 1 of 10 invites made
  players: Anna, Annie
  https://play.example.org/invite/pnbuxsq7srgq
w8hq4c  Bert, invited by Anna, active
  1 device (3 allowed), 0 of 10 invites made
  players: Bert
  https://play.example.org/invite/7yq2cz3k9dmf
```

## What invited players can do

Once in, a player sees an **Invite friends** section in the online lobby. There they:

- make a personal link for each person, by name, up to ten in all (or the number you set with `--invites`);
- see which of their links have been used;
- withdraw a link nobody has used yet, which frees its place.

A link a player makes works on up to three devices: one person's phone, tablet and computer. The limit keeps one link, passed around, from letting in more than one person. The people they invite may invite ten more each, and so on.

## Revoking an invite

```sh
docker compose exec manors node server.mjs invites revoke k3m9x2
```

Revoking an invite shuts out every device and player it let in, at once: the game's pages, the API and the WebSocket all refuse them. Other invites are not affected, including the ones the revoked person made for others. Revoke those too if you want them gone.

Two things revoking cannot take back:

- A browser keeps the copy of the game it cached. While it is offline it can still open that copy and play against the computer; once it is online again, it gets the invite-only page.
- The Android app's background connection keeps retrying, with growing pauses, until the player turns off **Notify me when it's my turn**.

## Giving invites away from a website

A website of yours, say a games page with a hidden carnival game, can hand a personal invite to each winner. A static site holds no secrets, so the server mints the invite: the site calls `POST /api/giveaway` and shows the link that comes back.

First make the *sponsor* invite the giveaway mints with, on the server's database like any other invite:

```sh
docker compose exec manors node server.mjs invites create Carnival --uses 1 --invites 50
```

```
Invite for Carnival (id k3m9x2): one device, no expiry, 50 invites of their own.
```

Keep the sponsor's own link to yourself: it is a real invite. Take the id from that output and set, next to `INVITE_ONLY=true`, the sponsor's id and the one website allowed to call the giveaway:

```sh
GIVEAWAY_INVITE=k3m9x2
GIVEAWAY_ORIGIN=https://apps.example.org
```

`PUBLIC_URL` must be set too, to build the invite links. Restart the server; the log says `Giveaway: on, invites from Carnival for https://apps.example.org (0 of 50 given)`.

The site then calls the endpoint for a winner (an optional `name` goes on the invite):

```sh
curl -X POST https://play.example.org/api/giveaway -H 'content-type: application/json' -d '{"name":"Wanda"}'
```

```json
{ "url": "https://play.example.org/invite/pnbuxsq7srgq", "code": "pnbuxsq7srgq", "name": "Wanda" }
```

`url` is the whole invite link to show the winner. Minted invites are ordinary friend invites made by the sponsor: three devices each, ten onward invites, and `invites list` shows them invited by the sponsor.

Three limits keep the giveaway bounded, because anyone can call the endpoint:

- The sponsor's quota (`--invites`) caps it in total; once that is gone the endpoint answers `410` with `GIVEAWAY_EMPTY`, as it does when the sponsor id is unknown or the sponsor invite is revoked.
- Each client address gets one invite per 24 hours; a second ask answers `429` with `GIVEAWAY_LIMIT`.
- Browsers may call it only from `GIVEAWAY_ORIGIN` (`403` `GIVEAWAY_ORIGIN`), so other sites cannot embed the giveaway. Requests without an `Origin` header, like curl and scripts, are allowed: a script could forge the header anyway.

So keep the quota modest and watch `invites list`. Revoking the sponsor stops new giveaways at once; it does not take back invites already given. Revoke those individually.

## What people without an invite see

Without an invite, every page of the site shows a short "Manors & Menaces is invite-only" page, and the API answers with `403` and the code `INVITE_REQUIRED`. The health check (`/api/health`) and the links in turn emails keep working.

An invite link that has expired, been used on all the devices it allows, been withdrawn or revoked shows "This invite doesn't work".

## How access works

- **In a browser on the server's own site**, opening an invite link shows who it is for and an **Accept invite** button. Opening the link alone uses nothing up, because link previews in chat apps and mail scanners open links too. Accepting it gives the browser a pass in a cookie, kept for 400 days and renewed on every visit, so the browser is remembered. Another invite link opened in a browser that already has a pass just opens the game.
- **In the desktop and Android apps** (and a web build hosted elsewhere), the lobby asks for the invite link or code once, the first time it signs in to the server. The guest session is admitted through the invite, so the app never asks again on that device.
- Accepting an invite names the player after it: the name on the invite becomes the name they play under. In a browser it is filled in for them, and they can change it before they first sign in.
- Each device that accepts an invite counts as one of its uses.
- Invite codes are 12 random characters (about 59 bits), and invite links are rate limited like the API, so they cannot be guessed.
