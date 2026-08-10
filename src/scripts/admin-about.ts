import { adminConfig } from "@/config/admin";
import {
  aboutBlockLabels,
  createAboutBlock,
  isAboutBlockType,
  normalizeAboutPage,
  type AboutBlock,
  type AboutBlockArea,
  type AboutBlockType,
  type AboutLinkItem,
  type AboutPageContent,
  type AboutTimelineItem
} from "@/lib/about-components";
import {
  getPostFile,
  getViewer,
  savePostFile,
  type GitHubViewer
} from "@/lib/github-admin";

const tokenKey = "jinyong_blog_admin_token";
const configPath = "content/about/page.json";

function byId<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`${id} 요소를 찾을 수 없습니다.`);
  return element as T;
}

const authView = byId<HTMLElement>("about-auth-view");
const authMessage = byId<HTMLElement>("about-auth-message");
const aboutApp = byId<HTMLElement>("about-app");
const adminSession = byId<HTMLElement>("admin-session");
const viewerAvatar = byId<HTMLImageElement>("viewer-avatar");
const viewerLogin = byId<HTMLElement>("viewer-login");
const viewerLink = byId<HTMLAnchorElement>("viewer-link");
const logoutButton = byId<HTMLButtonElement>("logout-button");
const reloadButton = byId<HTMLButtonElement>("reload-about-button");
const saveButton = byId<HTMLButtonElement>("save-about-button");
const addButton = byId<HTMLButtonElement>("add-about-block-button");
const blockTypeSelect = byId<HTMLSelectElement>("about-block-type");
const pageTitleInput = byId<HTMLInputElement>("about-page-title");
const pageDescriptionInput = byId<HTMLTextAreaElement>("about-page-description");
const blockList = byId<HTMLElement>("about-block-list");
const blockEmpty = byId<HTMLElement>("about-block-empty");
const blockSummary = byId<HTMLElement>("about-block-summary");
const toast = byId<HTMLElement>("admin-toast");

let token = sessionStorage.getItem(tokenKey) ?? "";
let viewer: GitHubViewer | null = null;
let page: AboutPageContent = { title: "About", description: "", blocks: [] };
let configSha = "";
let toastTimer = 0;

function setView(view: "auth" | "app") {
  authView.hidden = view !== "auth";
  aboutApp.hidden = view !== "app";
  adminSession.hidden = view !== "app";
}

function showAuth(message?: string) {
  setView("auth");
  authMessage.textContent = message ?? "";
  authMessage.hidden = !message;
}

function showToast(message: string, tone: "success" | "error" | "info" = "info") {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
}

function setBusy(isBusy: boolean) {
  reloadButton.disabled = isBusy;
  saveButton.disabled = isBusy;
  addButton.disabled = isBusy;
  blockList.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = isBusy || button.dataset.edge === "true";
  });
}

function field(label: string, value: string, name: string, options: { wide?: boolean; textarea?: boolean; help?: string; required?: boolean } = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = `field${options.wide ? " field-wide" : ""}`;
  const title = document.createElement("span");
  title.textContent = label;
  const control: HTMLInputElement | HTMLTextAreaElement = options.textarea
    ? document.createElement("textarea")
    : document.createElement("input");
  control.dataset.field = name;
  control.value = value;
  control.required = options.required ?? false;
  if (control instanceof HTMLTextAreaElement) control.rows = 4;
  wrapper.append(title, control);
  if (options.help) {
    const help = document.createElement("small");
    help.textContent = options.help;
    wrapper.append(help);
  }
  return wrapper;
}

function areaField(block: AboutBlock) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const label = document.createElement("span");
  label.textContent = "표시 위치";
  const select = document.createElement("select");
  select.className = "about-block-area";
  select.dataset.field = "area";
  select.append(new Option("본문", "main"), new Option("사이드바", "sidebar"));
  select.value = block.area;
  if (block.type === "profile") {
    select.value = "main";
    select.disabled = true;
    const help = document.createElement("small");
    help.textContent = "프로필은 본문 상단에 표시됩니다.";
    wrapper.append(label, select, help);
    return wrapper;
  }
  wrapper.append(label, select);
  return wrapper;
}

function itemsToLines(items: string[]) {
  return items.join("\n");
}

function timelineToLines(items: AboutTimelineItem[]) {
  return items.map((item) => [item.period, item.title, item.organization, item.note].join(" | ")).join("\n");
}

function linksToLines(items: AboutLinkItem[]) {
  return items.map((item) => `${item.label} | ${item.href}`).join("\n");
}

