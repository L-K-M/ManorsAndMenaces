<script lang="ts">
  // Invite friends: on an invite-only server everyone invited may make a few
  // personal invite links of their own (the server sets how many). Shown only
  // on such a server.
  import type { FriendInvite, InviteSettings } from "@manors-menaces/protocol";
  import { t } from "../i18n.js";
  import type { OnlineClient } from "./client.js";

  /** `guard` is the lobby's: it shows errors and renews an expired session. */
  let { client, guard, busy }: { client: OnlineClient; guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>; busy: boolean } = $props();

  let settings: InviteSettings | null = $state(null);
  let name = $state("");
  const left = $derived.by(() => (settings ? Math.max(0, settings.quota - settings.invites.length) : 0));

  /** Bumped by every change, so an answer that was already on its way cannot undo it. */
  let generation = 0;
  async function load() {
    const asked = ++generation;
    // Quietly: an older server, or a moment offline, just leaves this as it was.
    const next = await client.inviteSettings().catch(() => null);
    if (next && asked === generation) settings = next;
  }
  $effect(() => {
    void load();
    // Friends accept their links meanwhile: look again on the way back.
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  async function make() {
    const next = await guard(() => client.inviteFriend(name.trim()));
    if (!next) return;
    update(next);
    name = "";
  }
  async function withdraw(invite: FriendInvite) {
    const next = await guard(() => client.withdrawInvite(invite.id));
    if (next) update(next);
  }
  function update(next: InviteSettings) {
    generation++;
    settings = next;
  }

  function status(invite: FriendInvite): string {
    if (invite.revoked) return t("ui.friend_invite_revoked");
    if (invite.devices === 0) return t("ui.friend_invite_unused");
    return invite.maxDevices === null ? t("ui.friend_invite_in_use") : t("ui.friend_invite_used", { n: invite.devices, max: invite.maxDevices });
  }
</script>

{#if settings?.available && settings.quota > 0}
  <section class="invites" aria-labelledby="friend-invites" aria-live="polite">
    <h3 id="friend-invites">{t("ui.friend_invites")}</h3>
    <p>{left === 0 ? t("ui.friend_invites_none_left") : left === 1 ? t("ui.friend_invites_left_one") : t("ui.friend_invites_left", { n: left })}</p>
    {#if left > 0}
      <form onsubmit={(e) => (e.preventDefault(), make())}>
        <label>{t("ui.friend_invite_name")} <input bind:value={name} maxlength="40" required autocomplete="off" /></label>
        <button disabled={busy}>{t("ui.friend_invite_make")}</button>
      </form>
    {/if}
    {#if settings.invites.length}
      <ul>
        {#each settings.invites as invite (invite.id)}
          <li>
            <span><strong>{invite.name}</strong> <small>{status(invite)}</small></span>
            {#if !invite.revoked}
              <input
                class="link"
                readonly
                value={client.inviteLink(invite.code)}
                onfocus={(e) => (e.target as HTMLInputElement).select()}
                aria-label={t("ui.friend_invite_link", { name: invite.name })}
              />
            {/if}
            {#if invite.devices === 0 && !invite.revoked}
              <button type="button" disabled={busy} onclick={() => withdraw(invite)}>{t("ui.friend_invite_withdraw")}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .invites {
    margin-top: 1rem;
  }
  .invites p {
    margin: 0 0 0.4rem;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.4rem 0.6rem;
  }
  label {
    display: flex;
    flex-direction: column;
    flex: 1 1 16rem;
  }
  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
  }
  li span {
    flex: 1 1 100%;
  }
  .link {
    flex: 1 1 16rem;
    min-width: 0;
  }
  small {
    opacity: 0.7;
  }
</style>
