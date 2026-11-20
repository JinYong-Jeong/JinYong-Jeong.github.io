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

const maxAnswerCharacters = 1800;
type AskDetail = {
  question?: string;
  topic?: string;
};

const panel = document.querySelector<HTMLElement>("#persona-guide");
if (panel) initPersona(panel);

function initPersona(panel: HTMLElement) {
  const standalone = panel.dataset.chatMode === "general";
  const records = standalone ? [] : withProjectArchive(personaRecords, JSON.parse(panel.dataset.projectArchive ?? "[]"));
  const launcher = document.querySelector<HTMLButtonElement>(
    "[data-persona-expand]",
  );
  const viewKey = "persona-view";
  try {
    const saved = sessionStorage.getItem(viewKey);
    if (!standalone && (saved === "expanded" || saved === "collapsed")) panel.dataset.view = saved;
  } catch {
    // The persisted panel still retains the choice on internal navigation.
  }

  const form = panel.querySelector<HTMLFormElement>("[data-persona-form]")!;
  const input = panel.querySelector<HTMLTextAreaElement>(
    "[data-persona-input]",
  )!;
  const scrollArea = panel.querySelector<HTMLElement>("[data-persona-scroll]")!;
  const thread = {
    transcript: panel.querySelector<HTMLOListElement>("[data-persona-transcript]")!,
    welcome: panel.querySelector<HTMLElement>("[data-persona-welcome]")!,
    followups: panel.querySelector<HTMLElement>("[data-persona-followups]")!,
  };
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
  const loadProgress = panel.querySelector<HTMLProgressElement>(
    "[data-persona-load-progress]",
  );
  const loadDetail = panel.querySelector<HTMLElement>(
    "[data-persona-load-detail]",
  );
  const engineStatus = panel.querySelector<HTMLElement>(
    "[data-persona-engine-status]",
  );
  const unloadButton = panel.querySelector<HTMLButtonElement>("[data-persona-unload]")!;
  let context: PersonaContext = { recordIds: [] };
  let history: ChatMessage[] = [];
  let lastPageAnswer: PersonaAnswer | null = null;
  let conversationPage = location.pathname + location.search;
  let activeRequest: AbortController | null = null;
  let revision = 0;
  let busy = false;
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
    if (enginePanel) {
      enginePanel.dataset.engineState = snapshot.state;
      enginePanel.hidden = !standalone && !loading && !ready;
    }
    unloadButton.hidden = !ready;
    for (const button of panel.querySelectorAll<HTMLButtonElement>(".persona-passage-button"))
      button.textContent = passageButtonText(ready);
    mode.dataset.state = snapshot.state;
    modeLabel.textContent = ready
      ? "AI 준비됨"
      : loading
        ? `${snapshot.phase === "initializing" ? "AI 시작 중" : "AI 준비 중"}${progress === undefined ? "" : ` · ${Math.floor(progress * 100)}%`}`
        : failed || snapshot.state === "unsupported" ? "AI 사용 불가" : "AI 대기 중";
    if (loadProgress) {
      loadProgress.hidden = !loading;
      if (progress === undefined) loadProgress.removeAttribute("value");
      else loadProgress.value = progress;
    }
    if (loadDetail) {
      const detail =
        snapshot.state === "unsupported"
          ? "모델을 실행하려면 WebGPU를 지원하는 브라우저가 필요해요."
          : failed
            ? "모델을 준비하지 못했어요. 다시 시도해 주세요."
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
  unloadButton.addEventListener("click", () => {
    cancelGeneration(false);
    browserEngine.dispose();
    status.textContent = "모델 메모리를 해제했어요.";
  });

  function passageButtonText(ready: boolean) {
    return ready ? "AI로 핵심 문장 보기" : "AI로 핵심 문장 보기 · 모델 1.11GB";
  }

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
      role === "user" ? "YOUR QUESTION" : standalone ? "JINYONG · DIGITAL PERSONA" : "CV · 사이트";
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

  function addPassageSelection(item: HTMLElement, question: string, answer: PersonaAnswer) {
    const passages = [...new Set(answer.paragraphs.flatMap((paragraph) =>
      paragraph.split(/(?<=[.!?。])\s+|\n+/u).map((line) => line.trim()).filter(Boolean),
    ))].filter((line) => line.length >= 12).slice(0, 8);
    if (passages.length < 2) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "persona-passage-button";
    button.textContent = passageButtonText(browserEngine.ready);
    const output = document.createElement("p");
    output.className = "persona-passage";
    output.setAttribute("role", "status");
    item.append(button, output);
    button.addEventListener("click", async () => {
      if (busy) return;
      const controller = new AbortController();
      activeRequest = controller;
      const signal = controller.signal;
      const currentRevision = ++revision;
      let timeout: number | undefined;
      setBusy(true);
      button.disabled = true;
      output.textContent = browserEngine.ready ? "핵심 문장을 고르고 있어요." : "1.7B 모델을 준비하고 있어요.";
      try {
        await browserEngine.load();
        signal.throwIfAborted();
        if (!browserEngine.ready) throw new Error("MODEL_NOT_READY");
        timeout = window.setTimeout(() => controller.abort("timeout"), 60000);
        const ids = passages.map((_, index) => String(index + 1));
        const id = await browserEngine.generate([
          {role: "system", content: "질문에 가장 직접적으로 답하는 문장 하나를 골라 번호만 답해."},
          {role: "user", content: JSON.stringify({question, passages: passages.map((text, i) => ({id: ids[i], text}))})},
        ], signal, () => {}, "root ::= " + ids.map((id) => JSON.stringify(id)).join(" | "));
        signal.throwIfAborted();
        const passage = passages[ids.indexOf(id.trim())];
        if (!passage) throw new Error("INVALID_SELECTION");
        output.textContent = "핵심 문장 · " + passage;
        button.remove();
      } catch {
        output.textContent = signal.reason === "cancelled" ? "" : "핵심 문장을 고르지 못했어요. 위 답변과 출처에서 내용을 확인할 수 있어요.";
      } finally {
        clearTimeout(timeout);
        button.disabled = false;
        if (currentRevision === revision) {
          activeRequest = null;
          setBusy(false);
        }
      }
    });
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
    if (!standalone) {
      const answer = cvAnswer(question, preferredRecordId);
      reply.label.textContent = answer.kind === "page" ? "현재 페이지" : answer.sources.length ? "공개 기록" : "CV 안내";
      reply.body.replaceChildren(...answer.paragraphs.map((text) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        return paragraph;
      }));
      addSources(reply.item, answer.sources);
      if (answer.sources.length) addPassageSelection(reply.item, question, answer);
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
        if (!browserEngine.ready) {
          reply.paragraph.textContent = "모델을 준비하는 대로 답할게요.";
          await browserEngine.load();
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
        ? engineState === "unsupported" ? "이 브라우저에서 WebGPU를 사용할 수 없어요." : "모델을 불러오지 못했어요. 연결을 확인하고 메시지를 다시 보내 주세요."
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
    if (!browserEngine.ready) browserEngine.dispose();
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
    if (!standalone) {
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
    launcher?.focus({ preventScroll: true });
  }

  launcher?.addEventListener("click", () => {
    setView("expanded");
    panel.querySelector<HTMLElement>("#persona-title")?.focus({ preventScroll: true });
  });
  panel.querySelector("[data-persona-collapse]")?.addEventListener("click", collapse);
  panel.addEventListener("keydown", (event) => {
    if (!standalone && event.key === "Escape" && !event.defaultPrevented && !event.isComposing) {
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
      if (!standalone) cancelGeneration(false);
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

  if (!standalone) window.addEventListener("cv:ask", (event) =>
    askPersona((event as CustomEvent<AskDetail>).detail ?? {}),
  );
  function focusFromUrl() {
    if (standalone || !personaEntryRequested(location.href)) return;
    setView("expanded");
    input.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", focusFromUrl);
  input.disabled = false;
  sendButton.disabled = false;
  showCurrentPage();
  resizeInput();
  focusFromUrl();
}