function blockFields(block: AboutBlock) {
  const fields = document.createElement("div");
  fields.className = "about-block-fields";
  fields.append(areaField(block));

  if (block.type === "profile") {
    fields.append(
      field("작은 라벨", block.label, "label"),
      field("이름", block.name, "name", { required: true }),
      field("부제", block.subtitle, "subtitle", { wide: true }),
      field("프로필 이미지 URL", block.image, "image", { wide: true }),
      field("소개", block.body, "body", { wide: true, textarea: true })
    );
  } else if (block.type === "text") {
    fields.append(
      field("제목", block.title, "title", { required: true }),
      field("내용", block.body, "body", { wide: true, textarea: true })
    );
  } else if (block.type === "list" || block.type === "tags") {
    fields.append(
      field("제목", block.title, "title", { required: true }),
      field(block.type === "tags" ? "태그" : "목록 항목", itemsToLines(block.items), "items", {
        wide: true,
        textarea: true,
        help: "한 줄에 하나씩 입력하세요."
      })
    );
  } else if (block.type === "timeline") {
    fields.append(
      field("제목", block.title, "title", { required: true }),
      field("경력 · 실적 항목", timelineToLines(block.items), "items", {
        wide: true,
        textarea: true,
        help: "한 줄에 하나씩 ‘기간 | 제목 | 기관 | 설명’ 형식으로 입력하세요."
      })
    );
  } else {
    fields.append(
      field("제목", block.title, "title", { required: true }),
      field("링크 항목", linksToLines(block.items), "items", {
        wide: true,
        textarea: true,
        help: "한 줄에 하나씩 ‘표시 이름 | URL’ 형식으로 입력하세요."
      })
    );
  }

  return fields;
}

function actionButton(label: string, action: "up" | "down" | "delete", disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.dataset.edge = disabled ? "true" : "false";
  button.disabled = disabled;
  button.textContent = label;
  return button;
}

function renderBlocks() {
  blockList.replaceChildren();
  page.blocks.forEach((block, index) => {
    const card = document.createElement("article");
    card.className = "about-block-card";
    card.dataset.blockId = block.id;
    card.dataset.blockType = block.type;

    const header = document.createElement("div");
    header.className = "about-block-header";
    const identity = document.createElement("div");
    identity.className = "about-block-identity";
    const number = document.createElement("span");
    number.className = "about-block-index";
    number.textContent = String(index + 1);
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = aboutBlockLabels[block.type];
    const id = document.createElement("small");
    id.textContent = block.id;
    text.append(title, id);
    identity.append(number, text);

    const actions = document.createElement("div");
    actions.className = "about-block-actions";
    actions.append(
      actionButton("위로", "up", index === 0),
      actionButton("아래로", "down", index === page.blocks.length - 1),
      actionButton("삭제", "delete")
    );
    header.append(identity, actions);
    card.append(header, blockFields(block));
    blockList.append(card);
  });

  blockEmpty.hidden = page.blocks.length > 0;
  blockSummary.textContent = `현재 ${page.blocks.length}개 · 위에서 아래 순서로 표시`;
}

