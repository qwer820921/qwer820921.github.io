import React from "react";

export const printValue = (value: any): React.ReactElement | undefined => {
  if (process.env.NODE_ENV === "development") {
    const data = JSON.stringify(value, null, 2);
    return React.createElement("pre", null, data);
  }
};
