import { getCollection, type CollectionEntry } from "astro:content";
import { site, type CategoryKey } from "@/config/site";

export type Post = CollectionEntry<"posts">;

export type ProjectStatus = "active" | "paused" | "archived" | "idea" | "fork";

export interface Project {
  id: string;
  data: {
    title: string;
    description: string;
    date: Date;
    status: ProjectStatus;
    featured: boolean;
    techStack: string[];
    links: Array<{ label: string; href: string }>;
    source: "github" | "content";
    repository?: string;
    stars?: number;
    forks?: number;
  };
}

interface GitHubRepository {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  languages_url: string;
  language: string | null;
  topics: string[];
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
}

const githubOwner = "JinYong-Jeong";
const githubApi = "https://api.github.com";
let githubProjectsPromise: Promise<Project[]> | undefined;

const byDateDesc = <T extends { data: { date: Date } }>(a: T, b: T) =>
  b.data.date.getTime() - a.data.date.getTime();

export const categoryKeys = Object.keys(site.categories) as CategoryKey[];

export function isPublishedPost(post: Post) {
  return import.meta.env.DEV || !post.data.draft;
}

export async function getPublishedPosts() {
  const posts = await getCollection("posts");
  return posts.filter(isPublishedPost).sort(byDateDesc);
}

export async function getFeaturedPosts(limit = 3) {
  const posts = await getPublishedPosts();
  return posts.filter((post) => post.data.featured).slice(0, limit);
}

export async function getAllProjects() {
  const fallbackProjects = (await getCollection("projects")).map(
    (project): Project => ({
      id: project.id,
      data: { ...project.data, source: "content" }
    })
  );

  try {
    githubProjectsPromise ??= loadGitHubProjects();
    const githubProjects = await githubProjectsPromise;
    return githubProjects.length > 0
      ? githubProjects.sort(byDateDesc)
      : fallbackProjects.sort(byDateDesc);
  } catch (error) {
    console.warn("GitHub 프로젝트를 불러오지 못해 로컬 목록을 사용합니다.", error);
    return fallbackProjects.sort(byDateDesc);
  }
}

export async function getFeaturedProjects(limit = 3) {
  const projects = await getAllProjects();
  return projects.filter((project) => project.data.featured).slice(0, limit);
}

export function getPostSlug(post: Post) {
  return post.data.slug ?? post.id.split("/").at(-1) ?? post.id;
}

export function getPostUrl(post: Post) {
  return `/blog/${getPostSlug(post)}/`;
}

export function getProjectUrl(project: Project) {
  return `/projects/#${project.id}`;
}

export function getCategoryUrl(category: CategoryKey) {
  return `/blog/category/${category}/`;
}

export function getTagUrl(tag: string) {
  return `/blog/tag/${encodeURIComponent(tag)}/`;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function estimateReadingMinutes(body = "") {
  const latinWords = body.trim().split(/\s+/).filter(Boolean).length;
  const koreanChars = (body.match(/[가-힣]/g) ?? []).length;
  const minutes = Math.ceil((latinWords + koreanChars / 2.8) / 220);
  return Math.max(1, minutes);
}

export function getAllTags(posts: Post[]) {
  return [...new Set(posts.flatMap((post) => post.data.tags))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "jinyong-jeong.github.io",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = import.meta.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubRequest<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub API 요청 실패 (${response.status})`);
  }
  return (await response.json()) as T;
}

function projectTitle(repositoryName: string) {
  return repositoryName.replace(/[-_]+/g, " ");
}

function uniqueTechStack(repository: GitHubRepository, languages: string[]) {
  return [repository.language, ...languages, ...repository.topics]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 5);
}

async function repositoryLanguages(repository: GitHubRepository) {
  if (!import.meta.env.GITHUB_TOKEN) return [];
  const languages = await githubRequest<Record<string, number>>(repository.languages_url);
  return Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .map(([language]) => language);
}

async function loadGitHubProjects(): Promise<Project[]> {
  const repositories = await githubRequest<GitHubRepository[]>(
    `${githubApi}/users/${githubOwner}/repos?per_page=100&sort=updated&direction=desc&type=owner`
  );
  const languages = await Promise.all(
    repositories.map((repository) => repositoryLanguages(repository).catch(() => []))
  );

  return repositories.map((repository, index): Project => {
    const title = projectTitle(repository.name);
    const links = [{ label: "GitHub", href: repository.html_url }];
    if (repository.homepage?.startsWith("http")) {
      links.push({ label: "Live", href: repository.homepage });
    }

    return {
      id: repository.name.toLowerCase(),
      data: {
        title,
        description:
          repository.description?.trim() || `${title} GitHub 저장소입니다.`,
        date: new Date(repository.pushed_at),
        status: repository.archived
          ? "archived"
          : repository.fork
            ? "fork"
            : "active",
        featured: !repository.archived && !repository.fork,
        techStack: uniqueTechStack(repository, languages[index] ?? []),
        links,
        source: "github",
        repository: repository.name,
        stars: repository.stargazers_count,
        forks: repository.forks_count
      }
    };
  });
}
