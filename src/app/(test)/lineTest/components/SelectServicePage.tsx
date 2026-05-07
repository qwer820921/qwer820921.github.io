"use client";
import React from "react";
import { Container, Card, Col, Row, Spinner } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";

const SelectServicePage: React.FC = () => {
  const { services, loading, selectService } = useBookingEngineStore();

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner variant="success" />
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 560 }}>
      <h5 className="fw-bold mb-4">選擇療程</h5>
      <Row className="g-3">
        {services.map((s) => (
          <Col xs={12} key={s.serviceId}>
            <Card
              className="shadow-sm"
              style={{ cursor: "pointer" }}
              onClick={() => selectService(s)}
            >
              <Card.Body className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold">{s.name}</div>
                  <small className="text-muted">{s.description}</small>
                </div>
                <div className="text-end ms-3 flex-shrink-0">
                  <div className="text-success fw-bold">
                    NT$ {s.price.toLocaleString()}
                  </div>
                  <small className="text-muted">{s.duration} 分鐘</small>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default SelectServicePage;
