# Turn notifications

In an online match, especially an asynchronous one, you won't be watching the board when your turn comes. This guide explains how the game tells you, how to set that up on each kind of device (Android in particular), and what a server operator has to configure.

- [How it works](#how-it-works)
- [Which option to use](#which-option-to-use)
- [Android](#android)
- [iPhone and iPad](#iphone-and-ipad)
- [Computers](#computers)
- [Troubleshooting](#troubleshooting)
- [Running a server](#running-a-server)

## How it works

After every move the server checks who must act next. You get a notice when:

- it becomes your turn, including setup placements, a reaction you have to answer and a prophecy you have to resolve;
- the first turn of a new match is yours;
- a match you are in ends.

Nothing arrives while you are still the one acting. A long turn of many actions is one notice.

The server picks one way to reach you, depending on where the game is open:

| Where the game is open | What you get |
| --- | --- |
| That match is on screen | Nothing extra. The match shows your turn. |
| The game is open on another screen (title, lobby, another match), on any device signed in as you | A banner with an **Open** button, and a system notification if the page is in a background tab or minimized. Screen readers announce it. |
| The game is closed everywhere | A Web Push notification on every browser where you turned it on, **and** an email if you confirmed an address. |
| The Android app is closed, with **Notify me when it's my turn** on in it | An Android notification from the app's background connection. |

"Signed in as you" means the same guest. A guest belongs to one browser or one app install: your phone's Chrome and your laptop's Firefox are two guests unless you only ever play from one. Notification settings belong to the guest, and each match belongs to the guest that joined it. Set notifications up on the device you actually play that match from.

While the game is open anywhere, pushes and emails are held back. If your laptop has the game open in a forgotten tab, your phone stays quiet. The Android app's background connection counts as well: while it runs, your phone gets the notice and pushes and emails are held back. It does not make you look online to your opponents.

## Which option to use

| | Web Push | Android app | Email | App open only |
| --- | --- | --- | --- | --- |
| Arrives when the game is closed | Yes | Yes | Yes | No |
| Where it works | Browsers with Web Push: Chrome, Edge, Firefox, Safari (iOS: Home Screen web app only) | The Android app | Anywhere you read mail | The desktop app, the development server |
| Needs from the server | HTTPS and the production web build (nothing else to configure) | Nothing, if proxies in front let idle WebSockets stay open (see [Running a server](#running-a-server)) | The operator to set up SMTP | Nothing |
| Speed | Usually seconds. An idle phone may hold it back (see [Android](#android)). | Seconds | As fast as your mail app checks | Instant |
| If the device is off for a day | Dropped after 24 hours | Turns still waiting for you show up when it reconnects | Waits in your inbox | Missed; the lobby shows "your turn" later |

You can turn on both push and email. Each channel is independent, so you would then get both for the same turn.

## Android

There are three ways to get notices on an Android phone. Pick the one that matches how you play: in Chrome, in the Android app, or by email.

### Option 1: play in Chrome (recommended)

Chrome on Android supports Web Push for ordinary websites, so this works without installing anything.

1. Open the game's address in Chrome. It must start with `https://`.
2. Tap **Play online** and continue as a guest.
3. In the lobby, tick **Notify me when it's my turn** and tap **Allow** when Chrome asks.
   - If the prompt disappears before you answer, tick the box again.
   - On Android 13 and later, Chrome itself also needs permission to show notifications. If Android asks, allow it. Otherwise check **Settings > Apps > Chrome > Notifications**; the exact menu names vary by phone maker.
4. Optional: install the game (Chrome menu **⋮ > Add to Home screen** or **Install app**). You get an icon that opens it in its own window. An installed web app can show up in Android's settings as a separate app with its own notification switch. If notices stop after installing, check that switch as well.

To check or change the permission later:

- For this site: tap the icon to the left of the address in Chrome, then **Permissions > Notifications**.
- For all sites: Chrome menu **⋮ > Settings > Site settings > Notifications**.

**Make sure notices arrive on time.** Chrome receives pushes through Google's Firebase Cloud Messaging, the same channel native apps use, so Android's power saving applies:

- **Doze.** When the phone lies idle with the screen off, Android may hold notices until it wakes up or reaches a maintenance window. For a turn-based game that usually means minutes, not hours.
- **Battery settings.** Leave Chrome's battery usage (Settings > Apps > Chrome > Battery) at **Optimized** or **Unrestricted**. **Restricted** limits background work to a trickle and can delay notices for a long time. If you installed the game, check its own battery setting too.
- **Offline.** If your phone is off or offline, the push service keeps a notice for 24 hours and then drops it. Email has no such limit.

Firefox for Android supports Web Push too, and the steps are the same. It relays pushes through Mozilla's push service. Going by its source code, the relay does not ask for high priority, so on an idle phone Firefox notices may wait a little longer than Chrome's. Samsung Internet also supports Web Push, but nobody has tested it with this game yet. If ticking the box there fails with "not a push subscription this server can deliver to", the browser uses a push service the server does not accept; use Chrome or email.

### Option 2: the Android app

The Android app (the `.apk` from the releases page) can keep one light connection to the server while it is closed, and tells you when it is your turn. Android's WebView has no Web Push, so this connection does the job instead; it needs no Google services.

1. In the app, tap **Play online** and tick **Notify me when it's my turn**.
2. Allow notifications when Android asks (Android 13 and later).
3. Android then asks whether the app may run in the background: allow it. Without that, Android cuts the app's network access while the phone lies idle, and your turns arrive late. If you declined, the lobby says so and offers **Allow** again. You can also change it later in **Settings > Apps > Manors & Menaces > Battery** (**Unrestricted**).

From then on:

- A quiet **Listening for your turns** notification stays in the notification shade while the connection is kept. Android requires it. To hide it, long-press it and turn off the **Background connection** category; keep **Turn notices** on. On Android 14 and later you can also swipe it away.
- Tapping a turn notice opens the app at that match.
- The connection comes back after the phone restarts or the app is updated. Unticking the box stops it.
- After a stretch without network (a tunnel, flight mode), the app catches up as soon as it reconnects: it shows every turn that is still waiting for you. A match that ended in the meantime is not announced; the lobby shows it.

**Battery.** The server sends the connection one small message every 10 minutes and the app sends nothing on its own, so the phone wakes about 150 times a day, briefly, for this. ntfy, an app that works the same way, reports "about 0-1% of battery in 17h". To see the cost on your phone, check **Settings > Battery** after a day.

**Phones that stop background apps.** Some makers (Xiaomi, Huawei, OnePlus, some Samsung models) stop background apps beyond Android's own rules. If notices stop after a while, allow the app to autostart and run without battery restrictions in the maker's settings; [dontkillmyapp.com](https://dontkillmyapp.com) has the steps for each brand.

With the box unticked, the app tells you about turns only while it is running: the in-app banner while it is open, and an Android notification just after you switch away.

### Option 3: email

Email works on any phone, in the browser and in the Android app. It needs the server operator to have set up email; if they have not, the option does not appear.

1. In the lobby, enter your address under **Email me when it's my turn** and tap **Send link**.
2. Open the email "Confirm turn emails from Manors & Menaces" and follow the link.
3. Tap **Turn on** on the page that opens. Opening the link alone changes nothing, so a mail scanner cannot switch emails on for you.
4. Go back to the lobby. It now says where turn emails go.

The link works for 24 hours. Every turn email has a link to open the match and a link to stop the emails. Many mail apps, Gmail among them, can also show their own **Unsubscribe** button for these emails, which works in one tap. You can stop the emails in the lobby too.

To get a phone notification for turn emails without one for every other email, most mail apps let you give the sender its own notification setting. In Gmail, for example, create a label for the sender, then set **Label notifications** for that label.

## iPhone and iPad

Safari supports Web Push on iOS and iPadOS 16.4 and later, but only for web apps added to the Home Screen:

1. Open the game in Safari, tap **Share > Add to Home Screen**.
2. Open the game from the new Home Screen icon, not from Safari.
3. Tap **Play online**, tick **Notify me when it's my turn** and allow notifications.

In a Safari tab the box does not appear. Email works in both cases.

## Computers

- **In a browser** (Chrome, Edge, Firefox, Safari): tick **Notify me when it's my turn** in the lobby and allow notifications. Desktop browsers generally receive pushes only while the browser is running, even with no window open. The operating system's notification settings for the browser must allow notifications (on macOS: System Settings > Notifications; on Windows: Settings > System > Notifications).
- **The desktop app** (Windows, macOS, Linux): like the Android app, it notifies only while running. It shows a system notification when a turn arrives while its window is minimized or hidden. Use email for turns while it is closed.

## Troubleshooting

| What you see | Why, and what to do |
| --- | --- |
| No **Notify me when it's my turn** box | In a browser, Web Push needs the production web build over HTTPS in a browser that supports it. The box is missing in the desktop app, in the development server, and in iOS Safari outside a Home Screen web app. Private and incognito windows usually cannot receive pushes either: the box is missing or blocked there. Use email instead. (The Android app has the box.) |
| Android app: turns arrive late, or only when you open the app | Allow the app to run in the background (the lobby's **Allow**, or **Settings > Apps > Manors & Menaces > Battery > Unrestricted**). On phones that stop background apps, see [Option 2](#option-2-the-android-app). If it still happens, the server's proxy may be closing idle connections; tell its operator. |
| Android app: "Notifications are turned off for this app" | Turn them on in **Settings > Apps > Manors & Menaces > Notifications**, then tick the box again. |
| "Notifications are blocked for this site" | You or the browser declined the permission earlier. Allow notifications in the browser's site settings (see [Android](#android) for Chrome's menu), then tick the box again. |
| Notices arrive late on Android | The phone was idle (Doze) or Chrome's battery usage is **Restricted**. See [Make sure notices arrive on time](#option-1-play-in-chrome-recommended). |
| Nothing arrives, but the game is closed on this device | Is it still open somewhere else, signed in as you? Any open copy of the game receives the notice instead. Close forgotten tabs. |
| Nothing arrives for one match | The match may belong to a different guest (another browser or device) from the one where you set up notifications. |
| No **Email me** section | The server has no email set up. Ask its operator. |
| "Too many confirmation emails today" | Each address can get three confirmation emails a day, and each guest can ask for five. Try again tomorrow, or use the link you already have. |
| The confirmation link says it has expired | It is older than 24 hours or was already used. Ask for a new one in the lobby. |
| No confirmation email | Check your spam folder. If it is not there, the server may have trouble sending mail. The lobby reports that when it happens. |
| Two notices for one turn | Push and email are both on. Turn one of them off. |

## Running a server

The Docker image serves the web client and the API from one address, which is what notifications expect.

### HTTPS

Browsers allow Web Push only on HTTPS pages, and the one-click unsubscribe that mail apps offer needs an HTTPS link. Put the server behind a reverse proxy with a certificate (Caddy, nginx, Traefik), and pass WebSocket upgrades on `/api/ws` through, since the in-app notices use that connection. If the proxy is the only way in, set `TRUST_PROXY` (see `docker-compose.yml`).

### Idle WebSockets and the Android app

The Android app's background connection hears from the server only every 10 minutes (`BACKGROUND_PING_SECONDS`, default 600). A proxy that closes WebSockets idle for less than that cuts it every time. The app then backs off to reconnecting every 10 minutes and catches up on waiting turns each time, so turns arrive late. Let `/api/ws` stay idle for longer than the interval:

- **nginx** closes idle proxied connections after 60 seconds by default. In the `location` for `/api/ws`, set `proxy_read_timeout 15m;` and `proxy_send_timeout 15m;`.
- **Cloudflare's proxy** closes WebSockets that are idle for 100 seconds on the Free and Pro plans, and only Enterprise can change that. Set `BACKGROUND_PING_SECONDS=90`. That wakes the phone about 960 times a day instead of 150, so it costs more battery.
- Other proxies have similar settings, often called an idle or read timeout.

### Web Push

There is nothing to configure.

- **Keys.** The server creates its VAPID key pair on first start and keeps it in the database (`server_settings`). Back the database up with everything else: a new key would silently cut off every browser that subscribed with the old one.
- **Contact.** `VAPID_SUBJECT` is the contact push services see if your server misbehaves: `mailto:you@example.org` or an `https:` address of yours. It defaults to the project's repository; set your own.
- **Outbound connections.** The server must be able to reach the push services over HTTPS: `fcm.googleapis.com` (Chrome and most Chromium-based browsers), `*.push.services.mozilla.com` (Firefox), `*.push.apple.com` (Safari) and `*.notify.windows.com` (Edge on Windows). It accepts subscriptions only for those hosts, because it sends a request to whatever address a browser registers.
- **Refusals.** A push service answering 404 or 410 means the browser unsubscribed, and the server forgets it. Other refusals appear in the log as `push to <host> failed: HTTP <status>`.

### Email

Email is off until you set all three of these (in `docker-compose.yml` or the environment):

| Variable | Example | Meaning |
| --- | --- | --- |
| `SMTP_URL` | `smtps://turns%40example.org:app-password@smtp.example.org:465` | Your mail provider's SMTP server. `smtps://` is TLS (usually port 465); `smtp://…:587` upgrades with STARTTLS. Percent-encode reserved characters in the user name and password (`@` becomes `%40`, `:` becomes `%3A`). |
| `MAIL_FROM` | `Manors & Menaces <turns@example.org>` | The sender. Use an address on a domain your provider is allowed to send for. |
| `PUBLIC_URL` | `https://play.example.org` | Where players open the game. Links in emails point here, so this server must be reachable at that address and serve the web client there. |

Any provider with SMTP works: your own mail server, Fastmail, Mailgun, Amazon SES, Postmark, Brevo and so on. With Gmail or Google Workspace, use an app password, not your account password.

**Checking the setup.** At startup the server logs one of these:

- `Turn emails: off (…)`: none of the variables is set.
- `Turn emails: on, the SMTP server accepted the login`.
- `Turn emails: cannot use the SMTP server (…)`: the server keeps running, but emails fail until you fix the setting. A missing or malformed variable stops the server at startup with a message naming it.

**Trying it out without sending mail.** Set `MAIL_OUTBOX_DIR=/some/dir` instead of `SMTP_URL`, together with `MAIL_FROM` and `PUBLIC_URL`. Every email is then written to that directory as an `.eml` file you can open in a mail program. The end-to-end tests work this way.

**Deliverability.** Mail from a domain without SPF and DKIM records for your provider tends to land in spam. Your provider's setup guide covers the DNS records.

**What the server stores and sends:**

- A guest's email address and when they confirmed it; nothing else. The row is deleted when they stop the emails, in the lobby or through a link.
- Confirmation links carry a one-time token. Only its hash is stored, and it expires after 24 hours.
- Unsubscribe links are signed with a secret kept in the database, so they keep working without storing anything per email.
- An address gets turn emails only after its owner presses **Turn on** on the confirmation page. So nobody can sign up someone else.
- Each address receives at most three confirmation emails a day, and each guest can request at most five. The counts are kept in memory, so a restart resets them.
- Turn emails are plain text, marked `Auto-Submitted: auto-generated` so out-of-office replies are not sent back. They carry `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058) for one-click unsubscribe.

### About the Android app

The Android app's watcher is a foreground service in `src-tauri/gen/android/app/src/main/java/ch/lkm/manorsmenaces/turnwatch`, registered as the `turn-watch` plugin in `src-tauri/src/lib.rs`:

- It uses Android's `specialUse` foreground service type, which has no daily time limit (Android 15 limits `dataSync` to 6 hours a day) and may restart after a reboot. Google Play reviews that type and the battery exemption request; the app is not distributed there.
- It opens `/api/ws?mode=background` with the guest's session. The server pings that connection every `BACKGROUND_PING_SECONDS` and sends a `keepalive` message with each ping, since Android's WebSocket library answers pings without telling the app. On connecting it sends the turns waiting for the guest, so notices lost in a connection that a mobile network dropped silently are not lost for good.
- A background connection does not count as the player being online.
- The logic that decides what to show, how long to wait before reconnecting and when a connection has gone quiet is in `TurnWatchLogic.kt`, with JVM unit tests in `app/src/test`.

Firebase Cloud Messaging would save the phone even these few wake-ups, since all apps share one connection, but it needs a Firebase project and ties every self-hosted server to it.
