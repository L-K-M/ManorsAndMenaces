// Invite-only servers (INVITE_ONLY). The operator creates personal invites
// with the `invites` command (inviteCommand.ts); everyone invited may invite
// up to INVITES_PER_PERSON more from the online lobby. A device gets in by
// accepting an invite: a browser on the server's own site keeps a pass in a
// cookie (the gate for the game's files), and a guest session is admitted
// through the invite it came in by (the gate for the API and the WebSocket,
// which the apps reach from another origin, without cookies). Revoking an
// invite shuts out every device and session it admitted; an expired invite
// admits no new devices but keeps the ones it has.

import { randomBytes } from "node:crypto";
import type { FriendInvite, InviteSettings } from "@manors-menaces/protocol";
import { hashToken } from "./service.js";
import type { InviteRow, Store } from "./store.js";

/** Invites each invited person may make, unless the operator set another number for theirs. */
export const INVITES_PER_PERSON = 10;
/**
 * Devices an invite made by a player admits: one person's phone, tablet and
 * computer. Without a limit, one link passed around would let in any number
 * of people, and the ten-invite allowance would mean nothing.
 */
export const FRIEND_INVITE_DEVICES = 3;

/** Invite codes and ids: no 0/o, 1/i/l, so a code read aloud or typed from a phone comes out right. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
/** 12 characters: about 59 bits, far beyond guessing at the API's rate limit. */
const CODE_LENGTH = 12;
const ID_LENGTH = 6;
/** Draws of a fresh id and code before giving up; one clash is already rare. */
const MAX_ID_DRAWS = 10;
const MAX_NAME_LENGTH = 40;
const DAY_MS = 24 * 60 * 60_000;

