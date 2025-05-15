import Head from "next/head";
import routes from "@/config/routes";

const BASE_URL = "https://qwer820921.github.io";

const BreadcrumbJsonLd = () => {
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
