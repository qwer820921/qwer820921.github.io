import React from "react";
// import logo from './logo.svg';
import "./App.css";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Navbar from "./components/common/navbar";
import Footer from "./components/common/footer";
import routes from "./config/routes";
import ErrorBoundary from "./components/common/errorBoundary";
import BreadcrumbJsonLd from "./components/common/seo/breadcrumbJsonLd";
import "react-datepicker/dist/react-datepicker.css";
import AppSEO from "./components/common/seo/appSEO";

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        <AppSEO />
        {/* Navbar */}
        <Navbar />

        {/* 結構化資料 - Breadcrumb */}
        <BreadcrumbJsonLd />

        {/* Main Content */}
        <main>
          <div className="container-fluid mt-5">
            <ErrorBoundary>
              <Routes>
                {routes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<route.component />}
                  />
                ))}
              </Routes>
            </ErrorBoundary>
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </Router>
  );
};

export default App;
