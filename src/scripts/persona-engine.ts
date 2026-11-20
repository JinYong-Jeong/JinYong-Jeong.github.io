import type { Wllama } from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { cleanPersonaCompletion } from "../lib/persona";
import { removeLegacyPersonaAssets } from "./persona-legacy-cache";

type Message = { role: "system" | "user" | "assistant"; content: string };
export interface PersonaEngineSnapshot {
  state: "idle" | "checking" | "loading" | "ready" | "unsupported" | "error";
  progress?: number;
  phase?: "download" | "initializing";
  detail: string;
}

const modelUrl = "https://huggingface.co/wlsdyd5373/jjmethod/resolve/3e52c9b4a6adecab702966dd8c39dc0c6b7de668/gguf/qwen3-1.7b-personal-style-balanced-q4_k_m.gguf";
const modelBytes = 1107408768;

export class PersonaBrowserEngine {
  private engine: Wllama | null = null;
  private session = new AbortController();
  private loading: Promise<void> | null = null;

  constructor(private readonly onChange: (s: PersonaEngineSnapshot) => void) {
    void removeLegacyPersonaAssets();
    window.addEventListener("pagehide", () => this.dispose());
  }

  get ready() { return !!this.engine; }

  load(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loading) return this.loading;
    const signal = this.session.signal;
    this.loading = this.initialize(signal).finally(() => {
      if (!signal.aborted) this.loading = null;
    });
    return this.loading;
  }

  private async initialize(signal: AbortSignal) {
    let runtime: Wllama | undefined;
    try {
      this.onChange({ state: "checking", detail: "브라우저 지원을 확인하고 있어요." });
      const { gpu } = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
      if (!window.isSecureContext || !(await gpu?.requestAdapter())) {
        if (!signal.aborted) this.onChange({state:"unsupported", detail:"WebGPU를 지원하는 Chrome이 필요해요."});
        return;
      }
      signal.throwIfAborted();
      const { Wllama } = await import("@wllama/wllama");
      signal.throwIfAborted();
      const response = await fetch(modelUrl, { signal, cache: "no-store", credentials: "omit" });
      if (!response.ok || !response.body) throw new Error("MODEL_DOWNLOAD_FAILED");
      let received = 0;
      let percent = -1;
      const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => {
          received += chunk.length;
          const next = Math.floor(100 * received / modelBytes);
          if (next !== percent && !signal.aborted) {
            percent = next;
            this.onChange({state:"loading", phase:"download", progress:received/modelBytes, detail:"모델 다운로드 중"});
          }
          controller.enqueue(chunk);
        },
      }));
      const blob = await new Response(stream).blob();
      if (blob.size !== modelBytes) throw new Error("INCOMPLETE_GGUF");
      signal.throwIfAborted();
      this.onChange({state:"loading", phase:"initializing", detail:"모델을 준비하고 있어요."});
      runtime = new Wllama({ default: wasmUrl }, { suppressNativeLog: true });
      await runtime.loadModel([blob], { n_ctx: 4096, n_batch: 128, n_ubatch: 128, n_threads: 1, n_gpu_layers: 99, reasoning: false, warmup: false });
      signal.throwIfAborted();
      this.engine = runtime;
      this.onChange({state:"ready",detail:"진용의 대화 모델이 준비됐어요."});
    } catch (err) {
      if (runtime) await runtime.exit().catch(() => {});
      if (!signal.aborted) {
        console.warn("Persona model initialization failed", err);
        this.onChange({state:"error",detail:"모델을 준비하지 못했어요."});
      }
    }
  }

  dispose(_reason?: "manual" | "pagehide") {
    this.session.abort();
    this.session = new AbortController();
    const previous = this.engine;
    this.engine = null;
    this.loading = null;
    if (previous) void previous.exit().catch(() => {});
    this.onChange({ state:"idle", detail:"모델 메모리를 해제했어요." });
  }

  async generate(messages: Message[], signal: AbortSignal, onText: (text: string) => void) {
    const engine = this.engine;
    if (!engine) throw new Error("MODEL_NOT_READY");
    let raw = "";
    await engine.createChatCompletion({
      messages, abortSignal: AbortSignal.any([signal, this.session.signal]),
      stream: true, temperature: 0.6, top_p: 0.85, max_tokens: 320,
      chat_template_kwargs: {enable_thinking:false},
      onData(chunk) {
        const delta = chunk.choices[0]?.delta.content;
        if (delta && !signal.aborted) {
          raw += delta;
          onText(cleanPersonaCompletion(raw));
        }
      },
    });
    return cleanPersonaCompletion(raw);
  }
}
