import DOMPurify from "dompurify";
import { marked } from "marked";
import { adminConfig, isAdminConfigured } from "@/config/admin";
import {
  POST_CATEGORIES,
  sanitizeSlug,
  serializePostFile,
  toEditablePost,
  type EditablePost,
  type PostCategory
} from "@/lib/admin-content";
import {
  deletePostFile,
  getPostFile,
  getViewer,
  listPostPaths,
  savePostFile,
  type GitHubViewer
} from "@/lib/github-admin";

interface LoadedPost extends EditablePost {
  path: string;
  sha: string;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

const tokenKey = "jinyong_blog_admin_token";
const oauthStateKey = "jinyong_blog_admin_oauth_state";

function byId<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`${id} 요소를 찾을 수 없습니다.`);
  return element as T;
}

const setupView = byId<HTMLElement>("setup-view");
const authView = byId<HTMLElement>("auth-view");
const adminApp = byId<HTMLElement>("admin-app");
const adminSession = byId<HTMLElement>("admin-session");
const authMessage = byId<HTMLElement>("auth-message");
const loginButton = byId<HTMLButtonElement>("login-button");
const logoutButton = byId<HTMLButtonElement>("logout-button");
const viewerAvatar = byId<HTMLImageElement>("viewer-avatar");
const viewerLogin = byId<HTMLElement>("viewer-login");
const viewerLink = byId<HTMLAnchorElement>("viewer-link");
const postList = byId<HTMLElement>("post-list");
const postCount = byId<HTMLElement>("post-count");
const postSearch = byId<HTMLInputElement>("post-search");
const refreshButton = byId<HTMLButtonElement>("refresh-button");
const newPostButton = byId<HTMLButtonElement>("new-post-button");
const form = byId<HTMLFormElement>("post-form");
const titleInput = byId<HTMLInputElement>("post-title");
const descriptionInput = byId<HTMLTextAreaElement>("post-description");
const dateInput = byId<HTMLInputElement>("post-date");
const categoryInput = byId<HTMLSelectElement>("post-category");
const slugInput = byId<HTMLInputElement>("post-slug");
const tagsInput = byId<HTMLInputElement>("post-tags");
const coverInput = byId<HTMLInputElement>("post-cover");
const draftInput = byId<HTMLInputElement>("post-draft");
const featuredInput = byId<HTMLInputElement>("post-featured");
const bodyInput = byId<HTMLTextAreaElement>("post-body");
const saveButton = byId<HTMLButtonElement>("save-button");
const deleteButton = byId<HTMLButtonElement>("delete-button");
const saveState = byId<HTMLElement>("save-state");
const editorMode = byId<HTMLElement>("editor-mode");
const editorHeading = byId<HTMLElement>("editor-heading");
const writeTab = byId<HTMLButtonElement>("write-tab");
const previewTab = byId<HTMLButtonElement>("preview-tab");
const writePanel = byId<HTMLElement>("write-panel");
const previewPanel = byId<HTMLElement>("preview-panel");
const markdownToolbar = byId<HTMLElement>("markdown-toolbar");
const toast = byId<HTMLElement>("admin-toast");
const deleteDialog = byId<HTMLDialogElement>("delete-dialog");
const deleteMessage = byId<HTMLElement>("delete-message");
const cancelDeleteButton = byId<HTMLButtonElement>("cancel-delete-button");
const confirmDeleteButton = byId<HTMLButtonElement>("confirm-delete-button");

let token = sessionStorage.getItem(tokenKey) ?? "";
let viewer: GitHubViewer | null = null;
let posts: LoadedPost[] = [];
let currentPost: LoadedPost | null = null;
let dirty = false;
let slugTouched = false;
let toastTimer = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function setView(view: "setup" | "auth" | "app") {
  setupView.hidden = view !== "setup";
  authView.hidden = view !== "auth";
  adminApp.hidden = view !== "app";
  adminSession.hidden = view !== "app";
}

function showAuthError(message: string) {
  authMessage.textContent = message;
  authMessage.hidden = false;
}

