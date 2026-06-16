import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import BobaSurvivorsPage from "./components/bobaSurvivorsPage";

// 抓取頁面的 SEO 設定
const seo = seoMap[ROUTES.BOBA_SURVIVORS];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.BOBA_SURVIVORS}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img11.jpg", // TODO: 換成實際的遊戲截圖
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img11.jpg"], // TODO: 換成實際的遊戲截圖
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="重裝全糖珍奶"
        description={
          <p>
            化身奶茶師傅，以珍珠彈、芋泥旋風、黑糖護盾迎戰無盡敵軍！自動攻擊、無限升級，存活到最後一刻。基於
            Godot 引擎的 Vampire Survivors 風格網頁遊戲。
          </p>
        }
      />
      <BobaSurvivorsPage />
    </>
  );
}
