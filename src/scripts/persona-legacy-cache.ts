const LEGACY_SCOPES = new Set(["webllm/model", "webllm/config", "webllm/wasm"]);
const MODEL_PATH =
  /^\/mlc-ai\/Qwen3-(?:1\.7|0\.6)B-q4f(?:16|32)_1-MLC\/resolve\/main\/(?:mlc-chat-config\.json|tokenizer\.(?:json|model)|(?:ndarray|tensor)-cache\.json|params_shard_\d+\.bin)$/;
const WASM_PATH =
  /^\/mlc-ai\/binary-mlc-llm-libs\/main\/web-llm-models\/v0_2_87\/base\/Qwen3-(?:1\.7|0\.6)B-q4f(?:16|32)_1_cs1k-webgpu\.wasm$/;

/** Match only the four model variants and asset paths shipped by this site's previous version. */
export function isLegacyPersonaAsset(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.search) return false;
    return (
      (parsed.hostname === "huggingface.co" &&
        MODEL_PATH.test(parsed.pathname)) ||
      (parsed.hostname === "raw.githubusercontent.com" &&
        WASM_PATH.test(parsed.pathname))
    );
  } catch {
    return false;
  }
}

let cleanup: Promise<void> | undefined;

/** Run at page initialization, without opening the chat or downloading anything. */
export function removeLegacyPersonaAssets() {
  if (cleanup) return cleanup;
  cleanup = (async () => {
    if (typeof caches !== "undefined") {
      const existing = await caches.keys();
      for (const name of existing.filter((name) => LEGACY_SCOPES.has(name))) {
        if (!(await caches.has(name))) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (isLegacyPersonaAsset(request.url)) await cache.delete(request);
        }
      }
    }
  })().catch((error) => {
    console.warn("Could not remove a legacy persona model entry:", error);
  });
  return cleanup;
}