function showToast(message: string, tone: "success" | "error" | "info" = "info") {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function setBusy(isBusy: boolean, message = "처리 중…") {
  saveButton.disabled = isBusy;
  deleteButton.disabled = isBusy || !currentPost;
  refreshButton.disabled = isBusy;
  newPostButton.disabled = isBusy;
  if (isBusy) saveState.textContent = message;
}

function setDirty(nextDirty: boolean) {
  dirty = nextDirty;
  if (dirty) {
    saveState.textContent = "저장되지 않은 변경사항이 있습니다.";
    saveState.dataset.state = "dirty";
  } else {
    saveState.dataset.state = "saved";
  }
}

function buildRedirectUri() {
  return new URL(adminConfig.redirectPath, window.location.origin).toString();
}

function beginLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(oauthStateKey, state);
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", adminConfig.githubClientId);
  authorizeUrl.searchParams.set("redirect_uri", buildRedirectUri());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("allow_signup", "false");
  window.location.assign(authorizeUrl);
}

async function exchangeOAuthCode(code: string, state: string | null) {
  const expectedState = sessionStorage.getItem(oauthStateKey);
  sessionStorage.removeItem(oauthStateKey);

  if (!state || !expectedState || state !== expectedState) {
    throw new Error("로그인 요청을 확인할 수 없습니다. 다시 시도해 주세요.");
  }

  const response = await fetch(`${adminConfig.authApiUrl}/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri: buildRedirectUri() })
  });
  const result = (await response.json().catch(() => ({}))) as TokenResponse;

  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description || result.error || "GitHub 로그인을 완료하지 못했습니다."
    );
  }

  token = result.access_token;
  sessionStorage.setItem(tokenKey, token);
  window.history.replaceState({}, document.title, adminConfig.redirectPath);
}

async function authenticate() {
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
    await loadPosts();
  } catch (error) {
    token = "";
    viewer = null;
    sessionStorage.removeItem(tokenKey);
    setView("auth");
    showAuthError(error instanceof Error ? error.message : "로그인 정보를 확인할 수 없습니다.");
  }
}

function postLabel(post: LoadedPost) {
  return post.title || post.path.split("/").at(-1) || "제목 없음";
}

function renderPosts() {
  const query = postSearch.value.trim().toLowerCase();
  const filtered = posts.filter((post) => {
    const haystack = [post.title, post.category, post.tags.join(" "), post.slug]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  postCount.textContent = `${filtered.length} / ${posts.length} posts`;
  postList.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "library-empty";
    empty.textContent = posts.length ? "검색 결과가 없습니다." : "등록된 게시글이 없습니다.";
    postList.append(empty);
    return;
  }

  for (const post of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "post-list-item";
    if (currentPost?.path === post.path) button.classList.add("is-active");
    button.dataset.path = post.path;

    const meta = document.createElement("span");
    meta.className = "post-list-meta";
    const category = document.createElement("span");
    category.textContent = post.category;
    const date = document.createElement("time");
    date.dateTime = post.date;
    date.textContent = post.date;
    meta.append(category, date);

    const title = document.createElement("strong");
    title.textContent = postLabel(post);
    const status = document.createElement("span");
    status.className = post.draft ? "post-status is-draft" : "post-status";
    status.textContent = post.draft ? "초안" : "공개";

    button.append(meta, title, status);
    button.addEventListener("click", () => selectPost(post));
    postList.append(button);
  }
}

async function loadPosts() {
  setBusy(true, "게시글을 불러오는 중…");
  try {
    const paths = await listPostPaths(
      token,
      adminConfig.owner,
      adminConfig.repository,
      adminConfig.branch
    );
    const files = await Promise.all(
      paths.map((path) =>
        getPostFile(
          token,
          adminConfig.owner,
          adminConfig.repository,
          adminConfig.branch,
          path
        )
      )
    );

    posts = files
      .map((file) => ({ ...toEditablePost(file.source), path: file.path, sha: file.sha }))
      .sort((a, b) => b.date.localeCompare(a.date));
    renderPosts();

    if (currentPost) {
      const refreshed = posts.find((post) => post.path === currentPost?.path);
      if (refreshed) selectPost(refreshed);
      else newPost();
    } else {
      newPost();
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "게시글을 불러오지 못했습니다.", "error");
    saveState.textContent = "게시글 목록을 불러오지 못했습니다.";
  } finally {
    setBusy(false);
  }
}

function fillForm(post: EditablePost) {
  titleInput.value = post.title;
  descriptionInput.value = post.description;
  dateInput.value = post.date;
  categoryInput.value = post.category;
  slugInput.value = post.slug;
  tagsInput.value = post.tags.join(", ");
  coverInput.value = post.cover;
  draftInput.checked = post.draft;
  featuredInput.checked = post.featured;
  bodyInput.value = post.body;
  renderPreview();
}

function selectPost(post: LoadedPost) {
  if (dirty && !window.confirm("저장하지 않은 변경사항이 있습니다. 다른 글을 열까요?")) return;
  currentPost = post;
  slugTouched = true;
  fillForm(post);
  editorMode.textContent = "Edit post";
  editorHeading.textContent = postLabel(post);
  saveState.textContent = `마지막으로 불러온 파일: ${post.path}`;
  deleteButton.disabled = false;
  setDirty(false);
  renderPosts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function newPost() {
  if (dirty && !window.confirm("저장하지 않은 변경사항이 있습니다. 새 글을 작성할까요?")) return;
  currentPost = null;
  slugTouched = false;
  fillForm({
    title: "",
    description: "",
    date: today(),
    category: "development",
    tags: [],
    draft: true,
    featured: false,
    cover: "",
    slug: "",
    body: "## 요약\n\n- 핵심 결론:\n- 가장 중요한 점:\n- 다음 action:\n\n## 내용\n\n",
    originalFrontmatter: {}
  });
  editorMode.textContent = "New post";
  editorHeading.textContent = "새 게시글";
  saveState.textContent = "새 글은 초안으로 시작합니다.";
  deleteButton.disabled = true;
  setDirty(false);
  renderPosts();
  titleInput.focus();
}

function readForm(): EditablePost {
  const category = categoryInput.value as PostCategory;
  if (!POST_CATEGORIES.includes(category)) throw new Error("카테고리를 확인해 주세요.");
  const slug = sanitizeSlug(slugInput.value);
  slugInput.value = slug;

  if (!slug) throw new Error("게시글 URL용 slug를 입력해 주세요.");

  return {
    title: titleInput.value,
    description: descriptionInput.value,
    date: dateInput.value,
    category,
    tags: [...new Set(tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean))],
    draft: draftInput.checked,
    featured: featuredInput.checked,
    cover: coverInput.value,
    slug,
    body: bodyInput.value,
    originalFrontmatter: currentPost?.originalFrontmatter ?? {}
  };
}

async function savePost(event: SubmitEvent) {
  event.preventDefault();
  if (!form.reportValidity()) return;

  try {
    const post = readForm();
    const path =
      currentPost?.path ??
      `content/posts/${post.category}/${post.date}-${post.slug}.mdx`;

    if (!currentPost && posts.some((item) => item.path === path)) {
      throw new Error("같은 날짜와 slug를 사용하는 글이 이미 있습니다.");
    }

    setBusy(true, currentPost ? "변경사항을 저장하는 중…" : "새 글을 저장하는 중…");
    const source = serializePostFile(post, currentPost ? today() : undefined);
    await savePostFile(
      token,
      adminConfig.owner,
      adminConfig.repository,
      adminConfig.branch,
      path,
      source,
      currentPost?.sha
    );
    dirty = false;
    showToast(currentPost ? "게시글을 수정했습니다." : "새 게시글을 만들었습니다.", "success");
    currentPost = currentPost ? { ...currentPost, ...post, path } : null;
    await loadPosts();
    const saved = posts.find((item) => item.path === path);
    if (saved) selectPost(saved);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "게시글을 저장하지 못했습니다.", "error");
    setBusy(false);
  }
}

async function confirmDelete() {
  if (!currentPost) return;
  const post = currentPost;
  confirmDeleteButton.disabled = true;
  cancelDeleteButton.disabled = true;

  try {
    await deletePostFile(
      token,
      adminConfig.owner,
      adminConfig.repository,
      adminConfig.branch,
      post.path,
      post.sha
    );
    dirty = false;
    deleteDialog.close();
    showToast("게시글을 삭제했습니다.", "success");
    currentPost = null;
    await loadPosts();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "게시글을 삭제하지 못했습니다.", "error");
  } finally {
    confirmDeleteButton.disabled = false;
    cancelDeleteButton.disabled = false;
  }
}

function renderPreview() {
  const rendered = marked.parse(bodyInput.value || "_미리 볼 내용이 없습니다._", {
    async: false,
    gfm: true,
    breaks: false
  }) as string;
  previewPanel.innerHTML = DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true }
  });
}

function setEditorTab(tab: "write" | "preview") {
  const preview = tab === "preview";
  if (preview) renderPreview();
  writeTab.classList.toggle("is-active", !preview);
  previewTab.classList.toggle("is-active", preview);
  writeTab.setAttribute("aria-selected", String(!preview));
  previewTab.setAttribute("aria-selected", String(preview));
  writePanel.hidden = preview;
  markdownToolbar.hidden = preview;
  previewPanel.hidden = !preview;
}

function replaceSelection(prefix: string, suffix = prefix, placeholder = "텍스트") {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  const selected = bodyInput.value.slice(start, end) || placeholder;
  bodyInput.setRangeText(`${prefix}${selected}${suffix}`, start, end, "select");
  bodyInput.focus();
  setDirty(true);
}

function applyMarkdownFormat(format: string) {
  if (format === "bold") replaceSelection("**", "**", "굵은 텍스트");
  if (format === "heading") replaceSelection("## ", "", "제목");
  if (format === "quote") replaceSelection("> ", "", "인용문");
  if (format === "code") replaceSelection("```\n", "\n```", "code");
  if (format === "link") {
    const start = bodyInput.selectionStart;
    const end = bodyInput.selectionEnd;
    const selected = bodyInput.value.slice(start, end) || "링크 텍스트";
    bodyInput.setRangeText(`[${selected}](https://)`, start, end, "select");
    bodyInput.focus();
    setDirty(true);
  }
}

loginButton.addEventListener("click", beginLogin);
logoutButton.addEventListener("click", () => {
  token = "";
  viewer = null;
  sessionStorage.removeItem(tokenKey);
  authMessage.hidden = true;
  setView("auth");
});
newPostButton.addEventListener("click", newPost);
refreshButton.addEventListener("click", loadPosts);
postSearch.addEventListener("input", renderPosts);
form.addEventListener("submit", savePost);
form.addEventListener("input", (event) => {
  if (event.target === titleInput && !slugTouched) {
    slugInput.value = sanitizeSlug(titleInput.value);
  }
  setDirty(true);
});
slugInput.addEventListener("input", () => {
  slugTouched = true;
});
slugInput.addEventListener("blur", () => {
  slugInput.value = sanitizeSlug(slugInput.value);
});
writeTab.addEventListener("click", () => setEditorTab("write"));
previewTab.addEventListener("click", () => setEditorTab("preview"));
markdownToolbar.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-format]");
  if (button?.dataset.format) applyMarkdownFormat(button.dataset.format);
});
deleteButton.addEventListener("click", () => {
  if (!currentPost) return;
  deleteMessage.textContent = `“${postLabel(currentPost)}” 글을 삭제하고 저장소에 삭제 커밋을 생성합니다.`;
  deleteDialog.showModal();
});
cancelDeleteButton.addEventListener("click", () => deleteDialog.close());
confirmDeleteButton.addEventListener("click", confirmDelete);
deleteDialog.addEventListener("click", (event) => {
  if (event.target === deleteDialog) deleteDialog.close();
});
window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
});

async function initialize() {
  if (!isAdminConfigured) {
    setView("setup");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error_description") || params.get("error");

  if (oauthError) {
    setView("auth");
    showAuthError(oauthError);
    window.history.replaceState({}, document.title, adminConfig.redirectPath);
    return;
  }

  if (code) {
    setView("auth");
    loginButton.disabled = true;
    loginButton.textContent = "로그인 확인 중…";
    try {
      await exchangeOAuthCode(code, state);
    } catch (error) {
      showAuthError(error instanceof Error ? error.message : "로그인을 완료하지 못했습니다.");
      loginButton.disabled = false;
      loginButton.textContent = "GitHub로 로그인";
      return;
    }
  }

  if (token) await authenticate();
  else setView("auth");
}

void initialize();
