import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

import {
  buildResultsWorkbook,
  exportResultsWorkbook,
} from "../src/output/excel.mjs";
import { readLatestExcelAnchors } from "../src/output/history.mjs";

const rows = [
  {
    platform: "douyin",
    contentId: "7654803212939054371",
    type: "视频",
    title: "视频标题",
    author: "作者甲",
    publishedAt: "2026-06-25",
    heat: "100",
    url: "https://www.douyin.com/video/7654803212939054371",
    aiSummary: "平台 AI 总结",
    status: "success",
    error: "",
  },
  {
    platform: "douyin",
    contentId: "2",
    type: "图文",
    title: "图文标题",
    author: "作者乙",
    publishedAt: "",
    heat: "",
    url: "https://www.douyin.com/note/2",
    captionText: "图文简介",
    imageCount: 2,
    ocrTextByImage: ["图一文字", "图二文字"],
    status: "success",
    error: "",
  },
  {
    platform: "xiaohongshu",
    contentId: "abc",
    type: "链接",
    title: "小红书标题",
    author: "作者丙",
    captionText: "正文",
    url: "https://www.xiaohongshu.com/explore/abc",
    imageCount: 2,
    ocrTextByImage: ["第一页", "第二页"],
    aiSummary: "点点 AI 回答",
    status: "success",
    error: "",
  },
];

test("buildResultsWorkbook creates three sheets with clickable original links", async () => {
  const workbook = buildResultsWorkbook(rows, {
    startedAt: "2026-06-25T00:00:00.000Z",
    finishedAt: "2026-06-25T00:01:00.000Z",
    args: { platform: "both", douyinLimit: 20, xhsLimit: 20 },
    platformErrors: ["xiaohongshu: 验证码"],
  });

  const sheets = await workbook.inspect({ kind: "sheet", include: "name" });
  assert.match(sheets.ndjson, /抖音内容/);
  assert.match(sheets.ndjson, /小红书点点AI/);
  assert.match(sheets.ndjson, /运行日志/);

  const douyin = workbook.worksheets.getItem("抖音内容");
  const xhs = workbook.worksheets.getItem("小红书点点AI");
  assert.deepEqual(douyin.getRange("A1:I1").values[0], [
    "序号",
    "类型",
    "标题/文案",
    "抖音站内AI原始回答",
    "图片数量",
    "逐图OCR",
    "状态",
    "错误原因",
    "原始链接",
  ]);
  assert.equal(
    douyin.getRange("I2").values[0][0],
    "https://www.douyin.com/video/7654803212939054371",
  );
  assert.equal(douyin.getRange("I2").formulas[0][0], "");
  assert.equal(douyin.getRange("I3").values[0][0], "https://www.douyin.com/note/2");
  assert.equal(douyin.getRange("C3").values[0][0], "图文简介");
  assert.equal(douyin.getRange("E3").values[0][0], 2);
  assert.match(douyin.getRange("F3").values[0][0], /图1: 图一文字/);
  assert.deepEqual(xhs.getRange("A1:G1").values[0], [
    "序号",
    "类型",
    "标题/卡片文本",
    "点点AI原始回答",
    "状态",
    "错误原因",
    "原始链接",
  ]);
  assert.equal(xhs.getRange("D2").values[0][0], "点点 AI 回答");
  assert.equal(xhs.getRange("G2").values[0][0], "https://www.xiaohongshu.com/explore/abc");
  assert.equal(xhs.getRange("G2").formulas[0][0], "");
  const log = workbook.worksheets.getItem("运行日志");
  assert.equal(log.getRange("B2").values[0][0], "2026-06-25 00:00:00 UTC");
  assert.match(log.getRange("B13").values[0][0], /xiaohongshu: 验证码/);
});

