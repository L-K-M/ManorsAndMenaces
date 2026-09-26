// Machine-readable rule errors (spec §37). UIs map codes to localized text.
export type RuleErrorCode =
  | "GAME_NOT_ACTIVE"
  | "NOT_ACTIVE_PLAYER"
  | "WRONG_PHASE"
  | "PENDING_DECISION"
  | "INSUFFICIENT_RESOURCES"
  | "INVALID_PAYMENT"
  | "ROUTE_OCCUPIED"
  | "ROUTE_SMOULDERING"
  | "SITE_OCCUPIED"
  | "ALREADY_STRONGHOLD"
  | "SITE_TOO_CLOSE"
  | "NOT_CONNECTED"
  | "REGION_FULL"
  | "BANNER_NOT_ADJACENT"
  | "BANNER_NOT_OWNED"
  | "STRONGHOLD_BANNERS_SAME_REGION"
  | "BANNER_NOT_SETTLED"
  | "WRIT_LIMIT_REACHED"
  | "WARDEN_LIMIT_REACHED"
  | "MENACE_GUARDED"
  | "MARKET_LIMIT_REACHED"
  | "NO_TRADE_POST"
  | "INVALID_TRADE"
  | "ILLEGAL_MENACE_TARGET"
  | "CARD_LIMIT_REACHED"
  | "CARD_NOT_IN_HAND"
  | "INVALID_CARD_TARGET"
  | "DECK_EMPTY"
  | "HAND_OVER_LIMIT"
  | "QUEST_NOT_AVAILABLE"
  | "QUEST_NOT_COMPLETE"
  | "NO_PENDING_REACTION"
  | "FEATURE_DISABLED"
  | "UNKNOWN_ENTITY"
  | "INVALID_COMMAND"
  | "REVISION_MISMATCH";

export interface RuleError {
  code: RuleErrorCode;
  /** Developer-facing detail (English, not localized). */
  detail?: string;
}

export type RuleValidation = { ok: true } | { ok: false; error: RuleError };

export const OK: RuleValidation = { ok: true };

export function fail(code: RuleErrorCode, detail?: string): RuleValidation {
  return detail === undefined ? { ok: false, error: { code } } : { ok: false, error: { code, detail } };
}

/** Thrown inside the engine to abort a command; converted to a RuleError. */
export class RuleViolation extends Error {
  constructor(
    readonly code: RuleErrorCode,
    readonly detail?: string,
  ) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
  }
}

/** Exhaustiveness guard for switches over closed unions. */
export function unreachable(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

export function check(condition: unknown, code: RuleErrorCode, detail?: string): asserts condition {
  if (!condition) throw new RuleViolation(code, detail);
}
