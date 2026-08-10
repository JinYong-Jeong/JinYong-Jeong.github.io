import { parse, stringify } from "yaml";

export const POST_CATEGORIES = [
  "llm",
  "federated-learning",
  "paper-review",
  "experiment-log",
  "development"
] as const;

export type PostCategory = (typeof POST_CATEGORIES)[number];

export interface ParsedPost {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface EditablePost {
  title: string;
  description: string;
  date: string;
  category: PostCategory;
  tags: string[];
  draft: boolean;
  featured: boolean;
  cover: string;
  slug: string;
  body: string;
  originalFrontmatter: Record<string, unknown>;
}

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function asDateInput(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return "";
}

export function parsePostFile(source: string): ParsedPost {
  const match = source.match(frontmatterPattern);
  if (!match) {
    throw new Error("올바른 frontmatter가 없는 글입니다.");
  }

  const parsed = parse(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("frontmatter 형식을 읽을 수 없습니다.");
  }

  return {
    frontmatter: parsed as Record<string, unknown>,
    body: match[2]
  };
}

export function toEditablePost(source: string): EditablePost {
  const { frontmatter, body } = parsePostFile(source);
  const category = POST_CATEGORIES.includes(frontmatter.category as PostCategory)
    ? (frontmatter.category as PostCategory)
    : "development";

  return {
    title: String(frontmatter.title ?? ""),
    description: String(frontmatter.description ?? ""),
    date: asDateInput(frontmatter.date),
    category,
    tags: Array.isArray(frontmatter.tags)
      ? frontmatter.tags.map((tag) => String(tag))
      : [],
    draft: frontmatter.draft === true,
    featured: frontmatter.featured === true,
    cover: String(frontmatter.cover ?? ""),
    slug: String(frontmatter.slug ?? ""),
    body,
    originalFrontmatter: frontmatter
  };
}

export function serializePostFile(post: EditablePost, updated?: string) {
  const knownKeys = new Set([
    "title",
    "description",
    "date",
    "updated",
    "category",
    "tags",
    "draft",
    "featured",
    "cover",
    "slug"
  ]);
  const preserved = Object.fromEntries(
    Object.entries(post.originalFrontmatter).filter(([key]) => !knownKeys.has(key))
  );
  const frontmatter: Record<string, unknown> = {
    title: post.title.trim(),
    description: post.description.trim(),
    date: post.date,
    category: post.category,
    tags: post.tags,
    draft: post.draft,
    featured: post.featured,
    slug: post.slug.trim(),
    ...preserved
  };

  if (updated) frontmatter.updated = updated;
  if (post.cover.trim()) frontmatter.cover = post.cover.trim();

  const yaml = stringify(frontmatter, {
    lineWidth: 0,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN"
  }).trimEnd();

  return `---\n${yaml}\n---\n\n${post.body.trimStart()}`;
}

export function sanitizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function decodeBase64Utf8(value: string) {
  const normalized = value.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(normalized), (character) =>
    character.charCodeAt(0)
  );
  return new TextDecoder().decode(bytes);
}

export function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
