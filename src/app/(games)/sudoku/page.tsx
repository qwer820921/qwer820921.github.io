import SudokuPage from "./components/SudokuPage";
import { Metadata } from "next";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";

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
  return <SudokuPage />;
}