function readValue(card: HTMLElement, name: string) {
  return card.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-field="${name}"]`)?.value.trim() ?? "";
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseTimeline(value: string, validate = true) {
  return lines(value).map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (validate && parts.length < 2) throw new Error(`경력 · 실적 ${index + 1}번째 줄은 ‘기간 | 제목 | 기관 | 설명’ 형식이어야 합니다.`);
    return {
      period: parts[0] ?? "",
      title: parts[1] ?? "",
      organization: parts[2] ?? "",
      note: parts.slice(3).join(" | ")
    };
  });
}

function validLink(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function parseLinks(value: string, validate = true) {
  return lines(value).map((line, index) => {
    const separator = line.indexOf("|");
    if (validate && separator < 1) throw new Error(`링크 ${index + 1}번째 줄은 ‘표시 이름 | URL’ 형식이어야 합니다.`);
    const label = separator < 0 ? line : line.slice(0, separator).trim();
    const href = separator < 0 ? "" : line.slice(separator + 1).trim();
    if (validate && (!label || !validLink(href))) throw new Error(`링크 ${index + 1}번째 줄의 이름 또는 URL을 확인해 주세요.`);
    return { label, href };
  });
}

function collectBlocks(validate = true): AboutBlock[] {
  return Array.from(blockList.querySelectorAll<HTMLElement>(".about-block-card")).map((card) => {
    const type = card.dataset.blockType ?? "";
    if (!isAboutBlockType(type)) throw new Error("알 수 없는 구성 요소가 있습니다.");
    const id = card.dataset.blockId ?? crypto.randomUUID();
    const area: AboutBlockArea = type === "profile" ? "main" : readValue(card, "area") === "sidebar" ? "sidebar" : "main";

    if (type === "profile") {
      const image = readValue(card, "image");
      if (validate && image && !validLink(image.replace(/^mailto:/, "invalid:"))) throw new Error("프로필 이미지 URL을 확인해 주세요.");
      return { id, type, area, label: readValue(card, "label"), name: readValue(card, "name"), subtitle: readValue(card, "subtitle"), image, body: readValue(card, "body") };
    }
    if (type === "text") return { id, type, area, title: readValue(card, "title"), body: readValue(card, "body") };
    if (type === "list" || type === "tags") return { id, type, area, title: readValue(card, "title"), items: lines(readValue(card, "items")) };
    if (type === "timeline") return { id, type, area, title: readValue(card, "title"), items: parseTimeline(readValue(card, "items"), validate) };
    return { id, type: "links", area, title: readValue(card, "title"), items: parseLinks(readValue(card, "items"), validate) };
  });
}

function syncPageFromEditor() {
  const title = pageTitleInput.value.trim();
  const description = pageDescriptionInput.value.trim();
  if (!title || !description) throw new Error("브라우저 제목과 검색 결과 설명을 입력해 주세요.");
  page = { title, description, blocks: collectBlocks() };
}

function setViewer(nextViewer: GitHubViewer) {
  viewer = nextViewer;
  viewerAvatar.src = nextViewer.avatar_url;
  viewerAvatar.alt = `${nextViewer.login} 프로필 이미지`;
  viewerLogin.textContent = nextViewer.login;
  viewerLink.href = nextViewer.html_url;
}

async function loadPage() {
  if (!viewer) return;
  setBusy(true);
  try {
    const file = await getPostFile(token, adminConfig.owner, adminConfig.repository, adminConfig.branch, configPath);
    page = normalizeAboutPage(JSON.parse(file.source));
    configSha = file.sha;
    pageTitleInput.value = page.title;
    pageDescriptionInput.value = page.description;
    renderBlocks();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "About 구성을 불러오지 못했습니다.", "error");
  } finally {
    setBusy(false);
  }
}

async function authenticate() {
  if (!token) {
    showAuth();
    return;
  }
  try {
    const nextViewer = await getViewer(token);
    if (nextViewer.login.toLowerCase() !== adminConfig.owner.toLowerCase()) {
      throw new Error("이 저장소 소유자 계정만 접근할 수 있습니다.");
    }
    setViewer(nextViewer);
    setView("app");
    await loadPage();
  } catch (error) {
    token = "";
    sessionStorage.removeItem(tokenKey);
    showAuth(error instanceof Error ? error.message : "GitHub 로그인을 확인하지 못했습니다.");
  }
}

blockList.addEventListener("input", () => {
  blockSummary.textContent = `현재 ${page.blocks.length}개 · 저장하지 않은 변경 사항 있음`;
});

blockList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  const card = button?.closest<HTMLElement>(".about-block-card");
  if (!button || !card) return;
  if (button.dataset.action === "delete") {
    const type = card.dataset.blockType ?? "";
    if (!isAboutBlockType(type) || !window.confirm(`${aboutBlockLabels[type]} 구성 요소를 삭제할까요?`)) return;
    card.remove();
    page.blocks = collectBlocks(false);
    renderBlocks();
    blockSummary.textContent = `현재 ${page.blocks.length}개 · 저장하지 않은 변경 사항 있음`;
    return;
  }
  try {
    syncPageFromEditor();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "입력 내용을 확인해 주세요.", "error");
    return;
  }
  const index = page.blocks.findIndex((block) => block.id === card.dataset.blockId);
  if (index < 0) return;
  if (button.dataset.action === "up" && index > 0) {
    [page.blocks[index - 1], page.blocks[index]] = [page.blocks[index], page.blocks[index - 1]];
  } else if (button.dataset.action === "down" && index < page.blocks.length - 1) {
    [page.blocks[index], page.blocks[index + 1]] = [page.blocks[index + 1], page.blocks[index]];
  }
  renderBlocks();
  blockSummary.textContent = `현재 ${page.blocks.length}개 · 저장하지 않은 변경 사항 있음`;
});

addButton.addEventListener("click", () => {
  try {
    syncPageFromEditor();
    const type = blockTypeSelect.value as AboutBlockType;
    if (!isAboutBlockType(type)) return;
    page.blocks.push(createAboutBlock(type));
    renderBlocks();
    blockSummary.textContent = `현재 ${page.blocks.length}개 · 저장하지 않은 변경 사항 있음`;
    blockList.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showToast(error instanceof Error ? error.message : "구성 요소를 추가하지 못했습니다.", "error");
  }
});

reloadButton.addEventListener("click", () => void loadPage());

saveButton.addEventListener("click", async () => {
  if (!viewer) return;
  setBusy(true);
  try {
    syncPageFromEditor();
    const result = await savePostFile(
      token,
      adminConfig.owner,
      adminConfig.repository,
      adminConfig.branch,
      configPath,
      `${JSON.stringify(page, null, 2)}\n`,
      configSha,
      "Configure About page components"
    );
    configSha = result.content?.sha ?? configSha;
    renderBlocks();
    showToast("About 구성을 저장했습니다. 사이트 재배포가 시작됩니다.", "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "About 구성을 저장하지 못했습니다.", "error");
  } finally {
    setBusy(false);
  }
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(tokenKey);
  location.href = "/admin/";
});

pageTitleInput.addEventListener("input", () => {
  blockSummary.textContent = `현재 ${page.blocks.length}개 · 저장하지 않은 변경 사항 있음`;
});
pageDescriptionInput.addEventListener("input", () => {
  blockSummary.textContent = `현재 ${page.blocks.length}개 · 저장하지 않은 변경 사항 있음`;
});

void authenticate();
