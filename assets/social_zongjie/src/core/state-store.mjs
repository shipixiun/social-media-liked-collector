import fs from "node:fs/promises";
import path from "node:path";

function keyOf(row) {
  return `${row.platform}:${row.contentId}`;
}

export class JsonlStateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async readAll() {
    let text = "";
    try {
      text = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const byKey = new Map();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      byKey.set(keyOf(row), row);
    }
    return [...byKey.values()];
  }

  async append(row) {
    const rows = await this.readAll();
    const byKey = new Map(rows.map((item) => [keyOf(item), item]));
    byKey.set(keyOf(row), row);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const text = [...byKey.values()]
      .map((item) => JSON.stringify(item))
      .join("\n");
    await fs.writeFile(this.filePath, `${text}\n`, "utf8");
  }

  async has(platform, contentId) {
    const rows = await this.readAll();
    return rows.some(
      (row) => row.platform === platform && row.contentId === contentId,
    );
  }
}

