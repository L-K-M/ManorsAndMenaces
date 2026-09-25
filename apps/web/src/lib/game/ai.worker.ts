// Module Web Worker that runs AI decisions off the UI thread. Engines are
// cached per map inside the worker (engineFor), so each request only carries
// the state and the RNG.

import { decideAi } from "./aiDecide.js";
import type { AiWorkerRequest, AiWorkerResponse } from "./aiClient.js";

addEventListener("message", (e: MessageEvent<AiWorkerRequest>) => {
  const { id, req } = e.data;
  let response: AiWorkerResponse;
  try {
    response = { id, ok: true, decision: decideAi(req) };
  } catch (err) {
    response = { id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  postMessage(response);
});
