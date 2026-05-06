"use client";
import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import styles from "../styles/bookingEngine.module.css";

const BookingEnginePage: React.FC = () => {
  return (
    <Container className={styles.container}>
      <Row>
        <Col xs={12}>
          <h1 className="mb-4">即時預約測試</h1>
          <p>頁面內容開發中...</p>
        </Col>
      </Row>
    </Container>
  );
};

export default BookingEnginePage;
