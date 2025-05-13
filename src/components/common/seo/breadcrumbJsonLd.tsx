import React from "react";
import { Helmet } from "react-helmet";
import routes from "../../../config/routes";

const BASE_URL = "https://qwer820921.github.io";

const BreadcrumbJsonLd = () => {
  // 篩選出 showInNavbar 為 true 的路由
  const breadcrumbItems = routes
    .filter((route) => route.showInNavbar)
    .map((route, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: route.name,
      item: `${BASE_URL}${route.path === "/" ? "" : route.path}`,
    }));

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
    </Helmet>
  );
};

export default BreadcrumbJsonLd;
