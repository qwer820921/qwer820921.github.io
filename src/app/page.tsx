"use client";
import React from "react";
import Link from "next/link";
import routeGroups from "../config/routes"; // RouteGroup[]
import { Container, Row, Col } from "react-bootstrap";
import type { RouteConfig, RouteGroup } from "../types/routeConfig";

export default function HomePage() {
  // 先把每組中要顯示的 route 篩出來（showInNavbar 且 path !== "/"）
  const groupedTools = (routeGroups as RouteGroup[])
    .map((group) => ({
      type: group.type,
      routes: group.routeConfig.filter((r) => r.showInNavbar && r.path !== "/"),
    }))
    .filter((g) => g.routes.length > 0); // 若某組全被排掉就不顯示

  return (
    <Container className="py-5">
      {groupedTools.map((group) => (
        <section key={group.type} className="mb-5">
          {/* 分類標題 */}
          <h2 className="h4 fw-bold mb-3">{group.type}</h2>

          {/* 該分類的卡片網格 */}
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
