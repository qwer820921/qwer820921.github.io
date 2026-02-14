"use client";
import React from "react";
import Link from "next/link";
import { Container, Row, Col } from "react-bootstrap";
import { ROUTES } from "@/constants/routes";
import type { BlogPost } from "@/types/blog";
import styles from "./blogPage.module.css";

interface BlogPageProps {
  posts: Omit<BlogPost, "content">[];
}

export default function BlogPage({ posts }: BlogPageProps) {
  return (
    <Container style={{ paddingTop: "70px", paddingBottom: "70px" }}>
      <h1 className={styles.pageTitle}>
        <span className={styles.titleIcon}>📝</span>
        文章列表
      </h1>

      <Row xs={1} md={2} lg={3} className="g-4">
        {posts.map((post) => (
          <Col key={post.slug}>
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
          </Col>
        ))}
      </Row>
    </Container>
  );
}
