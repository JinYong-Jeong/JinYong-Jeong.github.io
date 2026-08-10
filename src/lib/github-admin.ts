import { decodeBase64Utf8, encodeBase64Utf8 } from "@/lib/admin-content";

const githubApi = "https://api.github.com";

interface GitHubError {
  message?: string;
  documentation_url?: string;
}

export interface GitHubViewer {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GitHubPostFile {
  path: string;
  sha: string;
  source: string;
}

interface GitTreeResponse {
  truncated: boolean;
  tree: Array<{
    path: string;
    type: "blob" | "tree";
  }>;
}

interface GitHubContentResponse {
  type: string;
  path: string;
  sha: string;
  content: string;
  encoding: string;
}

interface GitHubWriteResponse {
  content: {
    path: string;
    sha: string;
  } | null;
  commit: {
    sha: string;
    html_url: string;
  };
}

async function githubRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${githubApi}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers
    }
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as GitHubError;
    throw new Error(error.message || `GitHub 요청에 실패했습니다. (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function encodedPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function getViewer(token: string) {
  return githubRequest<GitHubViewer>(token, "/user");
}

export async function listPostPaths(
  token: string,
  owner: string,
  repository: string,
  branch: string
) {
  const tree = await githubRequest<GitTreeResponse>(
    token,
    `/repos/${owner}/${repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );

  if (tree.truncated) {
    throw new Error("저장소 파일 목록이 너무 커서 일부만 불러왔습니다.");
  }

  return tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        /^content\/posts\/.+\.(md|mdx)$/.test(entry.path)
    )
    .map((entry) => entry.path);
}

export async function getPostFile(
  token: string,
  owner: string,
  repository: string,
  branch: string,
  path: string
): Promise<GitHubPostFile> {
  const file = await githubRequest<GitHubContentResponse>(
    token,
    `/repos/${owner}/${repository}/contents/${encodedPath(path)}?ref=${encodeURIComponent(branch)}`
  );

  if (file.type !== "file" || file.encoding !== "base64") {
    throw new Error(`${path} 파일을 읽을 수 없습니다.`);
  }

  return {
    path: file.path,
    sha: file.sha,
    source: decodeBase64Utf8(file.content)
  };
}

export function savePostFile(
  token: string,
  owner: string,
  repository: string,
  branch: string,
  path: string,
  source: string,
  sha?: string
) {
  return githubRequest<GitHubWriteResponse>(
    token,
    `/repos/${owner}/${repository}/contents/${encodedPath(path)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: sha ? `Update post: ${path}` : `Add post: ${path}`,
        content: encodeBase64Utf8(source),
        branch,
        ...(sha ? { sha } : {})
      })
    }
  );
}

export function deletePostFile(
  token: string,
  owner: string,
  repository: string,
  branch: string,
  path: string,
  sha: string
) {
  return githubRequest<GitHubWriteResponse>(
    token,
    `/repos/${owner}/${repository}/contents/${encodedPath(path)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Delete post: ${path}`,
        branch,
        sha
      })
    }
  );
}
