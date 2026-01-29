"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppSidebar } from "@/components/AppSidebar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { use } from "react";

type AnnouncementDetail = {
  title: string;
  date: string;
  category: string;
  content: string;
};

export default function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [announcement, setAnnouncement] = useState<AnnouncementDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        const response = await fetch(`/api/announcements/${slug}`);
        if (response.ok) {
          const data = await response.json();
          setAnnouncement(data);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error("Failed to fetch announcement:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncement();
  }, [slug]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <main className="flex-1 md:ml-64">
        <div className="max-w-4xl mx-auto p-8">
          <Link
            href="/announcements"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            お知らせ一覧に戻る
          </Link>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : error || !announcement ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                お知らせが見つかりませんでした
              </p>
              <Link
                href="/announcements"
                className="text-emerald-400 hover:underline"
              >
                お知らせ一覧に戻る
              </Link>
            </div>
          ) : (
            <article>
              <header className="mb-8 pb-6 border-b border-border">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-block px-2 py-1 text-xs font-medium rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-400/20">
                    {announcement.category}
                  </span>
                  <time className="text-sm text-muted-foreground">
                    {new Date(announcement.date).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>
                <h1 className="text-3xl font-bold text-foreground">
                  {announcement.title}
                </h1>
              </header>

              <div className="prose prose-slate dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ ...props }) => (
                      <h1
                        className="text-2xl font-bold mt-8 mb-4 text-foreground"
                        {...props}
                      />
                    ),
                    h2: ({ ...props }) => (
                      <h2
                        className="text-xl font-semibold mt-6 mb-3 text-foreground"
                        {...props}
                      />
                    ),
                    h3: ({ ...props }) => (
                      <h3
                        className="text-lg font-semibold mt-4 mb-2 text-foreground"
                        {...props}
                      />
                    ),
                    p: ({ ...props }) => (
                      <p
                        className="mb-4 text-foreground/90 leading-relaxed"
                        {...props}
                      />
                    ),
                    ul: ({ ...props }) => (
                      <ul
                        className="list-disc list-inside mb-4 space-y-2 text-foreground/90"
                        {...props}
                      />
                    ),
                    ol: ({ ...props }) => (
                      <ol
                        className="list-decimal list-inside mb-4 space-y-2 text-foreground/90"
                        {...props}
                      />
                    ),
                    li: ({ ...props }) => (
                      <li className="text-foreground/90" {...props} />
                    ),
                    strong: ({ ...props }) => (
                      <strong
                        className="font-semibold text-foreground"
                        {...props}
                      />
                    ),
                    code: ({ ...props }) => (
                      <code
                        className="px-1.5 py-0.5 rounded bg-muted text-emerald-400 text-sm font-mono"
                        {...props}
                      />
                    ),
                    pre: ({ ...props }) => (
                      <pre
                        className="p-4 rounded-lg bg-muted overflow-x-auto mb-4"
                        {...props}
                      />
                    ),
                  }}
                >
                  {announcement.content}
                </ReactMarkdown>
              </div>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
