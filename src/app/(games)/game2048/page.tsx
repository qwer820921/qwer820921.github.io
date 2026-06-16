import Game2048Page from "./components/Game2048Page";
import { Metadata } from "next";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";

const seo = seoMap[ROUTES.GAME2048];

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.GAME2048}`,
    images: [{ url: "https://qwer820921.github.io/images/maple/img14.webp" }],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="2048 數位拼圖"
        description={
          <>
            <p>
              在 4×4 的方格上，滑動合併相同數字的方塊，目標是合出
              2048。每次滑動後隨機出現新方塊，盤面填滿且無法合併時遊戲結束。
            </p>
            <p>
              操作方式：鍵盤方向鍵（← ↑ →
              ↓）或觸控裝置滑動。挑戰看看你能達到多高的分數！
            </p>
          </>
        }
      />
      <Game2048Page />
    </>
  );
}
