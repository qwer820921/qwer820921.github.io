import fs from "fs";
import path from "path";
import { getSortedPostsData } from "@/app/(general)/blog/services/blogService";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import HomePageContent from "./HomePageContent";
import PageInfoButton from "@/components/PageInfoButton";

const seo = seoMap[ROUTES.HOME];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.HOME}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img11.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
    type: "website",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img11.webp"],
  },
};

/**
 * 首頁卡片的封面：建置時列出 public/images/cover 實際有的 .webp 檔名（不含副檔名、大小寫照實）。
 * 沒有封面的卡片直接用文字，不去請求不存在的圖片；讀不到目錄時回 null，照舊每張卡片都嘗試載入封面
 */
function readCoverNames(): string[] | null {
  try {
    return fs
      .readdirSync(path.join(process.cwd(), "public/images/cover"))
      .filter((f) => f.endsWith(".webp"))
      .map((f) => f.slice(0, -".webp".length))
      .sort();
  } catch {
    return null;
  }
}

export default function HomePage() {
  const allPosts = getSortedPostsData();
  const latestPosts = allPosts.slice(0, 3);

  return (
    <>
      <PageInfoButton
        title="關於子yee 萬事屋"
        description={
          <>
            <p style={{ marginBottom: "0.5rem" }}>
              結合技術部落格與實用工具的個人網站，涵蓋 AI
              應用開發、前端架構設計、資安實踐等深度文章，以及台股資訊、AI
              去背、發票對獎等生活工具，另有數獨、2048、塔防、神馬三國等多款瀏覽器小遊戲。
            </p>
            <p>
              所有工具均在瀏覽器本地端運行，無需安裝、無需帳號，歡迎透過上方導覽列探索各項功能。
            </p>
          </>
        }
      />
      <HomePageContent
        latestPosts={latestPosts}
        coverNames={readCoverNames()}
      />
    </>
  );
}
