import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const announcementsDir = path.join(process.cwd(), "public/announcements");

    // ディレクトリが存在しない場合は空配列を返す
    if (!fs.existsSync(announcementsDir)) {
      return NextResponse.json([]);
    }

    const files = fs.readdirSync(announcementsDir);
    const markdownFiles = files.filter((file) => file.endsWith(".md"));

    const announcements = markdownFiles.map((filename) => {
      const filePath = path.join(announcementsDir, filename);
      const fileContents = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContents);

      const slug = filename.replace(/\.md$/, "");

      return {
        slug,
        title: data.title || "無題",
        date: data.date || new Date().toISOString(),
        category: data.category || "お知らせ",
      };
    });

    // 日付順でソート（新しい順）
    announcements.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return NextResponse.json(announcements);
  } catch (error) {
    console.error("Failed to load announcements:", error);
    return NextResponse.json(
      { error: "お知らせの読み込みに失敗しました" },
      { status: 500 },
    );
  }
}
