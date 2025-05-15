import React from "react";
import { useLocation } from "react-router-dom";
import SEO from "./seo";
import { seoMap } from "../../../constants/seoMap";

const AppSEO: React.FC = () => {
  const location = useLocation();
  const path = location.pathname;
  const seo = seoMap[path];

  if (!seo) return null;

  return (
    <SEO
      title={seo.title}
      description={seo.description}
      keywords={seo.keywords}
      canonical={`https://qwer820921.github.io${path}`}
    />
  );
};

export default AppSEO;
