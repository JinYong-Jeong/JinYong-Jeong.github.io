import {
  personaRecords,
  personaSystemPrompt,
  personaTopicAliases,
  type PersonaSource,
} from "../config/persona";
import {
  answerFromRecords,
  cleanPersonaCompletion,
  makeGrounding,
  personaClosedUrl,
  personaEntryRequested,
  validatePersonaCompletion,
  type PersonaAnswer,
  type PersonaContext,
} from "../lib/persona";
import {
  PersonaBrowserEngine,
  type PersonaEngineSnapshot,
} from "./persona-engine";

type ConversationMessage = { role: "user" | "assistant"; content: string };
type AskDetail = {
  question?: string;
  topic?: string;
  opener?: HTMLElement;
  source?: string;
};

const dialog = document.querySelector<HTMLDialogElement>("#persona-guide");
if (dialog) initPersona(dialog);

function initPersona(dialog: HTMLDialogElement) {
  const form = dialog.querySelector<HTMLFormElement>("[data-persona-form]")!;
  const input = dialog.querySelector<HTMLTextAreaElement>(
    "[data-persona-input]",
  )!;
  const transcript = dialog.querySelector<HTMLOListElement>(
    "[data-persona-transcript]",
  )!;
  const scrollArea = dialog.querySelector<HTMLElement>(
    "[data-persona-scroll]",
  )!;
  const welcome = dialog.querySelector<HTMLElement>("[data-persona-welcome]")!;
  const followups = dialog.querySelector<HTMLElement>(
    "[data-persona-followups]",
  )!;
  const sendButton = dialog.querySelector<HTMLButtonElement>(
    "[data-persona-send]",
  )!;
  const stopButton = dialog.querySelector<HTMLButtonElement>(
    "[data-persona-stop]",
  )!;
  const status = dialog.querySelector<HTMLElement>("[data-persona-status]")!;
  const mode = dialog.querySelector<HTMLElement>("[data-persona-mode]")!;
  const modeLabel = dialog.querySelector<HTMLElement>(
    "[data-persona-mode-label]",
  )!;
  const explanation = dialog.querySelector<HTMLElement>(
    "[data-persona-explanation]",
  )!;
  const enginePanel = dialog.querySelector<HTMLElement>(
    "[data-persona-engine-panel]",
  );
  const retryButton = dialog.querySelector<HTMLButtonElement>(
    "[data-persona-retry]",
  );
  const loadProgress = dialog.querySelector<HTMLProgressElement>(
    "[data-persona-load-progress]",
  );
  const loadDetail = dialog.querySelector<HTMLElement>(
    "[data-persona-load-detail]",
  );
  const engineStatus = dialog.querySelector<HTMLElement>(
    "[data-persona-engine-status]",
  );
  const toggles = document.querySelectorAll<HTMLButtonElement>(
    "[data-persona-toggle]",
  );
  let context: PersonaContext = { recordIds: [] };
  let history: ConversationMessage[] = [];
  let opener: HTMLElement | null = null;
  let restoreFocusOnClose = true;
  let activeRequest: AbortController | null = null;
  let revision = 0;
  let busy = false;
  let preparationAttempted = false;
  let engineState: PersonaEngineSnapshot["state"] = "idle";
  const browserEngine = new PersonaBrowserEngine(renderEngine);

  function renderEngine(snapshot: PersonaEngineSnapshot) {
    const loading =
      snapshot.state === "checking" || snapshot.state === "loading";
    const ready = snapshot.state === "ready";
    const failed = snapshot.state === "error";
    const progress =
      snapshot.progress !== undefined && Number.isFinite(snapshot.progress)
        ? Math.max(0, Math.min(1, snapshot.progress))
        : undefined;
    engineState = snapshot.state;
    if (enginePanel) enginePanel.dataset.engineState = snapshot.state;
    mode.dataset.state = snapshot.state;
    modeLabel.textContent = ready
      ? "AI 준비됨"
      : loading
        ? `${snapshot.phase === "initializing" ? "AI 시작 중" : "AI 준비 중"}${progress === undefined ? "" : ` · ${Math.floor(progress * 100)}%`}`
        : "공개 기록으로 답변";
    explanation.textContent = ready
      ? "AI가 이 브라우저에서 공개 기록과 최근 대화로 답변을 작성합니다. 질문은 서버로 전송하지 않습니다. AI 답변은 부정확할 수 있으니 연결된 근거도 확인해 주세요."
      : "질문과 관련된 공개 기록을 찾아 답변합니다. AI가 준비되면 같은 기록과 최근 대화로 답변을 작성하며, 기록에 없는 내용은 답하지 않습니다.";
    if (retryButton) retryButton.hidden = !failed;
    if (loadProgress) {
      loadProgress.hidden = !loading;
      if (progress === undefined) loadProgress.removeAttribute("value");
      else loadProgress.value = progress;
    }
    if (loadDetail) {
      const detail = loading
        ? snapshot.phase === "download"
          ? "약 1GB의 모델을 받는 동안에도 공개 기록으로 바로 답변해요."
          : "준비하는 동안에도 공개 기록으로 바로 답변해요."
        : snapshot.state === "unsupported"
          ? "이 환경에서는 AI 대신 공개 기록으로 답변해요."
          : failed
            ? "AI를 준비하지 못했어요. 공개 기록으로 계속 답변해요."
            : "";
      loadDetail.hidden = !detail;
      if (loadDetail.textContent !== detail) loadDetail.textContent = detail;
    }
    const announcement = ready
      ? "AI가 준비됐어요. 이제 AI와 대화할 수 있어요."
      : loading
        ? "AI를 준비하고 있어요. 공개 기록으로 먼저 답변할 수 있어요."
        : loadDetail?.textContent ?? "";
    if (engineStatus && engineStatus.textContent !== announcement)
      engineStatus.textContent = announcement;
  }

  renderEngine({
    state: "idle",
    detail: "공개 기록으로 답변합니다.",
  });
  function prepareAI(retry = false) {
    if (preparationAttempted && !retry) return;
    if (retry && engineState !== "error") return;
    preparationAttempted = true;
    void browserEngine.load();
  }
  retryButton?.addEventListener("click", () => {
    prepareAI(true);
    input.focus({ preventScroll: true });
  });

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 115)}px`;
  }

  function setBusy(value: boolean) {
    busy = value;
    sendButton.disabled = value;
    sendButton.hidden = value;
    stopButton.hidden = !value;
    input.readOnly = value;
    form.setAttribute("aria-busy", String(value));
    followups.hidden = value || !followups.childElementCount;
  }

  function scrollToLatest() {
    requestAnimationFrame(() =>
      scrollArea.scrollTo({
        top: scrollArea.scrollHeight,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    );
  }

  function addMessage(
    role: "user" | "assistant",
    paragraphs: string[],
    label?: string,
  ) {
    const item = document.createElement("li");
    item.className = `persona-message persona-message--${role}`;
    const heading = document.createElement("p");
    heading.className = "persona-message-label";
    heading.textContent =
      role === "user" ? "YOUR QUESTION" : "JINYONG · DIGITAL PERSONA";
    if (label) {
      const note = document.createElement("small");
      note.textContent = label;
      heading.append(note);
    }
    const body = document.createElement("div");
    body.className = "persona-message-body";
    for (const text of paragraphs) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      body.append(paragraph);
    }
    item.append(heading, body);
    transcript.append(item);
    return item;
  }

  function addSources(item: HTMLElement, sources: PersonaSource[]) {
    const group = document.createElement("nav");
    group.className = "persona-sources";
    group.setAttribute("aria-label", "이 답변의 공개 근거");
    for (const source of sources) {
      const link = document.createElement("a");
      link.className = "persona-source";
      link.href = source.href;
      link.dataset.personaSource = "true";
      const text = document.createElement("span");
      const label = document.createElement("span");
      label.textContent = source.label;
      const detail = document.createElement("small");
      detail.textContent = source.detail;
      text.append(label, detail);
      link.append(text);
      if (source.href.startsWith("https://")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      group.append(link);
    }
    item.append(group);
  }

  function showFollowups(answer: PersonaAnswer) {
    followups.replaceChildren();
    for (const text of answer.suggestions) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.personaQuestion = text;
      button.textContent = text;
      followups.append(button);
    }
    followups.hidden = false;
  }

  async function generate(
    question: string,
    answer: PersonaAnswer,
    signal: AbortSignal,
    onProgress: (characters: number) => void,
  ) {
    const relevant = answer.records;
    const sameTopic = answer.recordIds.some((id) =>
      context.recordIds.includes(id),
    );
    const raw = await browserEngine.generate(
      [
        {
          role: "system",
          content: `${personaSystemPrompt}\n\n<공개기록>\n${makeGrounding(relevant)}\n</공개기록>`,
        },
        ...(sameTopic ? history.slice(-4) : []).map((message) => ({
          ...message,
          content: message.content.slice(0, 500),
        })),
        { role: "user", content: question },
      ],
      signal,
      onProgress,
    );
    const text = cleanPersonaCompletion(raw);
    if (!text) throw new Error("Empty response");
    if (!validatePersonaCompletion(text, relevant))
      throw new Error("UNGROUNDED_RESPONSE");
    return text
      .slice(0, 1800)
      .split(/\n\s*\n/)
      .filter(Boolean);
  }

  async function submitQuestion(value: string, preferredRecordId?: string) {
    const question = value.trim().slice(0, 600);
    if (!question || busy) return;
    const currentRevision = ++revision;
    const answer = answerFromRecords(
      question,
      personaRecords,
      context,
      preferredRecordId,
    );
    welcome.hidden = true;
    input.value = "";
    resizeInput();
    setBusy(true);
    addMessage("user", [question]);
    const pending = addMessage("assistant", ["관련 기록을 살펴보고 있어요."]);
    pending.classList.add("persona-message--pending");
    scrollToLatest();
    let paragraphs = answer.paragraphs;
    let usedAI = false;
    let lastProgressUpdate = 0;
    let fallback: "engine" | "grounding" | "context" | "timeout" | null = null;
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = window.setTimeout(
      () => controller.abort("timeout"),
      120000,
    );
    try {
      if (currentRevision !== revision || controller.signal.aborted) return;
      if (browserEngine.ready && answer.supported) {
        pending.querySelector(".persona-message-body p")!.textContent =
          "브라우저 AI가 관련 기록을 읽고 답변을 작성하고 있어요.";
        status.textContent = "이 기기에서 생성 중 · 중지할 수 있어요";
        try {
          paragraphs = await generate(
            question,
            answer,
            controller.signal,
            (characters) => {
              if (currentRevision !== revision || controller.signal.aborted)
                return;
              if (performance.now() - lastProgressUpdate < 500) return;
              lastProgressUpdate = performance.now();
              pending.querySelector(".persona-message-body p")!.textContent =
                characters
                  ? `답변 ${characters}자를 작성했어요. 공개 기록과 함께 확인하고 있어요.`
                  : "브라우저 AI가 관련 기록을 읽고 있어요.";
            },
          );
          usedAI = true;
        } catch (error) {
          if (controller.signal.reason === "cancelled") return;
          if (error instanceof Error && error.message === "UNGROUNDED_RESPONSE")
            fallback = "grounding";
          else if (
            error instanceof Error &&
            error.message === "CONTEXT_TOO_LONG"
          )
            fallback = "context";
          else
            fallback =
              controller.signal.reason === "timeout" ? "timeout" : "engine";
        }
      }
      if (
        currentRevision !== revision ||
        controller.signal.reason === "cancelled"
      )
        return;
      pending.remove();
      const item = addMessage(
        "assistant",
        paragraphs,
        usedAI ? "브라우저 AI 답변" : "기록 검색 답변",
      );
      addSources(item, answer.sources);
      context = { recordIds: answer.recordIds };
      history.push(
        { role: "user", content: question },
        { role: "assistant", content: paragraphs.join("\n\n") },
      );
      history = history.slice(-16);
      showFollowups(answer);
      status.textContent =
        fallback === "grounding"
          ? "AI 답변이 공개 기록과 맞지 않아 기록으로 답변했어요."
          : fallback === "engine"
            ? "브라우저 AI가 답변을 마치지 못해 공개 기록으로 답변했어요."
            : fallback === "timeout"
              ? "AI 응답이 오래 걸려 중지하고 공개 기록으로 답변했어요."
              : fallback === "context"
                ? "관련 자료가 모델의 입력 범위를 넘어 공개 기록으로 답변했어요."
                : usedAI
                  ? "AI가 작성한 답변입니다. 연결된 근거를 함께 확인해 주세요."
                  : "공개 기록을 바탕으로 구성한 답변입니다.";
      scrollToLatest();
    } finally {
      clearTimeout(timeout);
      if (currentRevision === revision) {
        pending.remove();
        activeRequest = null;
        setBusy(false);
        if (dialog.open) input.focus({ preventScroll: true });
      }
    }
  }

  function cancelGeneration(focusInput = true) {
    if (!busy) return;
    revision++;
    activeRequest?.abort("cancelled");
    activeRequest = null;
    transcript.querySelector(".persona-message--pending")?.remove();
    setBusy(false);
    status.textContent =
      "답변을 중지했어요. 질문을 바꾸거나 다시 물어볼 수 있습니다.";
    if (focusInput && dialog.open) input.focus({ preventScroll: true });
  }

  function openGuide(detail: AskDetail = {}) {
    if (!dialog.open) {
      opener =
        detail.opener ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      dialog.show();
      updateToggles();
      resizeInput();
    }
    prepareAI();
    const topic = detail.topic
      ? (personaTopicAliases[detail.topic] ?? detail.topic)
      : undefined;
    const record = personaRecords.find(
      (item) => item.id === topic || item.title === topic,
    );
    input.focus({ preventScroll: true });
    if (detail.question) void submitQuestion(detail.question, record?.id);
    else if (detail.topic) {
      void submitQuestion(
        `${record?.title ?? detail.topic}에 대해 알려 줘`,
        record?.id,
      );
    }
  }

  function resetConversation() {
    cancelGeneration();
    context = { recordIds: [] };
    history = [];
    transcript.replaceChildren();
    followups.replaceChildren();
    followups.hidden = true;
    welcome.hidden = false;
    input.value = "";
    status.textContent = "새 대화를 시작했어요.";
    resizeInput();
    input.focus({ preventScroll: true });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitQuestion(input.value);
  });
  input.addEventListener("input", resizeInput);
  window.addEventListener("resize", () => {
    if (dialog.open) resizeInput();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submitQuestion(input.value);
    }
  });
  stopButton.addEventListener("click", () => cancelGeneration());
  window.addEventListener("pagehide", () => {
    cancelGeneration(false);
    preparationAttempted = false;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && dialog.open) prepareAI();
  });
  dialog
    .querySelector("[data-persona-close]")
    ?.addEventListener("click", () => dialog.close());
  dialog
    .querySelector("[data-persona-reset]")
    ?.addEventListener("click", resetConversation);
  dialog.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const question = event.target.closest<HTMLElement>(
      "[data-persona-question]",
    )?.dataset.personaQuestion;
    if (question) void submitQuestion(question);
    const source = event.target.closest<HTMLAnchorElement>(
      "[data-persona-source]",
    );
    if (
      !source ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const url = new URL(source.href);
    if (url.origin !== location.origin) return;
    restoreFocusOnClose = false;
    dialog.close();
    if (url.pathname !== location.pathname || !url.hash) return;
    const target = document.getElementById(
      decodeURIComponent(url.hash.slice(1)),
    );
    if (!target) return;
    event.preventDefault();
    historyReplaceHash(url.hash);
    target
      .querySelectorAll<HTMLDetailsElement>("details")
      .forEach((details) => {
        details.open = true;
      });
    target.hidden = false;
    target.classList.add("persona-record-highlight");
    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
    const previousTabIndex = target.getAttribute("tabindex");
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    window.setTimeout(() => {
      target.classList.remove("persona-record-highlight");
      if (previousTabIndex === null) target.removeAttribute("tabindex");
      else target.setAttribute("tabindex", previousTabIndex);
    }, 2400);
  });

  function historyReplaceHash(hash: string) {
    const oldURL = location.href;
    const url = new URL(location.href);
    url.hash = hash;
    url.searchParams.delete("ask");
    window.history.replaceState(window.history.state, "", url);
    // CV file panels react to hash changes. replaceState alone does not dispatch one.
    window.dispatchEvent(
      new HashChangeEvent("hashchange", { oldURL, newURL: url.href }),
    );
  }

  dialog.addEventListener("close", () => {
    cancelGeneration();
    updateToggles();
    window.history.replaceState(
      window.history.state,
      "",
      personaClosedUrl(location.href),
    );
    if (restoreFocusOnClose) {
      const destination =
        opener?.isConnected && opener.getClientRects().length
          ? opener
          : document.querySelector<HTMLElement>(
              "[data-persona-toggle], [data-open-persona]",
            );
      destination?.focus({ preventScroll: true });
    }
    restoreFocusOnClose = true;
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLElement>(
      "[data-persona-toggle], [data-open-persona]",
    );
    if (!trigger) return;
    if (
      trigger instanceof HTMLAnchorElement &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    )
      return;
    event.preventDefault();
    if (trigger.hasAttribute("data-persona-toggle") && dialog.open) {
      dialog.close();
      return;
    }
    openGuide({
      opener: trigger,
      question: trigger.dataset.personaQuestion,
      topic: trigger.dataset.personaTopic,
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open && !event.defaultPrevented) {
      event.preventDefault();
      dialog.close();
    }
  });
  function updateToggles() {
    toggles.forEach((toggle) => {
      toggle.hidden = false;
      toggle.setAttribute("aria-expanded", String(dialog.open));
    });
  }
  updateToggles();
  window.addEventListener("cv:ask", (event) =>
    openGuide((event as CustomEvent<AskDetail>).detail ?? {}),
  );
  const openFromUrl = () => {
    if (personaEntryRequested(location.href)) openGuide();
  };
  window.addEventListener("hashchange", openFromUrl);
  openFromUrl();
}
