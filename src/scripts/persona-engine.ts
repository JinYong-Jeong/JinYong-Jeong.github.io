import type {
  ChatCompletionMessageParam,
  WebWorkerMLCEngine,
} from "@mlc-ai/web-llm";
import { removeLegacyPersonaAssets } from "./persona-legacy-cache";

export type PersonaEngineState =
  | "idle"
  | "checking"
  | "loading"
  | "ready"
  | "unsupported"
  | "error";
export interface PersonaEngineSnapshot {
  state: PersonaEngineState;
  modelId?: string;
  progress?: number;
  phase?: "download" | "initializing";
  detail: string;
}

export const PERSONA_CONTEXT_WINDOW = 2048;
const OUTPUT_TOKENS = 320;
const MODEL_IDS = {
  f16: "Qwen3-1.7B-q4f16_1-MLC",
  f32: "Qwen3-1.7B-q4f32_1-MLC",
} as const;

function aborted(signal: AbortSignal) {
  return new DOMException(String(signal.reason ?? "Cancelled"), "AbortError");
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted(signal));
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted(signal));
    signal.addEventListener("abort", cancel, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** One tab's worker owns the model. No downloaded artifacts survive worker termination. */
export class PersonaBrowserEngine {
  private worker: Worker | null = null;
  private engine: WebWorkerMLCEngine | null = null;
  private lifetime: AbortController | null = null;
  private loading: AbortController | null = null;
  private generation: Promise<string> | null = null;
  private revision = 0;
  private snapshot: PersonaEngineSnapshot = {
    state: "idle",
    detail: "AI를 켜기 전에도 공개 기록에 질문할 수 있어요.",
  };

  constructor(
    private readonly onChange: (snapshot: PersonaEngineSnapshot) => void,
  ) {
    void removeLegacyPersonaAssets();
    window.addEventListener("pagehide", () => this.dispose("pagehide"));
  }

  get ready() {
    return this.snapshot.state === "ready" && this.engine !== null;
  }

  private update(update: Partial<PersonaEngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.onChange({ ...this.snapshot });
  }

  private releaseWorker() {
    this.lifetime?.abort("worker-stopped");
    this.worker?.terminate();
    this.worker = null;
    this.engine = null;
    this.lifetime = null;
  }

  async load() {
    if (this.loading || this.ready) return;
    const revision = ++this.revision;
    const controller = new AbortController();
    this.loading = controller;
    this.update({
      state: "checking",
      modelId: undefined,
      progress: undefined,
      phase: undefined,
      detail: "이 브라우저의 WebGPU 지원을 확인하고 있어요.",
    });
    try {
      if (!window.isSecureContext || !navigator.gpu) {
        this.update({
          state: "unsupported",
          detail:
            "이 환경에서는 브라우저 AI를 실행할 수 없어요. HTTPS에서 WebGPU를 지원하는 최신 Chrome을 사용하거나 공개 기록 검색을 이용해 주세요.",
        });
        return;
      }
      const adapter = await withAbort(
        navigator.gpu.requestAdapter(),
        controller.signal,
      );
      if (!adapter) {
        this.update({
          state: "unsupported",
          detail:
            "사용할 수 있는 WebGPU 그래픽 장치를 찾지 못했어요. 공개 기록 검색은 계속 사용할 수 있습니다.",
        });
        return;
      }
      const modelId =
        MODEL_IDS[adapter.features.has("shader-f16") ? "f16" : "f32"];
      const webllm = await withAbort(
        import("@mlc-ai/web-llm"),
        controller.signal,
      );
      const modelRecord = webllm.prebuiltAppConfig.model_list.find(
        (record) => record.model_id === modelId,
      );
      if (!modelRecord) throw new Error("MODEL_NOT_REGISTERED");
      if (controller.signal.aborted) return;
      this.update({
        state: "loading",
        modelId,
        phase: "download",
        detail:
          "이 탭의 메모리로 모델을 내려받고 있어요.",
      });
      const worker = new Worker(
        new URL("./persona-webllm.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker = worker;
      this.lifetime = new AbortController();
      worker.addEventListener("error", () => {
        if (revision !== this.revision) return;
        controller.abort("worker-error");
        this.releaseWorker();
        this.update({
          state: "error",
          progress: undefined,
          detail:
            "AI 실행 중 오류가 발생했어요. 공개 기록 검색을 이용하거나 모델을 다시 준비해 주세요.",
        });
      });
      const engine = new webllm.WebWorkerMLCEngine(worker, {
        logLevel: "ERROR",
        appConfig: { model_list: [modelRecord], cacheBackend: "cache" },
        initProgressCallback: (report) => {
          if (revision !== this.revision || controller.signal.aborted) return;
          const phase = /Fetching param|Start to fetch/i.test(report.text)
            ? "download"
            : /Loading model|Finish loading/i.test(report.text)
              ? "initializing"
              : undefined;
          this.update({
            progress: Number.isFinite(report.progress)
              ? Math.max(0, Math.min(1, report.progress))
              : undefined,
            phase,
            detail:
              phase === "download"
                ? "모델을 이 탭의 메모리로 내려받고 있어요."
                : phase === "initializing"
                  ? "내려받은 모델을 GPU에 준비하고 있어요."
                  : "브라우저 AI를 준비하고 있어요.",
          });
        },
      });
      this.engine = engine;
      await withAbort(
        engine.reload(modelId, { context_window_size: PERSONA_CONTEXT_WINDOW }),
        controller.signal,
      );
      if (revision !== this.revision || controller.signal.aborted) return;
      this.update({
        state: "ready",
        progress: 1,
        phase: undefined,
        detail:
          "모델 준비가 끝났어요. 이제 이 브라우저에서 AI 답변을 작성합니다.",
      });
    } catch (error) {
      if (revision !== this.revision) return;
      this.releaseWorker();
      if (this.snapshot.state === "error") return;
      const message = error instanceof Error ? error.message : String(error);
      const memory =
        /memory|allocation|allocat|buffer|out.of.memory|device.lost/i.test(
          message,
        );
      this.update({
        state: "error",
        progress: undefined,
        detail: memory
          ? "그래픽 메모리가 부족하거나 GPU 연결이 끊겼어요. 공개 기록으로 대화를 계속할 수 있어요."
          : "모델을 준비하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요. 공개 기록 검색은 계속 사용할 수 있어요.",
      });
      console.warn("Persona WebLLM initialization failed:", error);
    } finally {
      if (this.loading === controller) this.loading = null;
    }
  }

  /** Also runs for BFCache pagehide. A restored page can explicitly call load() again. */
  dispose(reason: "pagehide" | "manual" = "manual") {
    ++this.revision;
    this.loading?.abort(reason);
    this.loading = null;
    this.releaseWorker();
    this.generation = null;
    this.update({
      state: "idle",
      modelId: undefined,
      progress: undefined,
      phase: undefined,
      detail:
        "AI 메모리를 해제했어요. 대화를 이어가려면 모델을 다시 준비합니다.",
    });
  }

  async generate(
    messages: ChatCompletionMessageParam[],
    signal: AbortSignal,
    onProgress: (characters: number) => void,
  ) {
    if (!this.ready || !this.engine || !this.lifetime)
      throw new Error("MODEL_NOT_READY");
    if (this.generation)
      await withAbort(
        this.generation.catch(() => ""),
        signal,
      );
    const engine = this.engine;
    const lifetime = this.lifetime;
    if (!engine || !lifetime || !this.ready) throw new Error("MODEL_NOT_READY");
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (this.engine !== engine) return;
      engine.interruptGenerate();
      // A hung GPU must not leave the next question waiting forever.
      stopTimer = setTimeout(() => {
        if (this.engine !== engine) return;
        this.releaseWorker();
        this.update({
          state: "error",
          progress: undefined,
          detail:
            "GPU가 중지 요청에 응답하지 않아 AI를 종료했어요. 다시 준비하거나 공개 기록으로 대화를 이어갈 수 있어요.",
        });
      }, 3000);
    };
    signal.addEventListener("abort", stop, { once: true });
    const task = (async () => {
      const fitted = await this.fitMessages(messages, engine, lifetime.signal);
      if (signal.aborted) throw aborted(signal);
      const stream = await withAbort(
        engine.chat.completions.create({
          messages: fitted,
          temperature: 0.2,
          top_p: 0.8,
          max_tokens: OUTPUT_TOKENS,
          stream: true,
          extra_body: { enable_thinking: false },
        }),
        lifetime.signal,
      );
      let text = "";
      const iterator = stream[Symbol.asyncIterator]();
      try {
        while (true) {
          const result = await withAbort(iterator.next(), lifetime.signal);
          if (signal.aborted) throw aborted(signal);
          if (result.done) break;
          text += result.value.choices[0]?.delta.content ?? "";
          onProgress(
            text.replace(/<think>[\s\S]*?<\/think>/g, "").trim().length,
          );
        }
      } finally {
        if (!lifetime.signal.aborted)
          await withAbort(
            Promise.resolve(iterator.return?.()),
            lifetime.signal,
          );
      }
      return text;
    })().catch((error) => {
      if (
        this.engine === engine &&
        !signal.aborted &&
        !(error instanceof Error && error.message === "CONTEXT_TOO_LONG")
      ) {
        this.releaseWorker();
        this.update({
          state: "error",
          progress: undefined,
          detail:
            "AI가 답변을 마치지 못했어요. 공개 기록으로 답변하며, AI 준비를 다시 시도할 수 있어요.",
        });
        console.warn("Persona WebLLM generation failed:", error);
      }
      throw error;
    });
    this.generation = task;
    void task
      .finally(() => {
        signal.removeEventListener("abort", stop);
        clearTimeout(stopTimer);
        if (this.generation === task) this.generation = null;
      })
      .catch(() => {});
    if (signal.aborted) stop();
    return withAbort(task, signal);
  }

  /** Count with the loaded tokenizer; preserve the current question and supplied facts first. */
  private async fitMessages(
    messages: ChatCompletionMessageParam[],
    engine: WebWorkerMLCEngine,
    signal: AbortSignal,
  ) {
    const fitted = messages.map((message) => ({ ...message }));
    const budget = PERSONA_CONTEXT_WINDOW - OUTPUT_TOKENS - 96;
    const count = async () => {
      const text = fitted
        .map((message) =>
          typeof message.content === "string" ? message.content : "",
        )
        .join("\n");
      return (
        (await withAbort(engine.tokenize(text), signal)).length +
        fitted.length * 12
      );
    };
    while ((await count()) > budget && fitted.length > 2)
      fitted.splice(1, Math.min(2, fitted.length - 2));
    if ((await count()) > budget) throw new Error("CONTEXT_TOO_LONG");
    return fitted;
  }
}
