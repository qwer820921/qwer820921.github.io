"use client";
import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Container, Row, Col } from "react-bootstrap";
import routeGroups from "@/config/routes";
import { ROUTES } from "@/constants/routes";
import type { RouteConfig, RouteGroup } from "@/types/routeConfig";
import type { BlogPost } from "@/types/blog";
import styles from "./HomePageContent.module.css";

interface HomePageContentProps {
  latestPosts: Omit<BlogPost, "content">[];
}

const ToolCard = ({ route }: { route: RouteConfig }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imagePath = `/images/cover${route.path}.webp`;

  return (
    <Col>
      <div className={styles.toolBox}>
        <Link
          href={route.path}
          className={`text-decoration-none text-white h-100 w-100 ${styles.toolLink}`}
        >
          {/* 預設顯示 Fallback，如果載入成功就淡出 */}
          <div
            className={styles.toolFallback}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              opacity: isLoaded && !hasError ? 0 : 1,
              transition: "opacity 0.3s ease-in-out",
              zIndex: 1,
            }}
          >
            <h3 className={styles.toolTitle}>{route.name}</h3>
          </div>

          {/* 如果沒有錯誤，就渲染圖片。載入完成後淡入 */}
          {!hasError && (
            <div
              className={styles.toolImageWrapper}
              style={{
                opacity: isLoaded ? 1 : 0,
                transition: "opacity 0.3s ease-in-out",
                zIndex: 2,
              }}
            >
              <Image
                src={imagePath}
                alt={route.name}
                fill
                className={styles.toolImage}
                onLoad={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority={
                  route.path === ROUTES.ABOUT || route.path === ROUTES.BLOG
                }
              />
              <div className={styles.toolImageHoverOverlay} />
            </div>
          )}
        </Link>
      </div>
    </Col>
  );
};

export default function HomePageContent({ latestPosts }: HomePageContentProps) {
  // 先把每組中要顯示的 route 篩出來（showInNavbar 且 path !== "/"）
  const groupedTools = (routeGroups as RouteGroup[])
    .map((group) => ({
      type: group.type,
      icon: group.icon,
      routes: group.routeConfig.filter((r) => r.showInNavbar && r.path !== "/"),
    }))
    .filter((g) => g.routes.length > 0);

  return (
    <div className={styles.homeContainer}>
      {/* Hero Banner */}
      <section className={styles.heroBanner}>
        <div className={styles.heroBackground}></div>
        <Container className={styles.heroContent}>
          <div className={styles.heroIcon}></div>
          <h1 className={styles.heroTitle}>子yee 萬事屋</h1>
          <p className={styles.heroSubtitle}>探索我們的工具與最新文章</p>
        </Container>
      </section>

      {/* 內容區域 - 毛玻璃效果 */}
      <div className={styles.contentArea}>
        <Container className="py-4">
          {/* 最新文章區塊 */}
          {latestPosts.length > 0 && (
            <section className={styles.contentSection}>
              <h2 className={styles.sectionTitle}>
                <Image
                  src="/images/icon/edit_icon.webp"
                  alt="最新文章"
                  width={32}
                  height={32}
                  className={styles.sectionIcon}
                />
                最新文章
              </h2>

              <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
                {latestPosts.map((post) => (
                  <div key={post.slug} className="col">
                    <div className={`card h-100 ${styles.postCard}`}>
                      <div className={`card-body ${styles.postCardBody}`}>
                        <div className={styles.postDate}>{post.date}</div>
                        <Link
                          href={`${ROUTES.BLOG}/${post.slug}`}
                          className="text-decoration-none text-dark stretched-link"
                        >
                          <h3 className={`h5 fw-bold ${styles.postTitle}`}>
                            {post.title}
                          </h3>
                        </Link>
                        {post.description && (
                          <p
                            className={`card-text text-muted ${styles.postDescription}`}
                          >
                            {post.description}
                          </p>
                        )}
                      </div>
                      {post.tags && post.tags.length > 0 && (
                        <div className={`card-footer ${styles.postFooter}`}>
                          <div className={styles.tagContainer}>
                            {post.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className={`badge rounded-pill ${styles.tag}`}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* 查看更多按鈕作為第四個卡片 */}
                <div className="col">
                  <Link
                    href={ROUTES.BLOG}
                    className={`card h-100 border-2 border-primary text-decoration-none d-flex align-items-center justify-content-center ${styles.moreCard}`}
                  >
                    <div className={styles.moreCardContent}>
                      <div className={styles.moreCardText}>查看更多文章 →</div>
                    </div>
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 原有的工具列表 */}
          {groupedTools.map((group) => (
            <section key={group.type} className={styles.contentSection}>
              <h2 className={styles.sectionTitle}>
                <Image
                  src={group.icon || "/images/icon/tools_icon.webp"}
                  alt={group.type}
                  width={32}
                  height={32}
                  className={styles.sectionIcon}
                />
                {group.type}
              </h2>
              <Row
                xs={2}
                sm={2}
                md={3}
                lg={4}
                className={`g-4 ${styles.toolsGrid}`}
              >
                {group.routes.map((route: RouteConfig) => (
                  <ToolCard key={route.path} route={route} />
                ))}
              </Row>
            </section>
          ))}
        </Container>
      </div>
    </div>
  );
}
