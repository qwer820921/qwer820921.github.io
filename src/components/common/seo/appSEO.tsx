"use client";
import { usePathname } from "next/navigation";
import { seoMap } from "@/constants/seoMap";
import SEO from "./seo";

const BASE_URL = "https://qwer820921.github.io";

const AppSEO = () => {
  const pathname = usePathname();
  const seo = seoMap[pathname];

  if (!seo) return null;

  return (
    <SEO
      title={seo.title}
      description={seo.description}
      keywords={seo.keywords}
      canonical={`${BASE_URL}${pathname}`}
    />
  );
};

export default AppSEO;
