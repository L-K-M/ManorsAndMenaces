# Manors & Menaces

> [!IMPORTANT]
> LLM disclosure: This codebase was written with substantial help from large language models: AI coding agents working from the [`AGENTS.md`](AGENTS.md) brief in this repo.

**Latest release:** v<!-- version -->0.2.0<!-- /version --> · [Download](https://github.com/L-K-M/ManorsAndMenaces/releases/latest)

*Build wisely. Trouble wanders.*

A competitive turn-based fantasy strategy board game for 2–4 players. Build roads and manors across a cheerful fantasy realm, plant **Banners** to choose exactly what you will harvest next turn — no production dice — and use Royal Writs, Wardens, knights, wizards, trolls and dragons to make everyone else's plans slightly worse.

- **Play modes:** hot-seat pass-and-play, humans vs. AI (easy/normal/hard), online private matches (live or asynchronous) with invite links.
- **Platforms:** web (static hosting, offline-capable), Windows/macOS/Linux via Tauri; the server runs anywhere Node 22 or Docker runs.
- **Design document:** [`manors_and_menaces_project_spec.md`](manors_and_menaces_project_spec.md) (revision v0.2; §129 lists what changed and why).

## Quick start

```sh
corepack enable            # provides pnpm (Node 25+: npm install -g corepack first)
pnpm install
pnpm dev                   # web client on http://localhost:5173
pnpm server                # online server on http://localhost:8787 (optional)
```

Or run the whole online stack in Docker:

```sh
docker compose up -d --build   # web client + API on http://localhost:8787
```

To run a server for other people, see [Hosting a server](#hosting-a-server).

## Hosting a server

The Docker image serves the web game and the online API from one address. These steps put it on a machine of yours, such as a small VPS, with HTTPS and, if you like, invites. You need a Linux host with git, Docker and the Docker Compose plugin, and a domain name that points at the host. The examples use `play.example.org`.

### 1. Configure

```sh
git clone https://github.com/L-K-M/ManorsAndMenaces.git
cd ManorsAndMenaces
cp .env.example .env
```

`.env` holds the server's settings; [`.env.example`](.env.example) explains each one. For a server on the internet behind the HTTPS proxy of step 3, set these in `.env`:

```sh
PORT=127.0.0.1:8787
TRUST_PROXY=1
PUBLIC_URL=https://play.example.org
PUSH_CONTACT=you@example.org
INVITE_ONLY=true
```

- `PORT=127.0.0.1:8787` lets only the proxy on the same machine reach the server. Ports that Docker publishes bypass firewalls such as ufw.
- `TRUST_PROXY=1` makes rate limits count each player separately, not everyone behind the proxy together.
- `PUBLIC_URL` is where players open the game. The invite command prints whole links with it.
- `PUSH_CONTACT` is your email address for the Web Push services that deliver turn notifications, so that they can reach you if your server misbehaves.
- `INVITE_ONLY=true` lets in only the people you invite. Leave it `false` to open the game to everyone.

Turn emails need an SMTP account as well: set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` (see `.env.example` and [Email](docs/notifications.md#email)).

### 2. Start the server

```sh
docker compose up -d --build
docker compose logs manors
```

`--build` builds the image from your checkout, so the server runs the code you have. Without it, Compose runs the image it built last, or downloads the latest release's image if there is none, and that image may lack features your checkout has.

The log shows how the server started:

```
Invite-only: on (make invites with: node server.mjs invites create NAME)
Turn emails: off (set SMTP_HOST, MAIL_FROM and PUBLIC_URL to turn them on)
Manors & Menaces server listening on :8787 (db /data/manors.sqlite)
```

If you set `INVITE_ONLY=true` and the log has no `Invite-only` line, the server is older than invites: start it with `--build`.

The server restarts by itself after a crash or a reboot. After you change `.env`, run `docker compose up -d` to apply it.

### 3. Add HTTPS

Put a reverse proxy with a certificate in front of the server. Browsers offer turn notifications only to HTTPS sites, and players' sessions and invites should not cross the internet unencrypted.

[Caddy](https://caddyserver.com/docs/install) gets and renews a certificate by itself. Install it on the same host, put this in `/etc/caddy/Caddyfile`, and run `sudo systemctl reload caddy`:

```
play.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

Caddy passes WebSockets through and keeps idle ones open. It also replaces `X-Forwarded-For` with the player's address, which is what `TRUST_PROXY=1` expects.

Another proxy (nginx, Traefik) works too if it:

- passes WebSocket upgrades on `/api/ws` through;
- sets `X-Forwarded-For`, appending to or replacing the header it received (never passing a client's own through untouched), and `X-Forwarded-Proto`;
- keeps idle WebSockets open for more than 10 minutes. nginx closes them after 60 seconds unless you raise its timeouts; see [Idle WebSockets and the Android app](docs/notifications.md#idle-websockets-and-the-android-app).

Then open `https://play.example.org`.

### 4. Invite people

Skip this step if you left `INVITE_ONLY=false`.

On an invite-only server everyone needs an invite, you included. Make one for yourself first:

```sh
docker compose exec manors node server.mjs invites create "Your Name"
```

```
Invite for Your Name (id k3m9x2): any number of devices, no expiry, 10 invites of their own.
https://play.example.org/invite/pnbuxsq7srgq
```

Open the link in each browser you play in and press **Accept invite**. In the desktop and Android apps, paste the link when the online lobby asks for an invite.

Then make a link for each person you invite and send it to them:

```sh
docker compose exec manors node server.mjs invites create Anna --uses 3 --days 14
```

- `--uses N`: how many devices the link lets in (`1` for a single-use link). Default: any number.
- `--days N`: for how many days the link lets new devices in. Devices already in stay in. Default: no limit.
- `--invites N`: how many people Anna may invite in turn, from **Invite friends** in the online lobby. Default: 10.

To see who came in through which invite, or to shut someone out:

```sh
docker compose exec manors node server.mjs invites list
docker compose exec manors node server.mjs invites revoke ID
```

`ID` is the invite's id from the list. Revoking an invite shuts out every device and player it let in; the invites they made for others keep working until you revoke those too. [`docs/invites.md`](docs/invites.md) has the details.

### 5. Updates and backups

To update to the latest code:

```sh
./update.sh
```

It pulls `main`, rebuilds the image on the current Node 22 base image, so that Node and Debian security fixes arrive too, and restarts the server. Open games reconnect by themselves, and computer players carry on.

Everything the server keeps (matches, players, invites, the Web Push keys) is in one SQLite database in the `manors-data` Docker volume. Back it up regularly. Stop the server for a moment while you copy it, so the copy is consistent:

```sh
docker compose stop manors
docker compose cp manors:/data "$HOME/manors-backup-$(date +%F-%H%M%S)"
docker compose start manors
```

Each backup gets a folder of its own, because the files in it belong together: besides `manors.sqlite`, it can hold `manors.sqlite-wal` with the latest changes, if the server had to be stopped forcibly.

To restore a backup, replace the database with all of its files, in a container of the server's image so that they belong to the user the server runs as:

```sh
docker compose stop manors
docker compose run --rm -v "$HOME/manors-backup-2026-09-26-093000:/backup:ro" manors sh -c '
  test -f /backup/manors.sqlite || { echo "No manors.sqlite in the backup folder; nothing changed" >&2; exit 1; }
  rm -f /data/manors.sqlite* && cp /backup/manors.sqlite* /data/'
docker compose start manors
```

If the folder holds no `manors.sqlite`, say because its name is mistyped, the restore stops before it deletes anything.

[`docs/notifications.md`](docs/notifications.md) explains how players get turn notifications (Android in detail) and what the server needs for them.

## How to play (short)

1. Each Manor raises a Banner; a Stronghold raises two. Plant them in neighbouring Regions.
2. At the start of your turn every Banner produces its Region's resource — unless a Menace interferes.
3. Spend resources on Routes (1 Timber + 1 Stone), Manors (1 Grain + 1 Timber + 1 Stone) and Strongholds (2 Grain + 2 Iron).
4. Most Regions hold one Banner. Send a rival's settled Banner home with a **Royal Writ** (1 Essence + a 1-resource bribe paid to them).
5. **Hire a Warden** (1 Essence + 1 Grain) to move a Menace — ideally onto someone else's problem.
6. First to 15 Renown wins (13 with 4 players, and 10 in the Core rules). You can instead pick 15, 20, 25 or 30 when you create a game. Manors are worth 1, Strongholds 2, Royal Quests 1–2. Once the Quest deck runs out, each round the **Crown's Levy** names a resource: pay 5 of it for 1 Renown (2 at goals of 25 and 30), once a round. If the board fills up first (no Site left to build on and every Holding a Stronghold), the game ends with that round and the most Renown wins. If nobody has won when round 30 ends, the game ends and the most Renown wins.

The in-game tutorial teaches all of this interactively.

## License

MIT — see [LICENSE](LICENSE).

The bundled sound effects by Kenney and music by RandomMind are CC0 releases.
See [sound sources and preparation notes](media-sources/audio/README.md) for
credits, original files, license links and regeneration instructions.
