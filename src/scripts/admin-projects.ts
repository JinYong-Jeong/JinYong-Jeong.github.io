import { adminConfig } from "@/config/admin";
import {
  getPostFile,
  getViewer,
  savePostFile,
  type GitHubViewer
} from "@/lib/github-admin";

interface GitHubRepository {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
}

interface ProjectSelection {
  mode: "all" | "selected";
  selected: string[];
  descriptions: Record<string, string>;
}

const tokenKey = "jinyong_blog_admin_token";
const configPath = "content/projects/github-selection.json";

function byId<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`${id} 요소를 찾을 수 없습니다.`);
  return element as T;
}

const authView = byId<HTMLElement>("projects-auth-view");
const authMessage = byId<HTMLElement>("projects-auth-message");
const projectsApp = byId<HTMLElement>("projects-app");
const adminSession = byId<HTMLElement>("admin-session");
const viewerAvatar = byId<HTMLImageElement>("viewer-avatar");
const viewerLogin = byId<HTMLElement>("viewer-login");
const viewerLink = byId<HTMLAnchorElement>("viewer-link");
const logoutButton = byId<HTMLButtonElement>("logout-button");
const reloadButton = byId<HTMLButtonElement>("reload-projects-button");
const saveButton = byId<HTMLButtonElement>("save-projects-button");
const selectAllButton = byId<HTMLButtonElement>("select-all-button");
const clearAllButton = byId<HTMLButtonElement>("clear-all-button");
const repositorySearch = byId<HTMLInputElement>("repository-search");
const repositorySummary = byId<HTMLElement>("repository-summary");
const repositoryList = byId<HTMLElement>("repository-list");
const repositoryEmpty = byId<HTMLElement>("repository-empty");
const toast = byId<HTMLElement>("admin-toast");

let token = sessionStorage.getItem(tokenKey) ?? "";
let viewer: GitHubViewer | null = null;
let repositories: GitHubRepository[] = [];
let config: ProjectSelection = { mode: "all", selected: [], descriptions: {} };
let configSha = "";
let toastTimer = 0;

function setView(view: "auth" | "app") {
  authView.hidden = view !== "auth";
  projectsApp.hidden = view !== "app";
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
  selectAllButton.disabled = isBusy;
  clearAllButton.disabled = isBusy;
}

async function githubRequest<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(result.message || `GitHub 요청에 실패했습니다. (${response.status})`);
  }
  return (await response.json()) as T;
}

async function loadRepositories() {
  const result: GitHubRepository[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest<GitHubRepository[]>(
      `/users/${adminConfig.owner}/repos?per_page=100&page=${page}&sort=updated&direction=desc&type=owner`
    );
    result.push(...batch);
    if (batch.length < 100) break;
  }
  return result;
}

