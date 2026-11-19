import {
  personaRecords,
  personaStarters,
  personaSystemPrompt,
  personaTopicAliases,
  type PersonaSource,
} from "../config/persona";
import {
  answerFromRecords,
  makeGrounding,
  personaClosedUrl,
  personaEntryRequested,
  validatePersonaCompletion,
  type PersonaAnswer,
  type PersonaContext,
} from "../lib/persona";
import {
  answerFromPage,
  isPageRecord,
  makePageGrounding,
  PAGE_REFERENCE_INSTRUCTIONS,
  readCurrentPage,
} from "../lib/persona-page";
import {
  PersonaBrowserEngine,
  type PersonaEngineSnapshot,
} from "./persona-engine";

type ConversationMessage = { role: "user" | "assistant"; content: string };
const maxAnswerCharacters = 1800;
type AskDetail = {
  question?: string;
  topic?: string;
};

const panel = document.querySelector<HTMLElement>("#persona-guide");
if (panel) initPersona(panel);

function initPersona(panel: HTMLElement) {
  const launcher = document.querySelector<HTMLButtonElement>(
    "[data-persona-expand]",
  )!;
  const viewKey = "persona-view";
  try {
    const saved = sessionStorage.getItem(viewKey);
    if (saved === "expanded" || saved === "collapsed") panel.dataset.view = saved;
  } catch {
    // The persisted panel still retains the choice on internal navigation.
  }

  const form = panel.querySelector<HTMLFormElement>("[data-persona-form]")!;
  const input = panel.querySelector<HTMLTextAreaElement>(
    "[data-persona-input]",
  )!;
  const transcript = panel.querySelector<HTMLOListElement>(
    "[data-persona-transcript]",
  )!;
  const scrollArea = panel.querySelector<HTMLElement>(
    "[data-persona-scroll]",
  )!;
  const welcome = panel.querySelector<HTMLElement>("[data-persona-welcome]")!;
  const followups = panel.querySelector<HTMLElement>(
    "[data-persona-followups]",
  )!;
  const sendButton = panel.querySelector<HTMLButtonElement>(
    "[data-persona-send]",
  )!;
  const stopButton = panel.querySelector<HTMLButtonElement>(
    "[data-persona-stop]",
  )!;
  const status = panel.querySelector<HTMLElement>("[data-persona-status]")!;
  const mode = panel.querySelector<HTMLElement>("[data-persona-mode]")!;
  const modeLabel = panel.querySelector<HTMLElement>(
    "[data-persona-mode-label]",
  )!;
  const explanation = panel.querySelector<HTMLElement>(
    "[data-persona-explanation]",
  )!;
  const enginePanel = panel.querySelector<HTMLElement>(
    "[data-persona-engine-panel]",
  );
  const retryButton = panel.querySelector<HTMLButtonElement>(
    "[data-persona-retry]",
  );
  const loadProgress = panel.querySelector<HTMLProgressElement>(
    "[data-persona-load-progress]",
  );
  const loadDetail = panel.querySelector<HTMLElement>(
    "[data-persona-load-detail]",
  );
  const engineStatus = panel.querySelector<HTMLElement>(
    "[data-persona-engine-status]",
  );
  let context: PersonaContext = { recordIds: [] };
  let history: ConversationMessage[] = [];
  let lastPageAnswer: PersonaAnswer | null = null;
  let conversationPage = location.pathname + location.search;
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
      const detail =
        snapshot.state === "unsupported"
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
        ? "AI를 준비하고 있어요."
        : (loadDetail?.textContent ?? "");
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
    if (!input.getClientRects().length) return;
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
    transcript.setAttribute("aria-busy", String(value));
    followups.hidden = value || !followups.childElementCount;
  }

  function showMessage(message: HTMLElement) {
    requestAnimationFrame(() => {
      if (!message.isConnected) return;
      scrollArea.scrollTo({
        top:
          scrollArea.scrollTop +
          message.getBoundingClientRect().top -
          scrollArea.getBoundingClientRect().top,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  }

  function addMessage(role: "user" | "assistant", text: string) {
    const item = document.createElement("li");
    item.className = `persona-message persona-message--${role}`;
    const heading = document.createElement("p");
    heading.className = "persona-message-label";
    heading.textContent =
      role === "user" ? "YOUR QUESTION" : "JINYONG · DIGITAL PERSONA";
    const label = document.createElement("small");
    if (role === "assistant") heading.append(label);
    const body = document.createElement("div");
    body.className = "persona-message-body";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    body.append(paragraph);
    item.append(heading, body);
    transcript.append(item);
    return { item, label, body, paragraph };
  }

  function addSources(item: HTMLElement, sources: PersonaSource[]) {
    if (!sources.length) return;
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
    onText: (text: string) => void,
  ) {
    const relevant = answer.records;
    const pageAnswer = relevant.some(isPageRecord);
    const sameTopic = answer.recordIds.some((id) =>
      context.recordIds.includes(id),
    );
    const text = await browserEngine.generate(
      [
        {
          role: "system",
          content: pageAnswer
            ? PAGE_REFERENCE_INSTRUCTIONS
            : `${personaSystemPrompt}\n\n<공개기록>\n${makeGrounding(relevant)}\n</공개기록>`,
        },
        ...(sameTopic ? history.slice(-4) : []).map((message) => ({
          ...message,
          content: message.content.slice(0, 500),
        })),
        {
          role: "user",
          content: pageAnswer
            ? makePageGrounding(relevant, question)
            : question,
        },
      ],
      signal,
      onText,
    );
    if (!text) throw new Error("Empty response");
    if (!validatePersonaCompletion(text, relevant, question))
      throw new Error("UNGROUNDED_RESPONSE");
    return text
      .slice(0, maxAnswerCharacters)
      .split(/\n\s*\n/)
      .filter(Boolean);
  }

  async function submitQuestion(value: string, preferredRecordId?: string) {
    const question = value.trim().slice(0, 600);
    if (!question || busy) return;
    const currentRevision = ++revision;
    const coreAnswer = answerFromRecords(
      question,
      personaRecords,
      context,
      preferredRecordId,
    );
    const answer =
      !preferredRecordId &&
      coreAnswer.kind !== "private" &&
      coreAnswer.kind !== "interview" &&
      coreAnswer.kind !== "greeting"
        ? (answerFromPage(question, readCurrentPage(document, location.href), {
            previous: lastPageAnswer,
            core: coreAnswer,
          }) ?? coreAnswer)
        : coreAnswer;
    welcome.hidden = true;
    input.value = "";
    resizeInput();
    setBusy(true);
    addMessage("user", question);
    const reply = addMessage("assistant", "관련 기록을 살펴보고 있어요.");
    reply.item.classList.add("persona-message--pending");
    showMessage(reply.item);
    let paragraphs = answer.paragraphs;
    let usedAI = false;
    let hasStreamedText = false;
    let fallback: "engine" | "grounding" | "context" | "timeout" | null = null;
    const controller = new AbortController();
    activeRequest = controller;
    controller.signal.addEventListener(
      "abort",
      () => {
        if (controller.signal.reason !== "cancelled") return;
        if (hasStreamedText) reply.label.textContent = "중지된 답변";
        else reply.item.remove();
      },
      { once: true },
    );
    const timeout = window.setTimeout(
      () => controller.abort("timeout"),
      120000,
    );
    try {
      if (currentRevision !== revision || controller.signal.aborted) return;
      if (browserEngine.ready && answer.supported && answer.kind !== "interview") {
        reply.label.textContent = "브라우저 AI · 생성 중";
        status.textContent = "답변을 작성하고 있어요.";
        try {
          paragraphs = await generate(
            question,
            answer,
            controller.signal,
            (text) => {
              if (currentRevision !== revision || controller.signal.aborted)
                return;
              const visible = text.slice(0, maxAnswerCharacters);
              if (!visible || (hasStreamedText && reply.paragraph.textContent === visible))
                return;
              const atBottom =
                scrollArea.scrollHeight - scrollArea.clientHeight - scrollArea.scrollTop <= 24;
              hasStreamedText = true;
              reply.item.classList.remove("persona-message--pending");
              reply.paragraph.textContent = visible;
              if (atBottom)
                scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: "instant" });
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
      reply.item.classList.remove("persona-message--pending");
      reply.label.textContent = usedAI
        ? "브라우저 AI 답변"
        : answer.kind === "page"
          ? "현재 페이지 답변"
          : answer.sources.length
            ? "기록 검색 답변"
            : "챗봇 답변";
      reply.body.replaceChildren(
        ...paragraphs.map((text) => {
          const paragraph = document.createElement("p");
          paragraph.textContent = text;
          return paragraph;
        }),
      );
      addSources(reply.item, answer.sources);
      if (answer.supported && answer.recordIds.length) {
        if (!answer.recordIds.some((id) => context.recordIds.includes(id)))
          history = [];
        context = { recordIds: answer.recordIds };
        lastPageAnswer = answer.kind === "page" ? answer : null;
        history.push(
          { role: "user", content: question },
          { role: "assistant", content: paragraphs.join("\n\n") },
        );
        history = history.slice(-16);
      }
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
                  : answer.kind === "page" && answer.supported
                    ? "현재 페이지 본문을 바탕으로 구성한 답변입니다."
                    : answer.sources.length
                      ? "공개 기록을 바탕으로 구성한 답변입니다."
                      : "";
    } finally {
      clearTimeout(timeout);
      if (currentRevision === revision) {
        activeRequest = null;
        setBusy(false);
      }
    }
  }

  function cancelGeneration(focusInput = true) {
    if (!busy) return;
    revision++;
    activeRequest?.abort("cancelled");
    activeRequest = null;
    setBusy(false);
    status.textContent =
      "답변을 중지했어요. 질문을 바꾸거나 다시 물어볼 수 있습니다.";
    if (focusInput) input.focus({ preventScroll: true });
  }

  function askPersona(detail: AskDetail) {
    setView("expanded");
    const topic = detail.topic
      ? (personaTopicAliases[detail.topic] ?? detail.topic)
      : undefined;
    const record = personaRecords.find(
      (item) => item.id === topic || item.title === topic,
    );
    scrollArea.focus({ preventScroll: true });
    if (detail.question) void submitQuestion(detail.question, record?.id);
    else if (detail.topic) {
      void submitQuestion(
        `${record?.title ?? detail.topic}에 대해 알려 줘`,
        record?.id,
      );
    } else input.focus({ preventScroll: true });
  }

  function resetConversation() {
    cancelGeneration();
    context = { recordIds: [] };
    history = [];
    lastPageAnswer = null;
    transcript.replaceChildren();
    followups.replaceChildren();
    followups.hidden = true;
    welcome.hidden = false;
    input.value = "";
    status.textContent = "새 대화를 시작했어요.";
    scrollArea.scrollTop = 0;
    resizeInput();
    input.focus({ preventScroll: true });
  }

  function setView(view: "expanded" | "collapsed") {
    panel.dataset.view = view;
    try {
      sessionStorage.setItem(viewKey, view);
    } catch {
      // Storage may be disabled by the visitor.
    }
    if (view === "expanded") resizeInput();
  }

  function collapse() {
    setView("collapsed");
    if (personaEntryRequested(location.href)) {
      window.history.replaceState(window.history.state, "", personaClosedUrl(location.href));
    }
    launcher.focus({ preventScroll: true });
  }

  launcher.addEventListener("click", () => {
    setView("expanded");
    panel.querySelector<HTMLElement>("#persona-title")?.focus({ preventScroll: true });
  });
  panel.querySelector("[data-persona-collapse]")?.addEventListener("click", collapse);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) {
      event.preventDefault();
      collapse();
    }
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-persona-focus]"))
      return;
    event.preventDefault();
    setView("expanded");
    input.focus({ preventScroll: true });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitQuestion(input.value);
  });
  input.addEventListener("input", resizeInput);
  window.addEventListener("resize", resizeInput);
  // Some mobile keyboards shrink only the visual viewport and cover fixed controls.
  const viewport = window.visualViewport;
  if (viewport) {
    const fitKeyboard = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      if (covered > 1 && Math.abs(viewport.scale - 1) < 0.01) {
        panel.style.setProperty("--persona-keyboard-inset", `${covered}px`);
        panel.style.setProperty("--persona-visible-height", `${viewport.height}px`);
      } else {
        panel.style.removeProperty("--persona-keyboard-inset");
        panel.style.removeProperty("--persona-visible-height");
      }
    };
    viewport.addEventListener("resize", fitKeyboard);
    viewport.addEventListener("scroll", fitKeyboard);
    fitKeyboard();
  }
  function showCurrentPage() {
    const path = location.pathname.replace(/\/+$/, "");
    const article =
      document
        .querySelector('meta[property="og:type"]')
        ?.getAttribute("content") === "article";
    const title = path
      ? document
          .querySelector("main h1")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() || document.title
      : "정진용의 CV";
    const caption = panel.querySelector<HTMLElement>(
      "[data-persona-current-page]",
    );
    if (caption) {
      caption.textContent = `현재 ${article ? "글" : "페이지"} · ${title}`;
      caption.title = title;
    }
    const starter = panel.querySelector<HTMLButtonElement>(
      "[data-page-starter]",
    );
    const label = starter?.querySelector("span");
    if (starter && label) {
      const question = article
        ? "이 글 요약해 줘"
        : path === "/projects"
          ? "여기에 어떤 프로젝트가 있어?"
          : path
            ? "이 페이지에는 어떤 내용이 있어?"
            : personaStarters[0];
      starter.dataset.personaQuestion = question;
      label.textContent = question;
    }
  }
  document.addEventListener("astro:page-load", () => {
    showCurrentPage();
    const nextPage = location.pathname + location.search;
    if (nextPage !== conversationPage) {
      cancelGeneration(false);
      if (context.recordIds.some((id) => id.startsWith("page:"))) {
        context = { recordIds: [] };
        history = [];
      }
      lastPageAnswer = null;
      conversationPage = nextPage;
    }
    focusFromUrl();
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
    if (event.persisted) prepareAI();
  });
  panel
    .querySelector("[data-persona-reset]")
    ?.addEventListener("click", resetConversation);
  panel.addEventListener("click", (event) => {
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

  window.addEventListener("cv:ask", (event) =>
    askPersona((event as CustomEvent<AskDetail>).detail ?? {}),
  );
  function focusFromUrl() {
    if (!personaEntryRequested(location.href)) return;
    setView("expanded");
    input.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", focusFromUrl);
  showCurrentPage();
  resizeInput();
  prepareAI();
  focusFromUrl();
}
