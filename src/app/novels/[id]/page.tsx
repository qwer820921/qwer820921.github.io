import { getLibraryData } from "../api/novelApi";
import NovelDetailPage from "./components/NovelDetailPage";

// Build 時產生所有書籍的靜態頁面
export async function generateStaticParams() {
  try {
    const res = await getLibraryData();
    if (res.success && res.data) {
      return res.data.map((novel) => ({ id: String(novel.id) }));
    }
  } catch (error) {
    console.error("generateStaticParams failed:", error);
  }
  return [];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// 動態產生這本小說的 SEO Metadata
export async function generateMetadata({ params }: PageProps) {
  try {
    const { id } = await params;
    // 💡 因為我們在 api 層有設定 Next.js 快取，這裡呼叫不會造成 GAS 負擔
    const res = await getLibraryData();
    const novel = res.data?.find((n) => n.id === id);

    if (!novel) {
      return { title: "找不到該書籍 | 萬事屋藏書閣" };
    }

    return {
      title: `${novel.title} | 萬事屋藏書閣`,
      description: novel.summary,
      openGraph: {
        title: novel.title,
        description: novel.summary,
        images: [{ url: novel.cover_url || "https://qwer820921.github.io/images/img14.jpg" }],
      },
    };
  } catch (error) {
    return { title: "書籍詳情 | 萬事屋藏書閣" };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <NovelDetailPage bookId={id} />;
}