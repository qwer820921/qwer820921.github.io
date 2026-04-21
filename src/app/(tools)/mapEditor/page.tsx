import fs from "fs";
import path from "path";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import MapEditorPage from "./components/mapEditorPage";

const seo = seoMap[ROUTES.MAP_EDITOR];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.MAP_EDITOR}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img11.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img11.jpg"],
  },
};

export default function Page() {
  let tileImages: string[] = [];
  try {
    const imgDir = path.join(process.cwd(), "public/images/shenmaSanguo");
    tileImages = fs
      .readdirSync(imgDir)
      .filter((f) => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
      .sort();
  } catch {}

  return <MapEditorPage tileImages={tileImages} />;
}
