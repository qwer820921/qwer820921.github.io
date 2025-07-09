import Head from "next/head";
import routeGroups from "@/config/routes";

const BASE_URL = "https://qwer820921.github.io";

const BreadcrumbJsonLd = () => {
  // 先展平，取得所有 routeConfig，然後篩選 showInNavbar
  const routes = routeGroups.flatMap((group) => group.routeConfig);

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
    <Head>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
    </Head>
  );
};

export default BreadcrumbJsonLd;
