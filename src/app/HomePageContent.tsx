"use client";
import React from "react";
import Link from "next/link";
import { Container, Row, Col } from "react-bootstrap";
import routeGroups from "@/config/routes";
import { ROUTES } from "@/constants/routes";
import type { RouteConfig, RouteGroup } from "@/types/routeConfig";
import type { BlogPost } from "@/types/blog";
import styles from "./HomePageContent.module.css";

interface HomePageContentProps {
  latestPosts: Omit<BlogPost, "content">[];
}

export default function HomePageContent({ latestPosts }: HomePageContentProps) {
  // 先把每組中要顯示的 route 篩出來（showInNavbar 且 path !== "/"）
  const groupedTools = (routeGroups as RouteGroup[])
    .map((group) => ({
      type: group.type,
      routes: group.routeConfig.filter((r) => r.showInNavbar && r.path !== "/"),
    }))
    .filter((g) => g.routes.length > 0);

  return (
    <div className={styles.homeContainer}>
      {/* Hero Banner */}
      <section className={styles.heroBanner}>
        <div className={styles.heroBackground}></div>
        <Container className={styles.heroContent}>
          <div className={styles.heroIcon}>✨</div>
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
                <span className={styles.sectionIcon}>📝</span>
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
                <span className={styles.sectionIcon}>🛠️</span>
                {group.type}
              </h2>
              <Row
                xs={1}
                sm={2}
                md={3}
                lg={4}
                className={`g-4 ${styles.toolsGrid}`}
              >
                {group.routes.map((route: RouteConfig) => (
                  <Col key={route.path}>
                    <div className={`box ${styles.toolBox}`}>
                      <Link
                        href={route.path}
                        className={`d-flex justify-content-center align-items-center text-decoration-none text-white h-100 ${styles.toolLink}`}
                      >
                        <h3 className="fs-6 mb-0 text-center px-3">
                          {route.name}
                        </h3>
                      </Link>
                    </div>
                  </Col>
                ))}
              </Row>
            </section>
          ))}
        </Container>
      </div>
    </div>
  );
}
