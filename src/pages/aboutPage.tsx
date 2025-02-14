import React, { useState, useEffect } from "react";
import { Container, Spinner, OverlayTrigger, Tooltip } from "react-bootstrap";

const AboutPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 模擬半秒鐘的加載延遲
    setTimeout(() => {
      setIsLoading(false); // 半秒後停止顯示 spinner
    }, 500);
  }, []);

  if (isLoading) {
    return (
      <Container className="text-center py-3">
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  return (
    <div className="about-page">
      {/* Card: About Header with Tooltip */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="card shadow-lg bg-info-subtle text-info-emphasis">
            <div className="card-body text-center">
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip id="tooltip-about">
                    我們是專業的數位解決方案公司
                  </Tooltip>
                }
              >
                <h2 className="card-title mb-4">關於我們</h2>
              </OverlayTrigger>
              <p className="lead card-text">
                我們是一家專注於創新與品質的公司，致力於為客戶提供最佳的數位解決方案。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Card: Company Story Section with Popover */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="card shadow-lg">
            <div className="card-body text-center">
              <h2 className="card-title mb-4">我們的故事</h2>
              <p className="card-text lead">
                成立於2010年，我們的公司從一家小型設計工作室發展成為業界領先的數位行銷與設計公司。我們致力於為客戶提供量身定制的數位行銷策略，並且不斷創新，推動行業發展。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Card: Our Team Section */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="card shadow-lg">
            <div className="card-body text-center">
              <h2 className="card-title mb-4">我們的團隊</h2>
              <div className="row justify-content-center">
                <div className="col-md-4 mb-4">
                  <img
                    src="img06.jpg"
                    alt="團隊成員1"
                    className="rounded-circle shadow-lg"
                    style={{ width: "150px", height: "150px" }}
                  />
                  <h3 className="mt-3">賴皮張大師</h3>
                  <p className="text-muted">
                    創意總監，負責領導設計與創意方向。
                  </p>
                </div>
                <div className="col-md-4 mb-4">
                  <img
                    src="img02.jpg"
                    alt="團隊成員2"
                    className="rounded-circle shadow-lg"
                    style={{ width: "150px", height: "150px" }}
                  />
                  <h3 className="mt-3">yee大師</h3>
                  <p className="text-muted">行銷總監，專注於數位行銷策略。</p>
                </div>
                <div className="col-md-4 mb-4">
                  <img
                    src="img03.jpg"
                    alt="團隊成員3"
                    className="rounded-circle shadow-lg"
                    style={{ width: "150px", height: "150px" }}
                  />
                  <h3 className="mt-3">連工程師</h3>
                  <p className="text-muted">
                    技術總監，負責網站開發與系統架構設計。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Card: Our Mission Section */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="card shadow-lg">
            <div className="card-body text-center">
              <h2 className="card-title mb-4">我們的使命</h2>
              <p className="card-text lead">
                我們的使命是幫助客戶在數位時代中脫穎而出，提供最創新且有效的數位解決方案，實現企業目標。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