function randomString(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // Rejection sampling keeps every character equally likely.
      if (byte < ALPHABET.length * Math.floor(256 / ALPHABET.length) && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

/** Who an invite is for, cleaned like a display name; null if nothing is left. */
export function inviteName(name: unknown): string | null {
  // eslint-disable-next-line no-control-regex
  const s = typeof name === "string" ? name.replace(/[\u0000-\u001f<>]/g, "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH) : "";
  return s || null;
}

export interface NewInvite {
  name: string;
  /** The invite whose holder makes this one; omitted for the operator. */
  invitedBy?: string;
  /** Devices it admits in all; omitted or null for any number. */
  maxDevices?: number | null;
  /** Invites its holder may make (default INVITES_PER_PERSON). */
  quota?: number;
  /** Days its link admits new devices; omitted or null for no limit. */
  days?: number | null;
}

/** An invite as the operator's list shows it. */
export interface InviteListing {
  id: string;
  code: string;
  name: string;
  /** Who made it: the name on the inviter's invite, or null for the operator. */
  invitedBy: string | null;
  devices: number;
  maxDevices: number | null;
  quota: number;
  invitesMade: number;
  expiresAt: string | null;
  createdAt: string;
  revoked: boolean;
  /** The display names of the guest sessions it admitted, first in first. */
  players: string[];
}

export class Invites {
  constructor(private readonly store: Store) {}

  create(opts: NewInvite): InviteRow {
    const name = inviteName(opts.name);
    if (!name) throw new Error("An invite needs the name of the person it is for");
    for (let attempt = 0; attempt < MAX_ID_DRAWS; attempt++) {
      const now = Date.now();
      const invite: InviteRow = {
        id: randomString(ID_LENGTH),
        code: randomString(CODE_LENGTH),
        name,
        invited_by: opts.invitedBy ?? null,
        max_devices: opts.maxDevices ?? null,
        quota: opts.quota ?? INVITES_PER_PERSON,
        expires_at: opts.days ? new Date(now + opts.days * DAY_MS).toISOString() : null,
        created_at: new Date(now).toISOString(),
        revoked_at: null,
      };
      // A clash of random ids is rare; draw again.
      if (this.store.createInvite(invite)) return invite;
    }
    throw new Error(`No free invite id after ${MAX_ID_DRAWS} draws`);
  }

  /** The invite `code` names if it can still admit a device, else null. */
  usable(code: unknown): InviteRow | null {
    if (typeof code !== "string" || code.length > 64) return null;
    const invite = this.store.inviteByCode(code.trim().toLowerCase());
    if (!invite || invite.revoked_at) return null;
    if (invite.expires_at && invite.expires_at <= new Date().toISOString()) return null;
    if (invite.max_devices !== null && this.store.inviteDeviceCount(invite.id) >= invite.max_devices) return null;
    return invite;
  }

  /**
   * Admits a new device through `code`: the invite and the device's pass (the
   * browser's cookie), or null if the invite cannot admit it. Synchronous, so
   * two devices cannot both take an invite's last place.
   */
  accept(code: unknown): { invite: InviteRow; pass: string } | null {
    const invite = this.usable(code);
    if (!invite) return null;
    const pass = randomBytes(32).toString("base64url");
    this.store.addInviteDevice(invite.id, hashToken(pass));
    return { invite, pass };
  }

  /** The unrevoked invite a device's pass belongs to. */
  forPass(pass: string | null): InviteRow | null {
    if (!pass || pass.length > 100) return null;
    const invite = this.store.inviteByPass(hashToken(pass));
    return invite && !invite.revoked_at ? invite : null;
  }

  /** The unrevoked invite a guest session came in by. */
  forGuest(userId: string): InviteRow | null {
    const invite = this.store.inviteOfGuest(userId);
    return invite && !invite.revoked_at ? invite : null;
  }

  /** The name on the invite of whoever made `invite`; null for the operator's. */
  inviterOf(invite: InviteRow): string | null {
    return invite.invited_by ? (this.store.invite(invite.invited_by)?.name ?? null) : null;
  }

  admit(userId: string, invite: InviteRow): void {
    this.store.admitGuest(userId, invite.id);
  }

  /** What the holder of `invite` sees in the lobby. */
  settings(invite: InviteRow): InviteSettings {
    return { available: true, quota: invite.quota, invites: this.store.invitesMadeBy(invite.id).map((i) => this.friendInvite(i)) };
  }

  /** An invite made by the holder of `inviter`, if they have any left; null if not. */
  invite(inviter: InviteRow, name: string): InviteRow | null {
    if (this.store.invitesMadeBy(inviter.id).length >= inviter.quota) return null;
    return this.create({ name, invitedBy: inviter.id, maxDevices: FRIEND_INVITE_DEVICES, quota: INVITES_PER_PERSON });
  }

  /** Withdraws an unused invite the holder of `inviter` made: "withdrawn", "used" or "unknown". */
  withdraw(inviter: InviteRow, id: unknown): "withdrawn" | "used" | "unknown" {
    const invite = typeof id === "string" ? this.store.invite(id) : undefined;
    if (!invite || invite.invited_by !== inviter.id) return "unknown";
    return this.store.deleteUnusedInvite(invite.id) ? "withdrawn" : "used";
  }

  /** Revokes an invite by id or code; false if there is none or it was already revoked. */
  revoke(idOrCode: string): boolean {
    const invite = this.store.invite(idOrCode) ?? this.store.inviteByCode(idOrCode.toLowerCase());
    return invite ? this.store.revokeInvite(invite.id) : false;
  }

  /** Every invite, oldest first, for the operator. */
  list(): InviteListing[] {
    const all = this.store.invites();
    const names = new Map(all.map((i) => [i.id, i.name]));
    const made = new Map<string, number>();
    for (const i of all) if (i.invited_by) made.set(i.invited_by, (made.get(i.invited_by) ?? 0) + 1);
    return all.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      invitedBy: i.invited_by ? (names.get(i.invited_by) ?? i.invited_by) : null,
      devices: this.store.inviteDeviceCount(i.id),
      maxDevices: i.max_devices,
      quota: i.quota,
      invitesMade: made.get(i.id) ?? 0,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
      revoked: i.revoked_at !== null,
      players: this.store.inviteGuestNames(i.id),
    }));
  }

  private friendInvite(i: InviteRow): FriendInvite {
    return {
      id: i.id,
      name: i.name,
      code: i.code,
      devices: this.store.inviteDeviceCount(i.id),
      maxDevices: i.max_devices,
      createdAt: i.created_at,
      revoked: i.revoked_at !== null,
    };
  }
}
