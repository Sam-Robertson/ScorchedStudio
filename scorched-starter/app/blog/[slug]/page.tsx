import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getPostHtml, getPostSlugs } from "@/lib/posts";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

export async function generateStaticParams() {
  return getPostSlugs().map((filename) => ({
    slug: filename.replace(/\.md$/, ""),
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostHtml(slug);
  return {
    title: `${post.title} | Scorched Studio`,
    description: post.excerpt,
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostHtml(slug).catch(() => null);
  if (!post) notFound();

  return (
    <main className="pb-24">
      {/* Cover image */}
      {post.coverImage && (
        <div className="relative w-full aspect-[21/9] max-h-[520px] overflow-hidden">
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            className="object-cover object-center"
            priority
            sizes="100vw"
          />
        </div>
      )}

      <Container className="max-w-2xl">
        {/* Header */}
        <div className="pt-10 pb-8 border-b border-black/10">
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
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
          <h1 className={`${vulfMono.className} text-[28px] md:text-[38px] font-bold leading-[1.1] mb-4`}>
            {post.title}
          </h1>
          <div className={`${vulfMono.className} flex items-center gap-4 text-xs text-neutral-400`}>
            <span>{formatDate(post.date)}</span>
            {post.readingTime && (
              <>
                <span>·</span>
                <span>{post.readingTime}</span>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div
          className="prose prose-neutral max-w-none pt-8"
          dangerouslySetInnerHTML={{ __html: post.html ?? "" }}
        />

        {/* Back link */}
        <div className="mt-14 pt-8 border-t border-black/10">
          <Link
            href="/blog"
            className={`${vulfMono.className} text-sm text-brand underline underline-offset-4 hover:opacity-70`}
          >
            ← All posts
          </Link>
        </div>
      </Container>
    </main>
  );
}
