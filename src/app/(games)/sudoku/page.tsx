import SudokuPage from "./components/SudokuPage";
import { Metadata } from "next";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";

const seo = seoMap[ROUTES.SUDOKU];

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.SUDOKU}`,
    images: [{ url: "https://qwer820921.github.io/images/sudoku-og.jpg" }],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="經典數獨"
        description={
          <>
            <p>
              數獨是在 9×9 方格中填入 1-9
              的邏輯益智遊戲，每個數字在同一列、行、小方格內只能出現一次。
            </p>
            <p>
              提供從入門到專家四種難度，支援智慧筆記模式，鍛鍊邏輯思維！操作方式：點擊空格後使用鍵盤數字鍵或畫面按鈕填入。
            </p>
          </>
        }
      />
      <SudokuPage />
    </>
  );
}
