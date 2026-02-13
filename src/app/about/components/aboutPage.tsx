"use client";
import React, { useState } from "react";
import { Container } from "react-bootstrap";
import styles from "../styles/aboutPage.module.css";

const AboutPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("story");

  return (
    <div className={styles.aboutPageModern}>
      {/* Hero Profile Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroBackground}></div>
        <Container className={styles.heroContent}>
          <div className={styles.profileHeader}>
            <div className={styles.profileBadge}>
              <span className={styles.badgeIcon}>✨</span>
            </div>
            <h1 className={styles.brandName}>子yee 萬事屋</h1>
            <p className={styles.brandTagline}>創新 • 專業 • 共創未來</p>
            <p className={styles.brandDescription}>
              匯聚頂尖創意、行銷與技術人才,為您的數位夢想保駕護航
            </p>
          </div>
        </Container>
      </section>

      {/* Navigation Tabs */}
      <section className={styles.tabsSection}>
        <Container>
          <div className={styles.tabsContainer}>
            <button
              className={`${styles.tabButton} ${activeTab === "story" ? styles.active : ""}`}
              onClick={() => setActiveTab("story")}
            >
              我們的故事
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "team" ? styles.active : ""}`}
              onClick={() => setActiveTab("team")}
            >
              專業團隊
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "mission" ? styles.active : ""}`}
              onClick={() => setActiveTab("mission")}
            >
              使命願景
            </button>
          </div>
        </Container>
      </section>

      {/* Content Sections */}
      <Container className={styles.contentContainer}>
        {/* Story Section */}
        {activeTab === "story" && (
          <section className={`${styles.contentSection} ${styles.fadeIn}`}>
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <h2>我們的故事</h2>
                <span className={styles.sectionIcon}>📖</span>
              </div>
              <div className={styles.cardContent}>
                <p className={styles.introText}>
                  2024
                  年，一群對數位創新充滿熱忱的專業人士聚在一起，決定創辦「子yee
                  萬事屋」。
                </p>
                <div className={styles.storyTimeline}>
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineMarker}></div>
                    <div className={styles.timelineContent}>
                      <h4>初心</h4>
                      <p>
                        我們觀察到市場上許多企業在數位轉型時，往往面臨創意與技術脫節的困境。
                      </p>
                    </div>
                  </div>
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineMarker}></div>
                    <div className={styles.timelineContent}>
                      <h4>實踐</h4>
                      <p>
                        因此，我們建立了一個跨領域的協作平台，從小型設計工作室逐步成長。
                      </p>
                    </div>
                  </div>
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineMarker}></div>
                    <div className={styles.timelineContent}>
                      <h4>現在</h4>
                      <p>
                        如今，我們已成為全方位的數位解決方案專家，與無數企業共同成長。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Team Section */}
        {activeTab === "team" && (
          <section className={`${styles.contentSection} ${styles.fadeIn}`}>
            <div className={styles.teamGrid}>
              {/* Team Member 1 */}
              <div className={styles.teamCard}>
                <div className={styles.teamImageWrapper}>
                  <img
                    src="images/img06.jpg"
                    alt="賴皮張大師"
                    className={styles.teamImage}
                  />
                  <div className={styles.teamOverlay}>
                    <span className={styles.roleBadge}>創意總監</span>
                  </div>
                </div>
                <div className={styles.teamInfo}>
                  <h3>賴皮張大師</h3>
                  <p className={styles.roleTitle}>Creative Director</p>
                  <p className={styles.bio}>
                    擁有超過十年視覺設計經驗，擅長品牌故事敘述與跨媒介創意整合。賦予每個專案獨特的視覺靈魂。
                  </p>
                  <div className={styles.skills}>
                    <span className={styles.skillTag}>品牌設計</span>
                    <span className={styles.skillTag}>視覺策略</span>
                    <span className={styles.skillTag}>創意指導</span>
                  </div>
                </div>
              </div>

              {/* Team Member 2 */}
              <div className={styles.teamCard}>
                <div className={styles.teamImageWrapper}>
                  <img
                    src="images/img02.jpg"
                    alt="yee大師"
                    className={styles.teamImage}
                  />
                  <div className={styles.teamOverlay}>
                    <span className={styles.roleBadge}>行銷總監</span>
                  </div>
                </div>
                <div className={styles.teamInfo}>
                  <h3>yee大師</h3>
                  <p className={styles.roleTitle}>Marketing Director</p>
                  <p className={styles.bio}>
                    精通數位趨勢與數據分析，擅長制定精準的市場推廣策略。致力於將品牌影響力轉化為商業成長。
                  </p>
                  <div className={styles.skills}>
                    <span className={styles.skillTag}>數位行銷</span>
                    <span className={styles.skillTag}>數據分析</span>
                    <span className={styles.skillTag}>品牌推廣</span>
                  </div>
                </div>
              </div>

              {/* Team Member 3 */}
              <div className={styles.teamCard}>
                <div className={styles.teamImageWrapper}>
                  <img
                    src="images/img03.jpg"
                    alt="連工程師"
                    className={styles.teamImage}
                  />
                  <div className={styles.teamOverlay}>
                    <span className={styles.roleBadge}>技術總監</span>
                  </div>
                </div>
                <div className={styles.teamInfo}>
                  <h3>連工程師</h3>
                  <p className={styles.roleTitle}>Technical Director</p>
                  <p className={styles.bio}>
                    負責系統架構設計與尖端技術研發，確保所有解決方案的穩定性與擴展性。技術支柱。
                  </p>
                  <div className={styles.skills}>
                    <span className={styles.skillTag}>系統架構</span>
                    <span className={styles.skillTag}>技術研發</span>
                    <span className={styles.skillTag}>全棧開發</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Mission Section */}
        {activeTab === "mission" && (
          <section className={`${styles.contentSection} ${styles.fadeIn}`}>
            <div className={styles.missionGrid}>
              <div
                className={`${styles.missionCard} ${styles.missionCardPrimary}`}
              >
                <div className={styles.missionIcon}>🎯</div>
                <h3>我們的使命</h3>
                <p>
                  幫助客戶在數位時代中脫穎而出，提供最創新且有效的數位解決方案，實現企業目標。
                  我們相信技術應該服務於人，讓生活與商業變得更簡單、更美好。
                </p>
              </div>
              <div
                className={`${styles.missionCard} ${styles.missionCardSecondary}`}
              >
                <div className={styles.missionIcon}>🚀</div>
                <h3>我們的願景</h3>
                <p>
                  致力於成為數位解決方案領域的領導者，以卓越的技術與服務引領行業發展。
                  期待與每一位客戶共同開創無限可能的數位未來。
                </p>
              </div>
            </div>

            <div className={styles.valuesSection}>
              <h3 className={styles.valuesTitle}>核心價值觀</h3>
              <div className={styles.valuesGrid}>
                <div className={styles.valueItem}>
                  <div className={styles.valueIcon}>💡</div>
                  <h4>創新</h4>
                  <p>不斷探索新的可能性，推動行業進步</p>
                </div>
                <div className={styles.valueItem}>
                  <div className={styles.valueIcon}>🤝</div>
                  <h4>協作</h4>
                  <p>與客戶與團隊緊密合作，共創價值</p>
                </div>
                <div className={styles.valueItem}>
                  <div className={styles.valueIcon}>⭐</div>
                  <h4>卓越</h4>
                  <p>追求每一個細節的完美，不妥協品質</p>
                </div>
                <div className={styles.valueItem}>
                  <div className={styles.valueIcon}>🔒</div>
                  <h4>誠信</h4>
                  <p>以誠信為基礎，建立長期信任關係</p>
                </div>
              </div>
            </div>
          </section>
        )}
      </Container>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <Container>
          <div className={styles.ctaCard}>
            <h2>準備好開始您的數位轉型了嗎？</h2>
            <p>聯絡我們的專業團隊，讓我們為您量身打造最佳方案</p>
            <button className={styles.ctaButton}>立即聯繫我們</button>
          </div>
        </Container>
      </section>
    </div>
  );
};

export default AboutPage;
