import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import MainMenuContent from "./components/MainMenuContent";

const seo = seoMap[ROUTES.SHENMA_SANGUO];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.SHENMA_SANGUO}`,
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
  return <MainMenuContent />;
}
