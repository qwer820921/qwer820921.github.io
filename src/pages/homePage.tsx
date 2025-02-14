import React, { useState } from "react";
import {
  Container,
  Carousel,
  Accordion,
  Modal,
  Button,
  Table,
  Badge,
  ProgressBar,
} from "react-bootstrap";
import projectProgressData from "../config/projectsConfig";
import { Project } from "../types/project";

const HomePage: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null); //table選中的資料

  // 根據狀態來決定顯示的 Badge
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "進行中":
        return <Badge bg="success">進行中</Badge>;
      case "等待中":
        return <Badge bg="warning">等待中</Badge>;
      case "延遲":
        return <Badge bg="danger">延遲</Badge>;
      case "準備中":
        return <Badge bg="primary">準備中</Badge>;
      default:
        return <Badge bg="secondary">未知</Badge>;
    }
  };

  const handleShow = (project: Project) => {
    setSelectedProject(project);
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setSelectedProject(null);
  };

  return (
    <div className="home-page">
      {/* Carousel Section */}
      <section className="py-5">
        <Container>
          <Carousel>
            <Carousel.Item>
              <div
                className="d-flex justify-content-center align-items-center"
                style={{ height: "25vh" }}
              >
                <img
                  src="img01.jpg"
                  alt="第1張圖片"
                  style={{ height: "100%", width: "auto" }}
                />
              </div>
              <div
                className="carousel-caption-container"
                style={{
                  textAlign: "center",
                  padding: "10px",
                  backgroundColor: "rgba(0, 0, 0, 0.5)", // 可選，讓文字區域有些背景
                  color: "white",
                }}
              >
                <h3>優質服務</h3>
                <p>提供最專業的解決方案。</p>
              </div>
            </Carousel.Item>
            <Carousel.Item>
              <div
                className="d-flex justify-content-center align-items-center"
                style={{ height: "25vh" }}
              >
                <img
                  src="img02.jpg"
                  alt="第2張圖片"
                  style={{ height: "100%", width: "auto" }}
                />
              </div>
              <div
                className="carousel-caption-container"
                style={{
                  textAlign: "center",
                  padding: "10px",
                  backgroundColor: "rgba(0, 0, 0, 0.5)", // 可選，讓文字區域有些背景
                  color: "white",
                }}
              >
                <h3>優質服務</h3>
                <p>提供最專業的解決方案。</p>
              </div>
            </Carousel.Item>
            <Carousel.Item>
              <div
                className="d-flex justify-content-center align-items-center"
                style={{ height: "25vh" }}
              >
                <img
                  src="img03.jpg"
                  alt="第3張圖片"
                  style={{ height: "100%", width: "auto" }}
                />
              </div>
              <div
                className="carousel-caption-container"
                style={{
                  textAlign: "center",
                  padding: "10px",
                  backgroundColor: "rgba(0, 0, 0, 0.5)", // 可選，讓文字區域有些背景
                  color: "white",
                }}
              >
                <h3>優質服務</h3>
                <p>提供最專業的解決方案。</p>
              </div>
            </Carousel.Item>
          </Carousel>
        </Container>
      </section>

      {/* Accordion - FAQ */}
      <Container className="py-5">
        <Accordion>
          {/* Accordion Item 1 */}
          <Accordion.Item eventKey="0">
            <Accordion.Header>我們的服務包含哪些？</Accordion.Header>
            <Accordion.Body>
              我們提供網站開發、行銷策劃、品牌設計等全方位服務，幫助您在數位時代中獲得成功。
            </Accordion.Body>
          </Accordion.Item>

          {/* Accordion Item 2: 網站開發 */}
          <Accordion.Item eventKey="1">
            <Accordion.Header>網站開發</Accordion.Header>
            <Accordion.Body>
              我們的網站開發服務專注於提供高效能、使用者友善且具現代感的網站。無論是企業網站、電商平台，還是定制化應用，我們的開發團隊都能根據客戶需求提供最佳解決方案。
            </Accordion.Body>
          </Accordion.Item>

          {/* Accordion Item 3: 行銷策劃 */}
          <Accordion.Item eventKey="2">
            <Accordion.Header>行銷策劃</Accordion.Header>
            <Accordion.Body>
              我們的行銷策略幫助企業提升品牌知名度，增加客戶互動，並實現商業增長。服務包括數位行銷、社交媒體行銷、SEO
              優化等，助您擁抱未來的行銷趨勢。
            </Accordion.Body>
          </Accordion.Item>

          {/* Accordion Item 4: 品牌設計 */}
          <Accordion.Item eventKey="3">
            <Accordion.Header>品牌設計</Accordion.Header>
            <Accordion.Body>
              我們提供專業的品牌設計服務，從品牌識別到視覺設計，幫助企業創造一個強大的市場形象。設計內容包括品牌
              LOGO、企業識別系統(CI)、包裝設計等，讓您的品牌與眾不同。
            </Accordion.Body>
          </Accordion.Item>

          {/* Accordion Item 5: 軟體開發 */}
          <Accordion.Item eventKey="4">
            <Accordion.Header>軟體開發</Accordion.Header>
            <Accordion.Body>
              我們的軟體開發團隊專注於提供高效的企業應用和管理系統，幫助客戶優化業務流程並提高效率。從自訂軟體開發到系統整合，我們為各行各業提供量身定制的解決方案。
            </Accordion.Body>
          </Accordion.Item>

          {/* Accordion Item 6: 用戶體驗設計 (UX/UI) */}
          <Accordion.Item eventKey="5">
            <Accordion.Header>用戶體驗設計 (UX/UI)</Accordion.Header>
            <Accordion.Body>
              我們的 UX/UI
              設計專注於提升用戶體驗，幫助客戶打造直觀、易用的應用和網站。通過深入了解使用者需求，我們創造出具備優秀交互設計的產品，讓用戶愛不釋手。
            </Accordion.Body>
          </Accordion.Item>

          {/* Accordion Item 7: 數據分析與報告 */}
          <Accordion.Item eventKey="6">
            <Accordion.Header>數據分析與報告</Accordion.Header>
            <Accordion.Body>
              我們提供全面的數據分析服務，幫助企業更好地了解市場趨勢、用戶行為和業務表現。根據數據，我們提供可操作的見解和報告，助您制定更有效的商業決策。
            </Accordion.Body>
          </Accordion.Item>

          {/* Accordion Item 8: 客戶服務與支持 */}
          <Accordion.Item eventKey="7">
            <Accordion.Header>客戶服務與支持</Accordion.Header>
            <Accordion.Body>
              我們致力於提供一流的客戶服務與技術支持，無論是售後支援、技術問題解決，還是產品升級，我們的團隊隨時準備提供幫助，確保客戶的需求得到及時解決。
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </Container>

      {/* Table Section */}
      <Container className="py-5">
        <h2 className="mb-4">專案進度</h2>
        <Table striped bordered hover responsive>
          <thead className="bg-light">
            <tr>
              <th>#</th>
              <th>專案名稱</th>
              <th>狀態</th>
              <th>預計完成日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {projectProgressData.map((project) => (
              <tr key={project.id}>
                <td>{project.id}</td>
                <td>{project.name}</td>
                <td>{getStatusBadge(project.status)}</td>
                <td>{project.dueDate}</td>
                <td>
                  <Button
                    variant="info"
                    size="sm"
                    onClick={() => handleShow(project)}
                  >
                    查看詳細
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {/* Modal 顯示專案詳細資訊 */}
        <Modal show={showModal} onHide={handleClose} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>專案詳細資料</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedProject && (
              <div>
                <h4>{selectedProject.name}</h4>
                <p>
                  <strong>狀態：</strong>
                  {getStatusBadge(selectedProject.status)}
                </p>
                <p>
                  <strong>預計完成日期：</strong>
                  {selectedProject.dueDate}
                </p>
                <p>
                  <strong>專案描述：</strong>
                  {selectedProject.description}
                </p>
                <p>
                  <strong>負責人：</strong>
                  {selectedProject.projectManager}
                </p>
                <p>
                  <strong>預算：</strong>
                  {selectedProject.budget} 元
                </p>
                <p>
                  <strong>進度：</strong>
                  {selectedProject.progress}%
                </p>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleClose}>
              關閉
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>

      {/* Progress Section */}
      <Container>
        <h2>我們的成就</h2>
        <div className="position-relative mb-4">
          <ProgressBar
            now={70}
            variant="success"
            style={{ height: "30px" }} // 可以根據需要調整進度條的高度
          />
          <span
            className="position-absolute w-100 text-center"
            style={{
              top: "50%",
              left: 0,
              right: 0,
              transform: "translateY(-50%)",
            }}
          >
            70%
          </span>
        </div>
        <p>
          目前我們的專案進度已達
          70%，目標是下個月完成。這代表著我們正在順利推進並接近目標。
        </p>
      </Container>
    </div>
  );
};

export default HomePage;
