"use client";
import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Container, Row, Col } from "react-bootstrap";
import { ROUTES } from "@/constants/routes";
import type { BlogPost } from "@/types/blog";
import styles from "./blogPage.module.css";
import BlogSearchPanel from "./BlogSearchPanel";
import BlogNoResult from "./BlogNoResult";

interface BlogPageProps {
  posts: Omit<BlogPost, "content">[];
}

export default function BlogPage({ posts }: BlogPageProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // 蒐集所有唯一 tag（出現次數由多到少）
  const allTags = useMemo(() => {
    const tagCount: Record<string, number> = {};
    posts.forEach((post) => {
      post.tags?.forEach((tag) => {
        tagCount[tag] = (tagCount[tag] ?? 0) + 1;
      });
    });
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [posts]);

  // 過濾後的文章
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const keyword = searchText.toLowerCase().trim();
      const matchText =
        !keyword ||
        post.title.toLowerCase().includes(keyword) ||
        (post.description?.toLowerCase().includes(keyword) ?? false);

      const matchTags =
        selectedTags.length === 0 ||
        selectedTags.every((tag) => post.tags?.includes(tag));

      return matchText && matchTags;
    });
  }, [posts, searchText, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearAll = () => {
    setSearchText("");
    setSelectedTags([]);
  };

  const handleSearchChange = (value: string) => {
    setSearchText(value);
  };

  return (
    <Container style={{ paddingTop: "70px", paddingBottom: "70px" }}>
      {/* Header Row：標題 + 放大鏡 */}
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageTitle}>
          <span className={styles.titleIcon}>📝</span>
          文章列表
        </h1>

        {/* 放大鏡 + 浮動面板錨點 */}
        <div className={styles.searchAnchor}>
          <button
            className={`${styles.searchIconBtn} ${isSearchOpen || searchText || selectedTags.length > 0 ? styles.searchIconBtnActive : ""}`}
            onClick={() => setIsSearchOpen((prev) => !prev)}
            aria-label="搜尋文章"
            aria-expanded={isSearchOpen}
          >
            🔍
          </button>

          <BlogSearchPanel
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            searchText={searchText}
            onSearchChange={handleSearchChange}
            allTags={allTags}
            selectedTags={selectedTags}
            onTagToggle={toggleTag}
            onClearAll={clearAll}
            totalCount={posts.length}
            filteredCount={filteredPosts.length}
          />
        </div>
      </div>

      {/* 文章列表 */}
      {filteredPosts.length === 0 ? (
        <BlogNoResult searchText={searchText} selectedTags={selectedTags} />
      ) : (
        <Row xs={1} md={2} lg={3} className="g-4">
          {filteredPosts.map((post) => (
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
      )}
    </Container>
  );
}