function parseConfig(source: string): ProjectSelection {
  const parsed = JSON.parse(source) as Partial<ProjectSelection>;
  return {
    mode: parsed.mode === "selected" ? "selected" : "all",
    selected: Array.isArray(parsed.selected)
      ? parsed.selected.filter((name): name is string => typeof name === "string")
      : [],
    descriptions:
      parsed.descriptions && typeof parsed.descriptions === "object"
        ? Object.fromEntries(
            Object.entries(parsed.descriptions).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {}
  };
}

function selectedCheckboxes() {
  return Array.from(
    repositoryList.querySelectorAll<HTMLInputElement>("[data-repository-checkbox]")
  );
}

function updateSummary() {
  const selected = selectedCheckboxes().filter((checkbox) => checkbox.checked).length;
  repositorySummary.textContent = `전체 ${repositories.length}개 중 ${selected}개 표시`;
}

function updateCardState(checkbox: HTMLInputElement) {
  checkbox.closest(".repository-setting-card")?.classList.toggle("is-selected", checkbox.checked);
  updateSummary();
}

function renderRepositories() {
  repositoryList.replaceChildren();
  const selectedNames = new Set(config.selected);

  for (const repository of repositories) {
    const card = document.createElement("article");
    card.className = "repository-setting-card";
    card.dataset.repository = repository.name;
    card.dataset.search = [
      repository.name,
      repository.description ?? "",
      repository.language ?? "",
      repository.fork ? "fork" : "",
      repository.archived ? "archived" : ""
    ]
      .join(" ")
      .toLowerCase();

    const info = document.createElement("div");
    const choice = document.createElement("label");
    choice.className = "repository-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.repositoryCheckbox = repository.name;
    checkbox.checked = config.mode === "all" || selectedNames.has(repository.name);
    const choiceText = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = repository.name;
    const originalDescription = document.createElement("small");
    originalDescription.textContent = repository.description || "GitHub 기본 설명 없음";
    choiceText.append(name, originalDescription);
    choice.append(checkbox, choiceText);

    const meta = document.createElement("div");
    meta.className = "repository-meta";
    for (const value of [
      repository.archived ? "archived" : repository.fork ? "fork" : "active",
      repository.language
    ].filter(Boolean)) {
      const chip = document.createElement("span");
      chip.textContent = String(value);
      meta.append(chip);
    }

    const link = document.createElement("a");
    link.className = "repository-link focus-ring";
    link.href = repository.html_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "GitHub에서 보기 ↗";
    info.append(choice, meta, link);

    const field = document.createElement("label");
    field.className = "repository-description-field";
    const fieldLabel = document.createElement("span");
    fieldLabel.textContent = "사이트에 표시할 설명";
    const description = document.createElement("textarea");
    description.dataset.repositoryDescription = repository.name;
    description.maxLength = 240;
    description.rows = 3;
    description.placeholder = "이 프로젝트에서 무엇을 만들었는지 직접 설명하세요.";
    description.value = config.descriptions[repository.name] ?? repository.description ?? "";
    field.append(fieldLabel, description);

    checkbox.addEventListener("change", () => updateCardState(checkbox));
    card.append(info, field);
    repositoryList.append(card);
    updateCardState(checkbox);
  }

  filterRepositories();
  updateSummary();
}

function filterRepositories() {
  const query = repositorySearch.value.trim().toLowerCase();
  let visible = 0;
  for (const card of repositoryList.querySelectorAll<HTMLElement>(".repository-setting-card")) {
    const matches = !query || (card.dataset.search ?? "").includes(query);
    card.hidden = !matches;
    if (matches) visible += 1;
  }
  repositoryEmpty.hidden = visible !== 0;
}

async function loadProjectSettings() {
  setBusy(true);
  repositorySummary.textContent = "저장소를 불러오는 중…";
  try {
    const [loadedRepositories, configFile] = await Promise.all([
      loadRepositories(),
      getPostFile(
        token,
        adminConfig.owner,
        adminConfig.repository,
        adminConfig.branch,
        configPath
      )
    ]);
    repositories = loadedRepositories;
    config = parseConfig(configFile.source);
    configSha = configFile.sha;
    renderRepositories();
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : "Projects 설정을 불러오지 못했습니다.",
      "error"
    );
    repositorySummary.textContent = "저장소를 불러오지 못했습니다.";
  } finally {
    setBusy(false);
  }
}

async function saveProjectSettings() {
  const selected: string[] = [];
  const descriptions: Record<string, string> = {};

  for (const repository of repositories) {
    const checkbox = repositoryList.querySelector<HTMLInputElement>(
      `[data-repository-checkbox="${CSS.escape(repository.name)}"]`
    );
    const description = repositoryList.querySelector<HTMLTextAreaElement>(
      `[data-repository-description="${CSS.escape(repository.name)}"]`
    );
    if (!checkbox?.checked) continue;
    selected.push(repository.name);
    const customDescription = description?.value.trim();
    if (customDescription) descriptions[repository.name] = customDescription;
  }

  setBusy(true);
  try {
    const nextConfig: ProjectSelection = { mode: "selected", selected, descriptions };
    const result = await savePostFile(
      token,
      adminConfig.owner,
      adminConfig.repository,
      adminConfig.branch,
      configPath,
      `${JSON.stringify(nextConfig, null, 2)}\n`,
      configSha,
      "Configure selected GitHub projects"
    );
    config = nextConfig;
    configSha = result.content?.sha ?? configSha;
    showToast("Projects 설정을 저장했습니다. 사이트 재배포가 시작됩니다.", "success");
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : "Projects 설정을 저장하지 못했습니다.",
      "error"
    );
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
    viewer = await getViewer(token);
    if (viewer.login.toLowerCase() !== adminConfig.owner.toLowerCase()) {
      throw new Error(`${adminConfig.owner} 계정만 이 화면을 사용할 수 있습니다.`);
    }
    viewerAvatar.src = viewer.avatar_url;
    viewerAvatar.alt = `${viewer.login} 프로필 이미지`;
    viewerLogin.textContent = viewer.login;
    viewerLink.href = viewer.html_url;
    setView("app");
    await loadProjectSettings();
  } catch (error) {
    token = "";
    viewer = null;
    sessionStorage.removeItem(tokenKey);
    showAuth(error instanceof Error ? error.message : "로그인 정보를 확인하지 못했습니다.");
  }
}

repositorySearch.addEventListener("input", filterRepositories);
reloadButton.addEventListener("click", loadProjectSettings);
saveButton.addEventListener("click", saveProjectSettings);
selectAllButton.addEventListener("click", () => {
  for (const checkbox of selectedCheckboxes()) {
    checkbox.checked = true;
    updateCardState(checkbox);
  }
});
clearAllButton.addEventListener("click", () => {
  for (const checkbox of selectedCheckboxes()) {
    checkbox.checked = false;
    updateCardState(checkbox);
  }
});
logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(tokenKey);
  window.location.assign("/admin/");
});

void authenticate();
