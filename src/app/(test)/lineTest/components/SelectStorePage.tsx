"use client";
import React, { useEffect } from "react";
import { Container, Card, Col, Row, Spinner } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { fetchStores } from "../services/bookingService";

const SelectStorePage: React.FC = () => {
  const { stores, loading, setStores, setLoading, selectStore } =
    useBookingEngineStore();

  useEffect(() => {
    setLoading(true);
    fetchStores()
      .then(setStores)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container className="py-4" style={{ maxWidth: 560 }}>
      <h5 className="fw-bold mb-4">選擇服務據點</h5>

      {loading ? (
        <div className="text-center py-5">
          <Spinner variant="success" />
        </div>
      ) : (
        <Row className="g-3">
          {stores.map((store) => (
            <Col xs={12} key={store.storeId}>
              <Card
                className="shadow-sm"
                style={{ cursor: "pointer" }}
                onClick={() => selectStore(store)}
              >
                <Card.Body>
                  <div className="fw-semibold mb-1">{store.name}</div>
                  <small className="text-muted d-block">{store.address}</small>
                  <small className="text-muted">{store.phone}</small>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Container>
  );
};

export default SelectStorePage;
