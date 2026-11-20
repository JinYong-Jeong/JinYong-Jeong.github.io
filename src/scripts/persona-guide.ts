import {
  personaRecords,
  personaStarters,
  personaSystemPrompt,
  personaTopicAliases,
  type PersonaSource,
} from "../config/persona";
import {
  answerFromRecords,
  withProjectArchive,
  personaClosedUrl,
  personaEntryRequested,
  type PersonaAnswer,
  type PersonaContext,
} from "../lib/persona";
import {
  answerFromPage,
  readCurrentPage,
} from "../lib/persona-page";
import {
  PersonaBrowserEngine,
  type PersonaEngineSnapshot,
} from "./persona-engine";

import { chatHistoryFor, choiceGrammar, instantChatReply, offeredChoices, type ChatMessage } from "../lib/persona-chat";

type ChatMode = "cv" | "general";
const maxAnswerCharacters = 1800;
type AskDetail = {
  question?: string;
  topic?: string;
};

const panel = document.querySelector<HTMLElement>("#persona-guide");
if (panel) initPersona(panel);

function initPersona(panel: HTMLElement) {
  const records = withProjectArchive(personaRecords, JSON.parse(panel.dataset.projectArchive ?? "[]"));
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
  const scrollArea = panel.querySelector<HTMLElement>("[data-persona-scroll]")!;
  function threadFor(mode: ChatMode) {
    const pane = panel.querySelector<HTMLElement>(`[data-persona-thread="${mode}"]`)!;
    return {
      pane,
      transcript: pane.querySelector<HTMLOListElement>("[data-persona-transcript]")!,
      welcome: pane.querySelector<HTMLElement>("[data-persona-welcome]")!,
      followups: pane.querySelector<HTMLElement>("[data-persona-followups]")!,
      draft: "", status: "", scrollTop: 0,
    };
  }
  const threads = { cv: threadFor("cv"), general: threadFor("general") };
  let chatMode: ChatMode = "cv";
  let thread = threads.cv;
  const switches = panel.querySelectorAll<HTMLInputElement>('input[name="persona-chat-mode"]');
  const description = panel.querySelector<HTMLElement>("#persona-description")!;
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
  let history: ChatMessage[] = [];
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
        : failed || snapshot.state === "unsupported" ? "AI 사용 불가" : "AI 대기 중";
    if (retryButton) retryButton.hidden = !failed;
    if (loadProgress) {
      loadProgress.hidden = !loading;
      if (progress === undefined) loadProgress.removeAttribute("value");
      else loadProgress.value = progress;
    }
    if (loadDetail) {
      const detail =
        snapshot.state === "unsupported"
          ? "일반 대화 모델을 실행하려면 WebGPU를 지원하는 Chrome이 필요해요."
          : failed
            ? "일반 대화 모델을 준비하지 못했어요. 다시 시도해 주세요."
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
    thread.transcript.setAttribute("aria-busy", String(value));
    thread.followups.hidden = value || !thread.followups.childElementCount;
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
      role === "user" ? "YOUR QUESTION" : chatMode === "cv" ? "CV · 사이트" : "JINYONG · DIGITAL PERSONA";
    const label = document.createElement("small");
    if (role === "assistant") heading.append(label);
    const body = document.createElement("div");
    body.className = "persona-message-body";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    body.append(paragraph);
    item.append(heading, body);
    thread.transcript.append(item);
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
    thread.followups.replaceChildren();
    for (const text of answer.suggestions) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.personaQuestion = text;
      button.textContent = text;
      thread.followups.append(button);
    }
    thread.followups.hidden = !thread.followups.childElementCount;
  }

  function cvAnswer(question: string, preferredRecordId?: string) {
    const core = answerFromRecords(question, records, context, preferredRecordId);
    const explicitPage = /(?:이|현재)\s*(?:글|페이지|본문)/.test(question);
    const aboutWork = core.records.some((record) => record.publication || record.project);
    if (preferredRecordId || ["private", "interview", "greeting"].includes(core.kind) ||
        (aboutWork && !explicitPage)) return core;
    return answerFromPage(question, readCurrentPage(document, location.href), {
      previous: lastPageAnswer, core,
    }) ?? core;
  }

  async function submitQuestion(value: string, preferredRecordId?: string) {
    const question = value.trim().slice(0, 600);
    if (!question || busy) return;
    const currentRevision = ++revision;
    thread.welcome.hidden = true;
    input.value = "";
    resizeInput();
    addMessage("user", question);
    const reply = addMessage("assistant", "");
    showMessage(reply.item);
    if (chatMode === "cv") {
      const answer = cvAnswer(question, preferredRecordId);
      reply.label.textContent = answer.kind === "page" ? "현재 페이지" : answer.sources.length ? "공개 기록" : "CV 안내";
      reply.body.replaceChildren(...answer.paragraphs.map((text) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        return paragraph;
      }));
      addSources(reply.item, answer.sources);
      context = {recordIds: answer.recordIds};
      lastPageAnswer = answer.kind === "page" ? answer : null;
      showFollowups(answer);
      status.textContent = "";
      return;
    }

    const controller = new AbortController();
    activeRequest = controller;
    const signal = controller.signal;
    let streamed = false;
    let timeout: number | undefined;
    const cancel = () => {
      if (signal.reason !== "cancelled") return;
      if (streamed) reply.label.textContent = "중지된 답변";
      else reply.item.remove();
    };
    signal.addEventListener("abort", cancel, { once: true });
    setBusy(true);
    reply.item.classList.add("persona-message--pending");
    status.textContent = "";
    try {
      const quick = instantChatReply(question, history);
      const relevantHistory = quick ? history : chatHistoryFor(question, history);
      let text = quick;
      if (!text) {
        if (!browserEngine.ready && (engineState === "loading" || engineState === "checking" || engineState === "idle")) {
          reply.paragraph.textContent = "모델을 준비하는 대로 답할게요.";
          let stop!: () => void;
          try {
            await Promise.race([browserEngine.load(), new Promise<void>((resolve) => {
              stop = resolve;
              signal.addEventListener("abort", stop, {once:true});
            })]);
          } finally { signal.removeEventListener("abort", stop); }
        }
        if (signal.aborted || currentRevision !== revision) return;
        if (!browserEngine.ready) throw new Error("MODEL_NOT_READY");
        timeout = window.setTimeout(() => controller.abort("timeout"), 120000);
        reply.label.textContent = "진용 AI · 생성 중";
        const options = offeredChoices(question);
        text = await browserEngine.generate([
          {role: "system", content: personaSystemPrompt},
          ...relevantHistory,
          {role: "user", content: question},
        ], signal, (partial) => {
          if (signal.aborted || currentRevision !== revision || !partial) return;
          const atBottom = scrollArea.scrollHeight - scrollArea.clientHeight - scrollArea.scrollTop <= 24;
          streamed = true;
          reply.item.classList.remove("persona-message--pending");
          reply.paragraph.textContent = partial.slice(0, maxAnswerCharacters);
          if (atBottom) scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: "instant" });
        }, choiceGrammar(options));
        if (signal.aborted || !text) throw new Error("INCOMPLETE");
      }
      if (currentRevision !== revision) return;
      const visible = text.slice(0, maxAnswerCharacters);
      reply.paragraph.textContent = visible;
      reply.label.textContent = "일반 대화";
      if (!quick) history = [...relevantHistory,
        {role: "user", content: question}, {role: "assistant", content: visible}];
    } catch {
      if (signal.reason === "cancelled" || currentRevision !== revision) return;
      reply.label.textContent = "일반 대화 안내";
      reply.paragraph.textContent = !browserEngine.ready
        ? "말투 모델이 준비되지 않았어요. WebGPU를 지원하는 Chrome에서 일반 대화를 사용할 수 있어요."
        : "답변을 마치지 못했어. 한 번 더 말해 줄래?";
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      reply.item.classList.remove("persona-message--pending");
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
    if (detail.question || detail.topic) selectMode("cv");
    const topic = detail.topic
      ? (personaTopicAliases[detail.topic] ?? detail.topic)
      : undefined;
    const record = records.find(
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
    if (chatMode === "cv") {
      context = { recordIds: [] };
      lastPageAnswer = null;
    } else history = [];
    thread.transcript.replaceChildren();
    thread.followups.replaceChildren();
    thread.followups.hidden = true;
    thread.welcome.hidden = false;
    input.value = "";
    status.textContent = "새 대화를 시작했어요.";
    scrollArea.scrollTop = 0;
    resizeInput();
    input.focus({ preventScroll: true });
  }

  function selectMode(next: ChatMode) {
    if (next !== chatMode) {
      cancelGeneration(false);
      thread.draft = input.value;
      thread.status = status.textContent ?? "";
      thread.scrollTop = scrollArea.scrollTop;
      thread.pane.hidden = true;
      chatMode = next;
      thread = threads[next];
      thread.pane.hidden = false;
      input.value = thread.draft;
      status.textContent = thread.status;
    }
    const general = next === "general";
    panel.dataset.chatMode = next;
    for (const radio of switches) radio.checked = radio.value === next;
    if (enginePanel) enginePanel.hidden = !general;
    description.textContent = general ? "진용의 말투로 편하게 이야기해요." : "공개 CV와 현재 페이지에서 근거를 찾아 답해요.";
    input.placeholder = general ? "메시지 보내기" : "이력이나 이 페이지에 대해 물어보세요";
    resizeInput();
    scrollArea.scrollTop = thread.scrollTop;
    try { sessionStorage.setItem("persona-chat-mode", next); } catch { /* Optional tab preference. */ }
  }
  for (const radio of switches) radio.addEventListener("change", () => {
    if (radio.checked) selectMode(radio.value === "general" ? "general" : "cv");
  });

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
      if (chatMode === "cv") cancelGeneration(false);
      if (context.recordIds.some((id) => id.startsWith("page:"))) {
        context = { recordIds: [] };
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
  let firstMode: ChatMode = "cv";
  try { if (sessionStorage.getItem("persona-chat-mode") === "general") firstMode = "general"; } catch { /* Start in CV. */ }
  selectMode(firstMode);
  showCurrentPage();
  resizeInput();
  prepareAI();
  focusFromUrl();
}
