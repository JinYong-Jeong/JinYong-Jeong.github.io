import { installMemoryOnlyModelPolicy } from "./persona-memory-cache";

// This module must evaluate before the WebLLM dependency in persona-webllm.worker.ts.
export const personaWorkerMemory = installMemoryOnlyModelPolicy();
