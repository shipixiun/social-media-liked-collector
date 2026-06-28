#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, readConfig } from "./config.mjs";
import { loadEnvFile } from "./core/env.mjs";
import { runWorkflow } from "./workflow.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function getDefaultOutputDir() {
  return path.join(os.homedir(), "Desktop", "社媒总结");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const env = await loadEnvFile(path.join(projectRoot, ".env"));
  const config = readConfig(env, args.platform);
  const result = await runWorkflow({
    args,
    config,
    outputDir: getDefaultOutputDir(),
  });
  console.log(`Excel 已生成: ${result.outputPath}`);
  if (result.platformErrors.length) {
    console.error(`平台错误: ${result.platformErrors.join(" | ")}`);
    process.exitCode = 2;
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

