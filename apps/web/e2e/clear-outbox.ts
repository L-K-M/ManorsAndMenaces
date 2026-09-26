import { rmSync } from "node:fs";
import { OUTBOX } from "./outbox";

/** Runs once before the tests: each run reads only the emails it caused. */
export default function clearOutbox(): void {
  rmSync(OUTBOX, { recursive: true, force: true });
}
