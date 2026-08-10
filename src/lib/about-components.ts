export type AboutBlockType = "profile" | "text" | "list" | "tags" | "timeline" | "links";
export type AboutBlockArea = "main" | "sidebar";

interface AboutBlockBase {
  id: string;
  type: AboutBlockType;
  area: AboutBlockArea;
}

export interface AboutProfileBlock extends AboutBlockBase {
  type: "profile";
  label: string;
  name: string;
  subtitle: string;
  image: string;
  body: string;
}

export interface AboutTextBlock extends AboutBlockBase {
  type: "text";
  title: string;
  body: string;
}

export interface AboutListBlock extends AboutBlockBase {
  type: "list";
  title: string;
  items: string[];
}

export interface AboutTagsBlock extends AboutBlockBase {
  type: "tags";
  title: string;
  items: string[];
}

export interface AboutTimelineItem {
  period: string;
  title: string;
  organization: string;
  note: string;
}

export interface AboutTimelineBlock extends AboutBlockBase {
  type: "timeline";
  title: string;
  items: AboutTimelineItem[];
}

export interface AboutLinkItem {
  label: string;
  href: string;
}

export interface AboutLinksBlock extends AboutBlockBase {
  type: "links";
  title: string;
  items: AboutLinkItem[];
}

export type AboutBlock =
  | AboutProfileBlock
  | AboutTextBlock
  | AboutListBlock
  | AboutTagsBlock
  | AboutTimelineBlock
  | AboutLinksBlock;

export interface AboutPageContent {
  title: string;
  description: string;
  blocks: AboutBlock[];
}

export const aboutBlockLabels: Record<AboutBlockType, string> = {
  profile: "프로필",
  text: "텍스트",
  list: "목록",
  tags: "태그",
  timeline: "경력 · 실적",
  links: "링크"
};

const blockTypes = new Set<AboutBlockType>([
  "profile",
  "text",
  "list",
  "tags",
  "timeline",
  "links"
]);

export function isAboutBlockType(value: string): value is AboutBlockType {
  return blockTypes.has(value as AboutBlockType);
}

export function createAboutBlock(type: AboutBlockType, id = crypto.randomUUID()): AboutBlock {
  const base = { id, type, area: "main" as const };
  if (type === "profile") {
    return { ...base, type, label: "Profile", name: "이름", subtitle: "역할", image: "", body: "소개를 입력하세요." };
  }
  if (type === "text") return { ...base, type, title: "새 텍스트", body: "내용을 입력하세요." };
  if (type === "list") return { ...base, type, title: "새 목록", items: [] };
  if (type === "tags") return { ...base, type, title: "새 태그", items: [] };
  if (type === "timeline") return { ...base, type, title: "경력 · 실적", items: [] };
  return { ...base, type: "links", title: "링크", items: [] };
}

export function normalizeAboutPage(value: unknown): AboutPageContent {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawBlocks = Array.isArray(source.blocks) ? source.blocks : [];
  return {
    title: typeof source.title === "string" ? source.title : "About",
    description: typeof source.description === "string" ? source.description : "프로필과 실적입니다.",
    blocks: rawBlocks.map(normalizeBlock).filter((block): block is AboutBlock => Boolean(block))
  };
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function text(source: Record<string, unknown>, key: string) {
  return typeof source[key] === "string" ? source[key] : "";
}

function normalizeBlock(value: unknown): AboutBlock | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const type = text(source, "type");
  if (!isAboutBlockType(type)) return null;
  const id = text(source, "id") || `${type}-${Math.random().toString(36).slice(2)}`;
  const area: AboutBlockArea = type !== "profile" && source.area === "sidebar" ? "sidebar" : "main";

  if (type === "profile") {
    return {
      id, type, area,
      label: text(source, "label"), name: text(source, "name"), subtitle: text(source, "subtitle"),
      image: text(source, "image"), body: text(source, "body")
    };
  }
  if (type === "text") return { id, type, area, title: text(source, "title"), body: text(source, "body") };
  if (type === "list") return { id, type, area, title: text(source, "title"), items: strings(source.items) };
  if (type === "tags") return { id, type, area, title: text(source, "title"), items: strings(source.items) };
  if (type === "timeline") {
    const items = Array.isArray(source.items)
      ? source.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            period: text(item, "period"), title: text(item, "title"),
            organization: text(item, "organization"), note: text(item, "note")
          }))
      : [];
    return { id, type, area, title: text(source, "title"), items };
  }
  const items = Array.isArray(source.items)
    ? source.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({ label: text(item, "label"), href: text(item, "href") }))
    : [];
  return { id, type: "links", area, title: text(source, "title"), items };
}
