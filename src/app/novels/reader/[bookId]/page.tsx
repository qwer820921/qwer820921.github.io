import { getLibraryData } from "../../api/novelApi";
import ReaderPage from "./components/ReaderPage";

// Build 時只產生每本書的一個頁面（不再按章節產生）
export async function generateStaticParams() {
  try {
    const libraryRes = await getLibraryData();
    if (!libraryRes.success || !libraryRes.data) return [];

    return libraryRes.data.map((novel) => ({
      bookId: novel.id,
    }));
  } catch (error) {
    console.error("generateStaticParams failed:", error);
    return [];
  }
}

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { bookId } = await params;
  return {
    title: `閱讀中 | 萬事屋藏書閣`,
    description: `正在閱讀書籍 ${bookId}`,
  };
}

export default async function Page({ params }: PageProps) {
  const { bookId } = await params;
  return <ReaderPage bookId={bookId} />;
}
