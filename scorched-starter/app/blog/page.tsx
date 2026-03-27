import Image from "next/image";
import Link from "next/link";
import { getAllPosts } from "@/lib/posts";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

export const metadata = {
  title: "Blog | Scorched Studio",
  description: "Stories, tips, and updates from Scorched Wood Burning Studio in Orem, Utah.",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16 pb-10">
        <Container>
          <p className={`eyebrow text-brand text-center`}>Scorched Studio</p>
          <h1 className="h2 font-bold text-center mt-1">Blog</h1>
        </Container>
      </section>

      <Container className="max-w-4xl">
        {posts.length === 0 ? (
          <p className={`${vulfMono.className} text-neutral-400 text-center py-16`}>
            No posts yet — check back soon.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-2xl overflow-hidden border border-black/10 bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                {post.coverImage && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Image
                      src={post.coverImage}
                      alt={post.title}
                      fill
                      className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                )}
                <div className="p-6">
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className={`${vulfMono.className} text-[10px] uppercase tracking-wider text-brand bg-blush rounded-full px-2 py-0.5`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <h2 className={`${vulfMono.className} text-lg font-bold leading-snug mb-2 group-hover:text-brand transition-colors`}>
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-neutral-600 leading-relaxed line-clamp-3 mb-4">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`${vulfMono.className} text-xs text-neutral-400`}>
                      {formatDate(post.date)}
                    </span>
                    {post.readingTime && (
                      <span className={`${vulfMono.className} text-xs text-neutral-400`}>
                        {post.readingTime}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
