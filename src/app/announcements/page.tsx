"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppSidebar } from "@/components/AppSidebar";

type Announcement = {
  slug: string;
  title: string;
  date: string;
  category: string;
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const response = await fetch("/api/announcements");
        if (response.ok) {
          const data = await response.json();
          setAnnouncements(data);
        }
      } catch (error) {
        console.error("Failed to fetch announcements:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <main className="flex-1 md:ml-64">
        <div className="max-w-5xl mx-auto p-8">
          {/* ヘッダーセクション */}
          <div className="mb-12 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent blur-3xl"></div>
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/20 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                  Latest Updates
                </span>
              </div>
              <h1 className="text-4xl font-extrabold text-foreground mb-3 tracking-tight">
                お知らせ
              </h1>
              <p className="text-muted-foreground text-lg">
                システムのアップデート情報や重要なお知らせをご確認いただけます
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="relative">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl"></div>
              </div>
            </div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-block p-4 rounded-full bg-muted/50 mb-4">
                <svg
                  className="w-12 h-12 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
              </div>
              <p className="text-muted-foreground text-lg">
                現在、お知らせはありません
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement, index) => (
                <Link
                  key={announcement.slug}
                  href={`/announcements/${announcement.slug}`}
                  className="block group"
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-background via-background to-background/50 hover:border-emerald-400/40 transition-all duration-300 group-hover:shadow-[0_8px_30px_rgba(16,185,129,0.15)]">
                    {/* グロー効果 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                    {/* アクセントライン */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                    <div className="relative p-6">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1 min-w-0">
                          {/* カテゴリ & 日付 */}
                          <div className="flex items-center gap-3 mb-3">
                            <span className="relative inline-flex items-center px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                              <span className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 to-transparent rounded-md"></span>
                              <span className="relative">
                                {announcement.category}
                              </span>
                            </span>
                            <div className="h-4 w-px bg-border"></div>
                            <time className="text-sm font-medium text-muted-foreground tabular-nums">
                              {new Date(announcement.date).toLocaleDateString(
                                "ja-JP",
                                {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                },
                              )}
                            </time>
                          </div>

                          {/* タイトル */}
                          <h2 className="text-xl font-bold text-foreground group-hover:text-emerald-400 transition-colors duration-300 leading-tight">
                            {announcement.title}
                          </h2>
                        </div>

                        {/* 矢印アイコン */}
                        <div className="flex-shrink-0 mt-1">
                          <div className="relative w-10 h-10 flex items-center justify-center rounded-lg border border-border/50 bg-muted/30 group-hover:border-emerald-400/50 group-hover:bg-emerald-500/10 transition-all duration-300">
                            <svg
                              className="w-5 h-5 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all duration-300"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
