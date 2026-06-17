"use client";
import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import styles from "../styles/monsterTide.module.css";

const MonsterTidePage: React.FC = () => {
  return (
    <Container className={styles.container}>
      <Row>
        <Col xs={12}>
          <h1 className="mb-4">怪物洪流</h1>
          <p>頁面內容開發中...</p>
        </Col>
      </Row>
    </Container>
  );
};

export default MonsterTidePage;
