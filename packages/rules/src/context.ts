import { indexBoard, type BoardIndex } from "./board.js";
import type { CardDefId, CardId, CardRulesDefinition, QuestId, QuestRulesDefinition, RulesContent } from "./types.js";

/** Content plus precomputed indexes, shared by all engine functions. */
export interface RulesContext {
  content: RulesContent;
  board: BoardIndex;
  card(defId: CardDefId): CardRulesDefinition;
  cardOf(cardId: CardId): CardRulesDefinition;
  quest(id: QuestId): QuestRulesDefinition;
  hasQuest(id: string): boolean;
}

const cache = new WeakMap<RulesContent, RulesContext>();

export function cardDefIdOf(cardId: CardId): CardDefId {
  const hash = cardId.indexOf("#");
  return hash < 0 ? cardId : cardId.slice(0, hash);
}

export function createContext(content: RulesContent): RulesContext {
  const cached = cache.get(content);
  if (cached) return cached;
  const cards = new Map(content.cards.map((c) => [c.id, c]));
  const quests = new Map(content.quests.map((q) => [q.id, q]));
  const card = (defId: CardDefId): CardRulesDefinition => {
    const def = cards.get(defId);
    if (!def) throw new Error(`Unknown card: ${defId}`);
    return def;
  };
  const ctx: RulesContext = {
    content,
    board: indexBoard(content.board),
    card,
    cardOf: (cardId) => card(cardDefIdOf(cardId)),
    quest: (id) => {
      const q = quests.get(id);
      if (!q) throw new Error(`Unknown quest: ${id}`);
      return q;
    },
    hasQuest: (id) => quests.has(id),
  };
  cache.set(content, ctx);
  return ctx;
}
