"use client";
import React, { useEffect } from "react";
import { Container, Card, Col, Row, Spinner } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { fetchBeauticians } from "../services/bookingService";

const SelectBeauticianPage: React.FC = () => {
  const {
    beauticians, loading, setBeauticians, setLoading,
    selectBeautician, selectedService, selectedStore,
  } = useBookingEngineStore();

  useEffect(() => {
    if (!selectedStore || !selectedService) return;
    setLoading(true);
    fetchBeauticians(selectedStore.storeId, selectedService.serviceId)
      .then(setBeauticians)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container className="py-4" style={{ maxWidth: 560 }}>
      <h5 className="fw-bold mb-4">選擇美容師</h5>

      {loading ? (
        <div className="text-center py-5">
          <Spinner variant="success" />
        </div>
      ) : (
        <Row className="g-3">
          {beauticians.map((b) => (
            <Col xs={12} key={b.beauticianId}>
              <Card
                className="shadow-sm"
                style={{ cursor: "pointer" }}
                onClick={() => selectBeautician(b)}
              >
                <Card.Body>
                  <div className="fw-semibold mb-1">{b.name}</div>
                  <small className="text-muted">{b.bio}</small>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Container>
  );
};

export default SelectBeauticianPage;
