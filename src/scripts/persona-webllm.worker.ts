import { personaWorkerMemory } from "./persona-worker-policy";
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event, () => {
    // Model tensors/tokenizer now belong to the running engine; release downloaded byte copies.
    if (event.data?.kind === "reload" || event.data?.kind === "unload")
      personaWorkerMemory.clear();
  });
};
