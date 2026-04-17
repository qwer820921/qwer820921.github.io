import GameInitializer from "./components/GameInitializer";
import styles from "./styles/shenmaSanguo.module.css";

export default function ShenmaSanguoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.gameBody}>
      <GameInitializer />
      {children}
    </div>
  );
}
