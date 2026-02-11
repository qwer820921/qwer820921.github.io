"use client";
import React from "react";
import Link from "next/link";
import { Container, Row, Col, Card } from "react-bootstrap";
import { ROUTES } from "@/constants/routes";
import type { BlogPost } from "@/types/blog";

interface BlogPageProps {
  posts: Omit<BlogPost, "content">[];
}

export default function BlogPage({ posts }: BlogPageProps) {
  return (
    <Container className="py-5">
      <h1 className="h2 fw-bold mb-4 border-start border-4 border-primary ps-3">
        文章列表
      </h1>

      <Row xs={1} md={2} lg={3} className="g-4">
        {posts.map((post) => (
          <Col key={post.slug}>
            <Card className="h-100 shadow-sm border-0 hover-lift transition">
              <Card.Body className="d-flex flex-column">
                <div className="text-muted small mb-2">{post.date}</div>
                <Link
                  href={`${ROUTES.BLOG}/${post.slug}`}
                  className="text-decoration-none text-dark stretched-link"
                >
                  <h2 className="h5 fw-bold mb-2">{post.title}</h2>
                </Link>
                {post.description && (
                  <Card.Text className="small text-muted flex-grow-1">
                    {post.description}
                  </Card.Text>
                )}
              </Card.Body>
              {post.tags && post.tags.length > 0 && (
                <Card.Footer className="bg-transparent border-0 pt-0">
                  <div className="d-flex gap-1 flex-wrap">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="badge bg-light text-secondary fw-normal"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </Card.Footer>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
}
