import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import BgRemoverPage from "./components/bgRemoverPage";

const seo = seoMap[ROUTES.BG_REMOVER];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.BG_REMOVER}`,
    images: [
      {
        url: "https://qwer820921.github.io/logo512.png",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/logo512.png"],
  },
};

export default function Page() {
  return <BgRemoverPage />;
}
