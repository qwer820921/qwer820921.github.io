import Game2048Page from "./components/Game2048Page";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "2048 經典數位拼圖 - 子yee 萬事屋",
  description:
    "挑戰極致現代風格的 2048 遊戲！合併方塊達到 2048，享受流暢動畫與頂級視覺體驗。",
  keywords: "2048, 數位拼圖, 線上遊戲, 益智遊戲, 子yee 萬事屋",
  openGraph: {
    title: "2048 經典數位拼圖 - 子yee 萬事屋",
    description: "挑戰極致現代風格的 2048 遊戲！",
    url: "https://qwer820921.github.io/game2048",
    images: [{ url: "https://qwer820921.github.io/images/img14.jpg" }],
  },
};

export default function Page() {
  return <Game2048Page />;
}
