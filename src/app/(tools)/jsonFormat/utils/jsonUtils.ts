// 遞迴排序 JSON 物件的 Keys (A-Z)
export const sortJsonKeys = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(sortJsonKeys);
  } else if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((result: Record<string, any>, key: string) => {
        result[key] = sortJsonKeys(obj[key]);
        return result;
      }, {});
  }
  return obj;
};

// 移除 JSON 字串中的註解 (// 單行註解 與 /* 多行註解 */)
export const stripJsonComments = (jsonStr: string): string => {
  // 此 Regex 會匹配：字串 ("...")、單行註解 (//...)、多行註解 (/*...*/)
  // 若匹配到的是字串則保留，若是註解則清空
  return jsonStr.replace(
    /"(?:[^"\\]|\\.)*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match) => {
      if (match.startsWith('"')) {
        return match;
      }
      return "";
    }
  );
};

// 產生 TypeScript Interface 的簡易推導
export const generateTypeScript = (jsonStr: string): string => {
  try {
    const obj = JSON.parse(stripJsonComments(jsonStr));

    const interfaces = new Map<string, string>();

    const capitalize = (s: string) => {
      if (!s) return "AnyType";
      return s.charAt(0).toUpperCase() + s.slice(1);
    };

    const toSingular = (s: string) => {
      if (s.endsWith("ies")) return s.slice(0, -3) + "y";
      if (s.endsWith("s") && s.length > 2) return s.slice(0, -1);
      return s;
    };

    const inferInterface = (valObj: any, baseInterfaceName: string): string => {
      let interfaceName = baseInterfaceName;
      let counter = 2;

      let propertiesResult = "";
      const keys = Object.keys(valObj);
      for (const key of keys) {
        propertiesResult += `  ${key}: ${inferType(valObj[key], key)};\n`;
      }

      // Check collision
      while (interfaces.has(interfaceName)) {
        if (interfaces.get(interfaceName) === propertiesResult) {
          return interfaceName;
        }
        interfaceName = `${baseInterfaceName}${counter}`;
        counter++;
      }

      interfaces.set(interfaceName, propertiesResult);
      return interfaceName;
    };

    const inferType = (val: any, propertyName: string): string => {
      if (val === null) return "any";
      if (Array.isArray(val)) {
        if (val.length === 0) return "any[]";

        const itemTypeName = capitalize(toSingular(propertyName));

        if (
          typeof val[0] === "object" &&
          val[0] !== null &&
          !Array.isArray(val[0])
        ) {
          const actualName = inferInterface(val[0], itemTypeName);
          return `${actualName}[]`;
        }

        return `${inferType(val[0], itemTypeName)}[]`;
      }

      if (typeof val === "object") {
        const typeName = capitalize(propertyName);
        return inferInterface(val, typeName);
      }
      return typeof val;
    };

    if (Array.isArray(obj)) {
      if (
        obj.length > 0 &&
        typeof obj[0] === "object" &&
        obj[0] !== null &&
        !Array.isArray(obj[0])
      ) {
        inferInterface(obj[0], "RootItem");
        let finalStr = "";
        Array.from(interfaces.entries())
          .reverse()
          .forEach(([name, props]) => {
            finalStr += `export interface ${name} {\n${props}}\n\n`;
          });
        finalStr += `export type Root = RootItem[];\n`;
        return finalStr;
      } else {
        const typeStr = inferType(obj[0], "Root");
        return `export type Root = ${typeStr}[];\n`;
      }
    } else {
      inferInterface(obj, "Root");
      let finalStr = "";
      Array.from(interfaces.entries())
        .reverse()
        .forEach(([name, props]) => {
          finalStr += `export interface ${name} {\n${props}}\n\n`;
        });
      return finalStr.trim() + "\n";
    }
  } catch {
    throw new Error("Invalid JSON string for TypeScript generation");
  }
};
