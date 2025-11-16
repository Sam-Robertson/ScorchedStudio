import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { remark } from "remark"
import html from "remark-html"
import readingTime from "reading-time"
import type { Post, PostMeta } from "@/types/post"

const POSTS_DIR = path.join(process.cwd(), "content", "blog")

export function getPostSlugs(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return []
  return fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".md"))
}

export function getPostBySlug(slug: string): Post {
  const realSlug = slug.replace(/\.md$/, "")
  const fullPath = path.join(POSTS_DIR, `${realSlug}.md`)
  const file = fs.readFileSync(fullPath, "utf8")
  const { data, content } = matter(file)

  const meta: PostMeta = {
    slug: realSlug,
    title: data.title ?? realSlug,
    date: data.date ?? new Date().toISOString(),
    excerpt: data.excerpt ?? "",
    coverImage: data.coverImage ?? "",
    tags: data.tags ?? [],
    readingTime: readingTime(content).text,
  }

  return { ...meta, content }
}

export async function getPostHtml(slug: string): Promise<Post> {
  const post = getPostBySlug(slug)
  const processed = await remark().use(html).process(post.content)
  return { ...post, html: processed.toString() }
}

export async function getAllPosts(): Promise<PostMeta[]> {
  const slugs = getPostSlugs()
  const posts = slugs.map(s => getPostBySlug(s))
  return posts
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map(({ content, ...meta }) => meta)
}