test("buildResultsWorkbook strips XML-forbidden control characters", () => {
  const workbook = buildResultsWorkbook([], {
    startedAt: "2026-06-25T00:00:00.000Z",
    finishedAt: "2026-06-25T00:01:00.000Z",
    args: { platform: "xhs", douyinLimit: 20, xhsLimit: 20 },
    platformErrors: ["xiaohongshu: \u001b[2m超时\u001b[0m"],
  });
  const value = workbook.worksheets
    .getItem("运行日志")
    .getRange("B13").values[0][0];
  assert.equal(value, "xiaohongshu: [2m超时[0m");
});


test("readLatestExcelAnchors chooses newest workbook and reads first platform links", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-liked-history-"));
  const oldPath = path.join(dir, "social-liked-raw-20260625-000000.xlsx");
  const newPath = path.join(dir, "social-liked-raw-20260626-000000.xlsx");

  await exportResultsWorkbook(
    buildResultsWorkbook(
      [
        {
          platform: "douyin",
          contentId: "old-dy",
          type: "视频",
          title: "旧抖音",
          url: "https://www.douyin.com/video/old-dy",
          status: "success",
        },
        {
          platform: "xiaohongshu",
          contentId: "old-xhs",
          type: "链接",
          title: "旧小红书",
          url: "https://www.xiaohongshu.com/explore/old-xhs",
          status: "success",
        },
      ],
      { startedAt: "2026-06-25T00:00:00.000Z", finishedAt: "2026-06-25T00:01:00.000Z", args: {} },
    ),
    oldPath,
  );
  await exportResultsWorkbook(
    buildResultsWorkbook(rows, {
      startedAt: "2026-06-26T00:00:00.000Z",
      finishedAt: "2026-06-26T00:01:00.000Z",
      args: {},
    }),
    newPath,
  );
  await fs.utimes(oldPath, new Date("2026-06-25T00:00:00.000Z"), new Date("2026-06-25T00:00:00.000Z"));
  await fs.utimes(newPath, new Date("2026-06-26T00:00:00.000Z"), new Date("2026-06-26T00:00:00.000Z"));

  const anchors = await readLatestExcelAnchors(dir);

  assert.equal(anchors.sourcePath, newPath);
  assert.equal(anchors.douyin, "https://www.douyin.com/video/7654803212939054371");
  assert.equal(anchors.xiaohongshu, "https://www.xiaohongshu.com/explore/abc");
});

test("readLatestExcelAnchors returns null platform anchors when first links are absent", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-liked-history-empty-"));
  const outputPath = path.join(dir, "social-liked-raw-20260626-000000.xlsx");
  await exportResultsWorkbook(
    buildResultsWorkbook([], {
      startedAt: "2026-06-26T00:00:00.000Z",
      finishedAt: "2026-06-26T00:01:00.000Z",
      args: {},
    }),
    outputPath,
  );

  const anchors = await readLatestExcelAnchors(dir);

  assert.equal(anchors.sourcePath, outputPath);
  assert.equal(anchors.douyin, null);
  assert.equal(anchors.xiaohongshu, null);
});
test("exportResultsWorkbook writes a non-empty xlsx file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-liked-xlsx-"));
  const outputPath = path.join(dir, "result.xlsx");
  const workbook = buildResultsWorkbook(rows, {
    startedAt: "2026-06-25T00:00:00.000Z",
    finishedAt: "2026-06-25T00:01:00.000Z",
    args: { platform: "both", douyinLimit: 20, xhsLimit: 20 },
  });
  await exportResultsWorkbook(workbook, outputPath);
  const stat = await fs.stat(outputPath);
  assert.ok(stat.size > 1_000);
  const imported = await SpreadsheetFile.importXlsx(
    await FileBlob.load(outputPath),
  );
  const importedLink = imported.worksheets.getItem("抖音内容").getRange("I2");
  assert.equal(
    importedLink.values[0][0],
    "https://www.douyin.com/video/7654803212939054371",
  );
  assert.equal(importedLink.formulas[0][0], "");
});
