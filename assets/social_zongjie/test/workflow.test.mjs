import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getDefaultOutputDir } from "../src/cli.mjs";
import { parseEnvText } from "../src/core/env.mjs";
import { runWorkflow } from "../src/workflow.mjs";

test("parseEnvText handles comments, quotes, and equals signs", () => {
  assert.deepEqual(
    parseEnvText(`
      # comment
      SERVICE_URL=https://example.com/path
      SERVICE_TOKEN="a=b=c"
      EMPTY=
    `),
    {
      SERVICE_URL: "https://example.com/path",
      SERVICE_TOKEN: "a=b=c",
      EMPTY: "",
    },
  );
});

test("cli defaults Excel output to the desktop social summary folder", () => {
  assert.equal(
    getDefaultOutputDir(),
    path.join(os.homedir(), "Desktop", "社媒总结"),
  );
});

test("runWorkflow exports partial rows and continues after one platform fails", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-liked-flow-"));
  let exportedRows;
  let browserClosed = false;
  const args = {
    platform: "both",
    douyinLimit: 2,
    xhsLimit: 2,
    resume: false,
  };
  const result = await runWorkflow({
    args,
    config: {},
    outputDir: dir,
    dependencies: {
      connectSession: async () => ({
        browser: {
          close: async () => {
            browserClosed = true;
          },
        },
        context: {},
        douyinPage: {},
        xhsPage: {},
      }),
      runDouyin: async ({ stateStore }) => {
        await stateStore.append({
          platform: "douyin",
          contentId: "1",
          url: "https://www.douyin.com/video/1",
          status: "success",
        });
      },
      runXhs: async () => {
        throw new Error("小红书验证码");
      },
      buildWorkbook: (rows) => {
        exportedRows = rows;
        return {};
      },
      exportWorkbook: async (_workbook, outputPath) => outputPath,
      now: () => new Date("2026-06-25T01:02:03.000Z"),
      delay: async () => {},
    },
  });

  assert.equal(exportedRows.length, 1);
  assert.equal(browserClosed, true);
  assert.deepEqual(result.platformErrors, ["xiaohongshu: 小红书验证码"]);
  assert.match(result.outputPath, /social-liked-raw-20260625-010203\.xlsx$/);
});

test("runWorkflow uses latest Excel anchors as stop URLs in since-latest-excel mode", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-liked-flow-anchors-"));
  const calls = [];
  const args = {
    platform: "both",
    douyinLimit: 20,
    xhsLimit: 20,
    resume: false,
    mode: "since-latest-excel",
  };

  await runWorkflow({
    args,
    config: {},
    outputDir: dir,
    dependencies: {
      readLatestAnchors: async (outputDir) => ({
        sourcePath: path.join(outputDir, "previous.xlsx"),
        douyin: "https://www.douyin.com/video/old-anchor",
        xiaohongshu: "https://www.xiaohongshu.com/explore/old-anchor",
      }),
      connectSession: async () => ({
        browser: { close: async () => {} },
        context: {},
        douyinPage: {},
        xhsPage: {},
      }),
      runDouyin: async ({ limit, stopUrl }) => {
        calls.push(["douyin", limit, stopUrl]);
      },
      runXhs: async ({ limit, stopUrl }) => {
        calls.push(["xhs", limit, stopUrl]);
      },
      buildWorkbook: () => ({}),
      exportWorkbook: async (_workbook, outputPath) => outputPath,
      now: () => new Date("2026-06-25T01:02:03.000Z"),
      delay: async () => {},
    },
  });

  assert.deepEqual(calls, [
    ["douyin", "all", "https://www.douyin.com/video/old-anchor"],
    ["xhs", "all", "https://www.xiaohongshu.com/explore/old-anchor"],
  ]);
});

test("runWorkflow falls back to 10 items for platforms missing latest Excel anchors", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-liked-flow-missing-anchor-"));
  const calls = [];
  const args = {
    platform: "both",
    douyinLimit: 20,
    xhsLimit: 20,
    resume: false,
    mode: "since-latest-excel",
  };

  await runWorkflow({
    args,
    config: {},
    outputDir: dir,
    dependencies: {
      readLatestAnchors: async () => ({
        sourcePath: null,
        douyin: "https://www.douyin.com/video/old-anchor",
        xiaohongshu: null,
      }),
      connectSession: async () => ({
        browser: { close: async () => {} },
        context: {},
        douyinPage: {},
        xhsPage: {},
      }),
      runDouyin: async ({ limit, stopUrl }) => calls.push(["douyin", limit, stopUrl]),
      runXhs: async ({ limit, stopUrl }) => calls.push(["xhs", limit, stopUrl]),
      buildWorkbook: () => ({}),
      exportWorkbook: async (_workbook, outputPath) => outputPath,
      now: () => new Date("2026-06-25T01:02:03.000Z"),
      delay: async () => {},
    },
  });

  assert.deepEqual(calls, [
    ["douyin", "all", "https://www.douyin.com/video/old-anchor"],
    ["xhs", 10, null],
  ]);
});