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
import projectProgressData from "./config/projectsConfig";
import { Project } from "./types/project";
import {
  Globe,
  BarChart,
  Palette,
  People,
  CodeSlash,
  Grid,
} from "react-bootstrap-icons";
import SEO from "../../components/common/seo/seo";

const carouselItems = [
  {
    src: "/img01.jpg",
    alt: "第1張圖片",
    title: "專業網站開發",
    description: "打造高效能、現代化的網站，提升您的品牌形象。",
    ctaText: "了解更多",
    ctaLink: "/about",
  },
  {
    src: "/img02.jpg",
    alt: "第2張圖片",
    title: "數位行銷解決方案",
    description: "透過數據驅動的行銷策略，吸引更多潛在客戶。",
    ctaText: "立即諮詢",
    ctaLink: "/about",
  },
  {
    src: "/img03.jpg",
    alt: "第3張圖片",
    title: "品牌設計",
    description: "打造獨特的品牌識別，脫穎而出。",
    ctaText: "開始設計",
    ctaLink: "/about",
  },
];

const accordionData = [
  {
    category: "網站開發",
    title: "網站開發",
    content:
      "我們的網站開發服務專注於提供高效能、使用者友善且具現代感的網站...",
  },
  {
    category: "行銷策劃",
    title: "行銷策劃",
    content: "我們的行銷策略幫助企業提升品牌知名度，增加客戶互動...",
  },
  {
    category: "品牌設計",
    title: "品牌設計",
    content: "我們提供專業的品牌設計服務，從品牌識別到視覺設計...",
  },
  {
    category: "用戶體驗設計",
    title: "用戶體驗設計 (UX/UI)",
    content: "我們的 UX/UI 設計專注於提升用戶體驗...",
  },
  {
    category: "數據分析",
    title: "數據分析與報告",
    content: "我們提供全面的數據分析服務，幫助企業更好地了解市場趨勢...",
  },
  {
    category: "客戶服務",
    title: "客戶服務與支持",
    content: "我們致力於提供一流的客戶服務與技術支持...",
  },
  {
    category: "網站開發",
    title: "我們的服務包含哪些？",
    content: "我們提供網站開發、行銷策劃、品牌設計等全方位服務...",
  },
  {
    category: "軟體開發",
    title: "軟體開發",
    content: "我們的軟體開發團隊專注於提供高效的企業應用和管理系統...",
  },
];

const iconMap: Record<string, JSX.Element> = {
  全部: <Grid className="me-2" size={16} />,
  網站開發: <Globe className="me-2" size={16} />,
  行銷策劃: <BarChart className="me-2" size={16} />,
  品牌設計: <Palette className="me-2" size={16} />,
  用戶體驗設計: <People className="me-2" size={16} />,
  數據分析: <BarChart className="me-2" size={16} />,
  客戶服務: <People className="me-2" size={16} />,
  軟體開發: <CodeSlash className="me-2" size={16} />,
};

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

  const categories = [
    "全部",
    ...Array.from(new Set(accordionData.map((item) => item.category))),
  ];

  const [selectedCategory, setSelectedCategory] = useState("全部");

  const filteredData =
    selectedCategory === "全部"
      ? accordionData
      : accordionData.filter((item) => item.category === selectedCategory);

  return (
    <div className="home-page">
      <>
        <SEO
          title="子yee 萬事屋｜台股即時資訊、自選股追蹤、小工具與技術服務平台"
          description="子yee 萬事屋是一個提供台股即時查詢、自選股管理、生活小工具與技術解決方案的多功能平台，讓您在投資與生活中更高效。"
          keywords="子yee 萬事屋, 台股查詢, 自選股, 技術小工具, 股票資訊平台, 技術顧問, 自動化工具"
        />
        <div
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            opacity: 0,
          }}
        >
          <h1>子yee 萬事屋 - 首頁</h1>
          <p>歡迎體驗我們的技術解決方案與服務！</p>
        </div>
      </>
      <section className="py-5">
        <Container>
          <Carousel interval={5000} pause="hover">
            {carouselItems.map((item, idx) => (
              <Carousel.Item key={idx}>
                <div className="row d-flex justify-content-center align-items-center">
                  <div className="col-sm-12 col-md-6 d-flex justify-content-center">
                    <img
                      src={item.src}
                      alt={item.alt}
                      className="img-fluid rounded"
                      style={{ maxHeight: "400px", objectFit: "cover" }}
                    />
                  </div>
                  <div
                    className="carousel-caption-container text-center p-4 col-sm-12 col-md-6 d-flex flex-column justify-content-center"
                    style={{
                      backgroundColor: "rgba(0, 0, 0, 0.7)",
                      color: "white",
                      borderRadius: "10px",
                    }}
                  >
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <Button variant="primary" href={item.ctaLink}>
                      {item.ctaText}
                    </Button>
                  </div>
                </div>
              </Carousel.Item>
            ))}
          </Carousel>
        </Container>
      </section>

      <Container className="py-5">
        <>
          <div className="mb-4 d-flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={
                  selectedCategory === cat ? "primary" : "outline-primary"
                }
                onClick={() => setSelectedCategory(cat)}
                className="d-flex align-items-center px-3 py-2 rounded-pill"
              >
                {iconMap[cat] || <Grid className="me-2" size={16} />}
                {cat}
              </Button>
            ))}
          </div>

          <Accordion alwaysOpen>
            {filteredData.map((item, idx) => (
              <Accordion.Item
                eventKey={idx.toString()}
                key={`${item.title}-${idx}`}
              >
                <Accordion.Header>{item.title}</Accordion.Header>
                <Accordion.Body>{item.content}</Accordion.Body>
              </Accordion.Item>
            ))}
          </Accordion>
        </>
      </Container>

      <Container className="py-5">
        <h2 className="mb-4">專案進度</h2>
        <Table striped bordered hover responsive>
          <thead className="table-success">
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
