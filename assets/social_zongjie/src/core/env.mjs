import fs from "node:fs/promises";

export function parseEnvText(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export async function loadEnvFile(filePath, baseEnv = process.env) {
  let fileEnv = {};
  try {
    fileEnv = parseEnvText(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...fileEnv, ...baseEnv };
}

