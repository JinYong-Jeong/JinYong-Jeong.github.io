import { getCollection, type CollectionEntry } from "astro:content";
import { site, type CategoryKey } from "@/config/site";

export type Post = CollectionEntry<"posts">;
export type Project = CollectionEntry<"projects">;

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
  const projects = await getCollection("projects");
  return projects.sort(byDateDesc);
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
