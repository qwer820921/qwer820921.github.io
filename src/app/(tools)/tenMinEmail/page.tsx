import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import TenMinEmailPage from "./components/TenMinEmailPage";

const seo = seoMap[ROUTES.TEN_MIN_EMAIL];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.TEN_MIN_EMAIL}`,
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
  return (
    <>
      <PageInfoButton
        title="10 分鐘臨時信箱"
        description={
          <p>
            免費、穩定的臨時信箱服務，無需註冊即開即用。有效避開廣告垃圾郵件，支援即時郵件接收、驗證碼收取與倒數計時功能。
          </p>
        }
      />
      <TenMinEmailPage />
    </>
  );
}
