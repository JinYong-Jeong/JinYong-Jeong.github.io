import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postCategory = z.enum([
  "llm",
  "federated-learning",
  "paper-review",
  "experiment-log",
  "development"
]);

const posts = defineCollection({
  loader: glob({ base: "./content/posts", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    category: postCategory,
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    cover: z.string().optional(),
    slug: z.string().optional(),
    paper: z
      .object({
        title: z.string(),
        authors: z.array(z.string()).default([]),
        year: z.number().optional(),
        venue: z.string().optional(),
        url: z.url().optional()
      })
      .optional()
  })
});

const projects = defineCollection({
  loader: glob({ base: "./content/projects", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    status: z.enum(["active", "paused", "archived", "idea"]).default("active"),
    featured: z.boolean().default(false),
    techStack: z.array(z.string()).default([]),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.url()
        })
      )
      .default([])
  })
});

export const collections = { posts, projects };
