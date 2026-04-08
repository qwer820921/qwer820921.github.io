import React, { useState } from "react";
import styles from "../styles/jsonFormat.module.css";

interface JsonViewerProps {
  data: any;
}

const JsonNode = ({
  keyName,
  value,
  isLast,
  depth,
}: {
  keyName?: string;
  value: any;
  isLast: boolean;
  depth: number;
}) => {
  const [expanded, setExpanded] = useState(true);

  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object" && !isArray;
  const isIterable = isArray || isObject;
  const keys = isIterable ? Object.keys(value) : [];
  const isEmpty = keys.length === 0;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const renderValue = () => {
    if (value === null) return <span className={styles.jsonNull}>null</span>;
    if (typeof value === "boolean")
      return <span className={styles.jsonBoolean}>{value ? "true" : "false"}</span>;
    if (typeof value === "number")
      return <span className={styles.jsonNumber}>{value}</span>;
    if (typeof value === "string")
      return <span className={styles.jsonString}>&quot;{value}&quot;</span>;
    return <span>{String(value)}</span>;
  };

  if (!isIterable) {
    return (
      <div
        className={styles.jsonLine}
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {keyName !== undefined && (
          <span className={styles.jsonKey}>&quot;{keyName}&quot;</span>
        )}
        {keyName !== undefined && <span className={styles.jsonColon}>: </span>}
        {renderValue()}
        {!isLast && <span className={styles.jsonComma}>,</span>}
      </div>
    );
  }

  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <div>
      <div
        className={`${styles.jsonLine} ${
          !isEmpty ? styles.jsonLineInteractable : ""
        }`}
        style={{ paddingLeft: `${depth * 20 - (isEmpty ? 0 : 16)}px` }}
        onClick={!isEmpty ? toggle : undefined}
      >
        {!isEmpty && (
          <span
            className={`${styles.jsonToggleIcon} ${
              expanded ? styles.expanded : ""
            }`}
          >
            ▶
          </span>
        )}
        {keyName !== undefined && (
          <span className={styles.jsonKey}>&quot;{keyName}&quot;</span>
        )}
        {keyName !== undefined && <span className={styles.jsonColon}>: </span>}

        {expanded ? (
          <span>{bracketOpen}</span>
        ) : (
          <span>
            {bracketOpen}
            <span className={styles.jsonCollapsedSummary}>
              {isArray ? ` ${keys.length} items ` : ` ... `}
            </span>
            {bracketClose}
            {!isLast && <span className={styles.jsonComma}>,</span>}
          </span>
        )}
      </div>

      {expanded && !isEmpty && (
        <>
          {keys.map((k, idx) => (
            <JsonNode
              key={k}
              keyName={isArray ? undefined : k}
              value={value[k as keyof typeof value]}
              isLast={idx === keys.length - 1}
              depth={depth + 1}
            />
          ))}
          <div
            className={styles.jsonLine}
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {bracketClose}
            {!isLast && <span className={styles.jsonComma}>,</span>}
          </div>
        </>
      )}
    </div>
  );
};

export const JsonViewer: React.FC<JsonViewerProps> = ({ data }) => {
  return (
    <div
      className={`${styles.textarea} ${styles.textareaOutput} ${styles.jsonViewerContainer}`}
    >
      <JsonNode value={data} isLast={true} depth={0} />
    </div>
  );
};
