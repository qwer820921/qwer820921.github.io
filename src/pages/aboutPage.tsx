import React from "react";

const AboutPage: React.FC = () => {
  return (
    <div className="about-page">
      {/* About Header */}
      <header className="bg-primary text-white text-center py-5">
        <div className="container">
          <h1>關於我們</h1>
          <p>
            我們是一家專注於創新與品質的公司，致力於為客戶提供最佳的數位解決方案。
          </p>
        </div>
      </header>

      {/* Company Story Section */}
      <section className="py-5">
        <div className="container text-center">
          <h2>我們的故事</h2>
          <p>
            成立於2010年，我們的公司從一家小型設計工作室發展成為業界領先的數位行銷與設計公司。我們致力於為客戶提供量身定制的數位行銷策略，並且不斷創新，推動行業發展。
          </p>
        </div>
      </section>

      {/* Our Team Section */}
      <section className="bg-light py-5">
        <div className="container text-center">
          <h2>我們的團隊</h2>
          <div className="row mt-4">
            <div className="col-md-4">
              <img
                src="img01.jpg"
                alt="團隊成員1"
                className="rounded-circle"
                style={{ width: "150px", height: "150px" }}
              />
              <h3>張經理</h3>
              <p>創意總監，負責領導設計與創意方向。</p>
            </div>
            <div className="col-md-4">
              <img
                src="img02.jpg"
                alt="團隊成員2"
                className="rounded-circle"
                style={{ width: "150px", height: "150px" }}
              />
              <h3>李經理</h3>
              <p>行銷總監，專注於數位行銷策略。</p>
            </div>
            <div className="col-md-4">
              <img
                src="img03.jpg"
                alt="團隊成員3"
                className="rounded-circle"
                style={{ width: "150px", height: "150px" }}
              />
              <h3>王工程師</h3>
              <p>技術總監，負責網站開發與系統架構設計。</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Mission Section */}
      <section className="py-5">
        <div className="container text-center">
          <h2>我們的使命</h2>
          <p>
            我們的使命是幫助客戶在數位時代中脫穎而出，提供最創新且有效的數位解決方案，實現企業目標。
          </p>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
