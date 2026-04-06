import Game2048Page from "./components/Game2048Page";
import { Metadata } from "next";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";

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
  return <Game2048Page />;
}
