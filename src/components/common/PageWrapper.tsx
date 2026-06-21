import styles from "./PageWrapper.module.css";

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <div className={`${styles.wrapper}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
