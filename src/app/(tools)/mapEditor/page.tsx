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

const IMAGE_EXT = /\.(webp|png|jpg|jpeg|gif)$/i;

function readImages(sub: string): string[] {
  try {
    const dir = path.join(process.cwd(), "public/images/shenmaSanguo", sub);
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXT.test(f))
      .sort()
      .map((f) => `${sub}/${f}`);
  } catch {
    return [];
  }
}

export default function Page() {
  const tileImages = readImages("tiles");
  const mapImages = readImages("maps");
  return <MapEditorPage tileImages={tileImages} mapImages={mapImages} />;
}
