import fs from "node:fs/promises";
import path from "node:path";

import { connectEdgeSession } from "./browser/session.mjs";
import { JsonlStateStore } from "./core/state-store.mjs";
import { runDouyinCollector } from "./douyin/collector.mjs";
import {
  buildResultsWorkbook,
  exportResultsWorkbook,
} from "./output/excel.mjs";
import { readLatestExcelAnchors } from "./output/history.mjs";
import { runXhsCollector } from "./xiaohongshu/collector.mjs";

function timestamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
}

async function randomDelay() {
  const milliseconds = 800 + Math.floor(Math.random() * 1_001);
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runWorkflow({
  args,
  config,
  outputDir,
  dependencies = {},
}) {
  const connectSession =
    dependencies.connectSession ??
    (() => connectEdgeSession(config.edgeDebugUrl));
  const runDouyin = dependencies.runDouyin ?? runDouyinCollector;
  const runXhs = dependencies.runXhs ?? runXhsCollector;
  const buildWorkbook = dependencies.buildWorkbook ?? buildResultsWorkbook;
  const exportWorkbook =
    dependencies.exportWorkbook ?? exportResultsWorkbook;
  const now = dependencies.now ?? (() => new Date());
  const delay = dependencies.delay ?? randomDelay;
  const readLatestAnchors = dependencies.readLatestAnchors ?? readLatestExcelAnchors;

  await fs.mkdir(outputDir, { recursive: true });
  const statePath = path.join(outputDir, "state.jsonl");
  if (!args.resume) await fs.rm(statePath, { force: true });
  const stateStore = new JsonlStateStore(statePath);
  const anchors = args.mode === "since-latest-excel"
    ? await readLatestAnchors(outputDir)
    : { sourcePath: null, douyin: null, xiaohongshu: null };
  const platformRunOptions = {
    douyin: anchors.douyin
      ? { limit: "all", stopUrl: anchors.douyin }
      : { limit: args.mode === "since-latest-excel" ? 10 : args.douyinLimit, stopUrl: null },
    xiaohongshu: anchors.xiaohongshu
      ? { limit: "all", stopUrl: anchors.xiaohongshu }
      : { limit: args.mode === "since-latest-excel" ? 10 : args.xhsLimit, stopUrl: null },
  };
  const startedAt = now();
  const session = await connectSession();
  const platformErrors = [];
  try {
    if (args.platform === "douyin" || args.platform === "both") {
      try {
        await runDouyin({
          context: session.context,
          listPage: session.douyinPage,
          limit: platformRunOptions.douyin.limit,
          stopUrl: platformRunOptions.douyin.stopUrl,
          stateStore,
          resume: args.resume,
          config,
          delay,
        });
      } catch (error) {
        platformErrors.push(`douyin: ${error.message}`);
      }
    }

    if (args.platform === "xhs" || args.platform === "both") {
      try {
        await runXhs({
          context: session.context,
          listPage: session.xhsPage,
          limit: platformRunOptions.xiaohongshu.limit,
          stopUrl: platformRunOptions.xiaohongshu.stopUrl,
          stateStore,
          resume: args.resume,
          config,
          delay,
        });
      } catch (error) {
        platformErrors.push(`xiaohongshu: ${error.message}`);
      }
    }

    const finishedAt = now();
    const rows = await stateStore.readAll();
    const workbook = buildWorkbook(rows, {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      args,
      anchors,
      platformErrors,
    });
    const outputPath = path.join(
      outputDir,
      `social-liked-raw-${timestamp(finishedAt)}.xlsx`,
    );
    await exportWorkbook(workbook, outputPath);
    return { outputPath, statePath, rows, platformErrors };
  } finally {
    await session.browser?.close();
  }
}
