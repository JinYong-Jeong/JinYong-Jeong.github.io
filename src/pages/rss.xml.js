import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { site } from "@/config/site";
import { getPostSlug } from "@/lib/content";

export async function GET(context) {
  const posts = (await getCollection("posts"))
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${getPostSlug(post)}/`,
      categories: post.data.tags
    })),
    customData: "<language>ko-kr</language>"
  });
}
