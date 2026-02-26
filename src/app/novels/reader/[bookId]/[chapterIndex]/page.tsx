import { getChapterContentData, getLibraryData, getChaptersData } from "../../../api/novelApi";
import ReaderPage from "./components/ReaderPage";

// Build 時產生所有書籍 × 所有章節的靜態頁面
export async function generateStaticParams() {
  try {
    const libraryRes = await getLibraryData();
    if (!libraryRes.success || !libraryRes.data) return [];

    const allParams: { bookId: string; chapterIndex: string }[] = [];

    for (const novel of libraryRes.data) {
      const chaptersRes = await getChaptersData(novel.id);
      if (chaptersRes.success && chaptersRes.data) {
        for (const chapter of chaptersRes.data) {
          allParams.push({
            bookId: String(novel.id),
            chapterIndex: String(chapter.chapter_index),
          });
        }
      }
    }

    return allParams;
  } catch (error) {
    console.error("generateStaticParams failed:", error);
  }
  return [];
}

interface PageProps {
  params: Promise<{ bookId: string; chapterIndex: string }>;
}

// 動態產生這一個章節的 SEO
export async function generateMetadata({ params }: PageProps) {
  try {
    const { bookId, chapterIndex } = await params;
    const chapterIndexNum = parseInt(chapterIndex, 10);
    // 這裡同樣會受到 Next.js 的快取保護
    const res = await getChapterContentData(bookId, chapterIndexNum);
    
    if (!res.success || !res.data) {
      return { title: "閱讀章節 | 萬事屋藏書閣" };
    }

    return {
      title: `${res.data.chapter_title} | 萬事屋藏書閣`,
      description: `正在閱讀《${bookId}》第 ${chapterIndex} 章。`,
    };
  } catch (error) {
    return { title: "閱讀章節 | 萬事屋藏書閣" };
  }
}

export default async function Page({ params }: PageProps) {
  const { bookId, chapterIndex } = await params;
  return (
    <ReaderPage 
      bookId={bookId} 
      // 確保將網址上的字串轉換為數字
      chapterIndex={parseInt(chapterIndex, 10)} 
    />
  );
}