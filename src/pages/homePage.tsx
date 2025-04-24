import React, { JSX, useState } from "react";
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

const carouselItems = [
  { src: "/img01.jpg", alt: "第1張圖片" },
  { src: "/img02.jpg", alt: "第2張圖片" },
  { src: "/img03.jpg", alt: "第3張圖片" },
];

const accordionData = [
  {
    title: "我們的服務包含哪些？",
    content:
      "我們提供網站開發、行銷策劃、品牌設計等全方位服務，幫助您在數位時代中獲得成功。",
  },
  {
    title: "網站開發",
    content:
      "我們的網站開發服務專注於提供高效能、使用者友善且具現代感的網站...",
  },
  {
    title: "行銷策劃",
    content: "我們的行銷策略幫助企業提升品牌知名度，增加客戶互動...",
  },
  {
    title: "品牌設計",
    content: "我們提供專業的品牌設計服務，從品牌識別到視覺設計...",
  },
  {
    title: "軟體開發",
    content: "我們的軟體開發團隊專注於提供高效的企業應用和管理系統...",
  },
  {
    title: "用戶體驗設計 (UX/UI)",
    content: "我們的 UX/UI 設計專注於提升用戶體驗...",
  },
  {
    title: "數據分析與報告",
    content: "我們提供全面的數據分析服務，幫助企業更好地了解市場趨勢...",
  },
  {
    title: "客戶服務與支持",
    content: "我們致力於提供一流的客戶服務與技術支持...",
  },
];

const getStatusBadge = (status?: string) => {
  const badgeMap: Record<string, JSX.Element> = {
    進行中: <Badge bg="success">進行中</Badge>,
    等待中: <Badge bg="warning">等待中</Badge>,
    延遲: <Badge bg="danger">延遲</Badge>,
    準備中: <Badge bg="primary">準備中</Badge>,
  };
  return badgeMap[status ?? ""] || <Badge bg="secondary">未知</Badge>;
};

const ProjectDetailModal: React.FC<{
  show: boolean;
  project: Project | null;
  onClose: () => void;
}> = ({ show, project, onClose }) => (
  <Modal show={show} onHide={onClose} size="lg">
    <Modal.Header closeButton>
      <Modal.Title>專案詳細資料</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      {project && (
        <>
          <h4>{project.name}</h4>
          <p>
            <strong>狀態：</strong>
            {getStatusBadge(project.status)}
          </p>
          <p>
            <strong>預計完成日期：</strong>
            {project.dueDate}
          </p>
          <p>
            <strong>專案描述：</strong>
            {project.description}
          </p>
          <p>
            <strong>負責人：</strong>
            {project.projectManager}
          </p>
          <p>
            <strong>預算：</strong>
            {project.budget} 元
          </p>
          <p>
            <strong>進度：</strong>
            {project.progress}%
          </p>
        </>
      )}
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" onClick={onClose}>
        關閉
      </Button>
    </Modal.Footer>
  </Modal>
);

const HomePage: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

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
      <section className="py-5">
        <Container>
          <Carousel>
            {carouselItems.map((item, idx) => (
              <Carousel.Item key={idx}>
                <div
                  className="d-flex justify-content-center align-items-center"
                  style={{ height: "25vh" }}
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    style={{ height: "100%", width: "auto" }}
                  />
                </div>
                <div
                  className="carousel-caption-container"
                  style={{
                    textAlign: "center",
                    padding: "10px",
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    color: "white",
                  }}
                >
                  <h3>優質服務</h3>
                  <p>提供最專業的解決方案。</p>
                </div>
              </Carousel.Item>
            ))}
          </Carousel>
        </Container>
      </section>

      <Container className="py-5">
        <Accordion>
          {accordionData.map((item, idx) => (
            <Accordion.Item eventKey={idx.toString()} key={idx}>
              <Accordion.Header>{item.title}</Accordion.Header>
              <Accordion.Body>{item.content}</Accordion.Body>
            </Accordion.Item>
          ))}
        </Accordion>
      </Container>

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

        <ProjectDetailModal
          show={showModal}
          project={selectedProject}
          onClose={handleClose}
        />
      </Container>

      <Container>
        <h2>我們的成就</h2>
        <div className="position-relative mb-4">
          <ProgressBar now={70} variant="success" style={{ height: "30px" }} />
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
