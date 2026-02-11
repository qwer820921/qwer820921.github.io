"use client";
import React from "react";
import Link from "next/link";
import { Container, Row, Col } from "react-bootstrap";
import routeGroups from "@/config/routes";
import { ROUTES } from "@/constants/routes";
import type { RouteConfig, RouteGroup } from "@/types/routeConfig";
import type { BlogPost } from "@/types/blog";

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
    <Container className="py-5">
      {/* 最新文章區塊 */}
      {latestPosts.length > 0 && (
        <section className="mb-5">
          <h2 className="h3 fw-bold mb-4 border-start border-4 border-primary ps-3">
            最新文章
          </h2>

          <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
            {latestPosts.map((post) => (
              <div key={post.slug} className="col">
                <div
                  className="card h-100 border-0 shadow-sm"
                  style={{
                    transition: "transform 0.2s, box-shadow 0.2s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow =
                      "0 0.5rem 1rem rgba(0,0,0,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 0.125rem 0.25rem rgba(0,0,0,0.075)";
                  }}
                >
                  <div className="card-body d-flex flex-column p-3 p-md-4">
                    <div
                      className="text-muted small mb-1 mb-md-2"
                      style={{ fontSize: "0.85rem" }}
                    >
                      {post.date}
                    </div>
                    <Link
                      href={`${ROUTES.BLOG}/${post.slug}`}
                      className="text-decoration-none text-dark stretched-link"
                    >
                      <h3
                        className="h5 fw-bold mb-2 mb-md-3"
                        style={{ lineHeight: "1.4" }}
                      >
                        {post.title}
                      </h3>
                    </Link>
                    {post.description && (
                      <p
                        className="card-text text-muted flex-grow-1 mb-0"
                        style={{
                          fontSize: "0.9rem",
                          lineHeight: "1.6",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {post.description}
                      </p>
                    )}
                  </div>
                  {post.tags && post.tags.length > 0 && (
                    <div className="card-footer bg-transparent border-0 pt-0 pb-2 pb-md-3 px-3 px-md-4">
                      <div className="d-flex gap-2 flex-wrap">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="badge rounded-pill"
                            style={{
                              backgroundColor: "#e7f3ff",
                              color: "#0066cc",
                              fontWeight: "500",
                              fontSize: "0.75rem",
                              padding: "0.35rem 0.65rem",
                            }}
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
                className="card h-100 border-2 border-primary bg-light text-decoration-none d-flex align-items-center justify-content-center"
                style={{
                  transition: "all 0.2s",
                  borderStyle: "dashed",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f8f9fa";
                  e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#f8f9fa";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div className="text-center px-3">
                  <div
                    className="text-primary fw-bold"
                    style={{ fontSize: "1.1rem" }}
                  >
                    查看更多文章 →
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 原有的工具列表 */}
      {groupedTools.map((group) => (
        <section key={group.type} className="mb-5">
          <h2 className="h3 fw-bold mb-4 border-start border-4 border-primary ps-3">
            {group.type}
          </h2>
          <Row xs={1} sm={2} md={3} lg={4} className="g-4">
            {group.routes.map((route: RouteConfig) => (
              <Col key={route.path}>
                <div
                  className="box"
                  style={{ cursor: "pointer", margin: "0 auto" }}
                >
                  <Link
                    href={route.path}
                    className="d-flex justify-content-center align-items-center text-decoration-none text-white h-100"
                  >
                    <h3 className="fs-6 mb-0 text-center px-3">{route.name}</h3>
                  </Link>
                </div>
              </Col>
            ))}
          </Row>
        </section>
      ))}
    </Container>
  );
}
