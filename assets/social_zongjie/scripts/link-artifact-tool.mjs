import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function findArtifactTool(candidates, access = fs.access) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known Codex runtime location.
    }
  }
  throw new Error(
    "未找到 Codex 工作区的 @oai/artifact-tool；请在 Codex 桌面环境中运行 npm install。",
  );
}

export async function linkArtifactTool(projectRoot) {
  const target = await findArtifactTool([
    path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules",
      "@oai",
      "artifact-tool",
    ),
  ]);
  const scopeDir = path.join(projectRoot, "node_modules", "@oai");
  const linkPath = path.join(scopeDir, "artifact-tool");
  await fs.mkdir(scopeDir, { recursive: true });
  try {
    const existing = await fs.realpath(linkPath);
    if (path.resolve(existing) === path.resolve(target)) return linkPath;
    await fs.rm(linkPath, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      await fs.rm(linkPath, { recursive: true, force: true });
    }
  }
  await fs.symlink(target, linkPath, "junction");
  return linkPath;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  const projectRoot = path.resolve(path.dirname(currentFile), "..");
  linkArtifactTool(projectRoot)
    .then((linkPath) => console.log(`已连接 Excel 运行库: ${linkPath}`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

