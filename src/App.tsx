import React from "react";
// import logo from './logo.svg';
import "./App.css";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import HomePage from "./pages/homePage";
import AboutPage from "./pages/aboutPage";

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        {/* Navbar */}
        <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
          <div className="container">
            <Link className="navbar-brand" to="/">
              我的形象網站
            </Link>
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarNav"
              aria-controls="navbarNav"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="navbarNav">
              <ul className="navbar-nav ms-auto">
                <li className="nav-item">
                  <Link className="nav-link" to="/">
                    首頁
                  </Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/about">
                    關於我們
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main>
          <div className="container mt-5">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-dark text-white py-4 mt-5">
          <div className="container text-center">
            <p>&copy; 2025 我的形象網站 - 所有權利保留</p>
            <p>
              <a href="mailto:info@website.com" className="text-white">
                聯繫我們
              </a>{" "}
              |{" "}
              <a href="/privacy" className="text-white">
                隱私政策
              </a>
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
};

export default App;
