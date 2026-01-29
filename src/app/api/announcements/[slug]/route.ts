import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const announcementsDir = path.join(process.cwd(), "public/announcements");
    const filePath = path.join(announcementsDir, `${slug}.md`);

    // ファイルが存在しない場合は404
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "お知らせが見つかりませんでした" },
        { status: 404 },
      );
    }

    const fileContents = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(fileContents);

    return NextResponse.json({
      title: data.title || "無題",
      date: data.date || new Date().toISOString(),
      category: data.category || "お知らせ",
      content,
    });
  } catch (error) {
    console.error("Failed to load announcement:", error);
    return NextResponse.json(
      { error: "お知らせの読み込みに失敗しました" },
      { status: 500 },
    );
  }
}
