import React from "react";

const HomePage: React.FC = () => {
  return (
    <div className="home-page">
      {/* Hero Section */}
      <header className="bg-primary text-white text-center p-5">
        <div className="container">
          <h1 className="display-4">歡迎來到我們的網站</h1>
          <p className="lead">我們為您提供最優質的服務，讓您的生活更美好</p>
          <a href="#services" className="btn btn-danger btn-lg">
            了解更多
          </a>
        </div>
      </header>

      {/* Services Section */}
      <section id="services" className="py-5">
        <div className="container text-center">
          <h2>我們的服務</h2>
          <div className="row mt-4">
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">專業設計</h5>
                  <p className="card-text">
                    我們提供專業的網站設計服務，打造符合需求的獨特網站。
                  </p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">數位行銷</h5>
                  <p className="card-text">
                    有效的數位行銷方案，幫助您提升品牌曝光度。
                  </p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">品牌策劃</h5>
                  <p className="card-text">
                    全方位的品牌策劃服務，讓您的品牌更具影響力。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Preview Section */}
      <section className="bg-light py-5">
        <div className="container text-center">
          <h2>了解更多</h2>
          <p>
            我們是一群專業的網站設計師與行銷專家，致力於提供最創新、最具價值的服務。
          </p>
          <a href="/about" className="btn btn-danger">
            了解我們的故事
          </a>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
