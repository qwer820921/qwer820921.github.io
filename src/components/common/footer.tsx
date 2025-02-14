import React from "react";

const Footer: React.FC = () => {
  return (
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
  );
};

export default Footer;
