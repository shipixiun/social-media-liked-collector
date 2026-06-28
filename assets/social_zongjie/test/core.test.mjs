import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseArgs } from "../src/config.mjs";
import {
  contentIdFromUrl,
  normalizeContentUrl,
} from "../src/core/url.mjs";
import { JsonlStateStore } from "../src/core/state-store.mjs";
import { hasStableAnswer } from "../src/core/stability.mjs";
import { candidateScanLimitForXhs } from "../src/xiaohongshu/collector.mjs";

test("normalizeContentUrl removes tracking parameters and keeps content identity", () => {
  assert.equal(
    normalizeContentUrl(
      "https://www.douyin.com/video/123?previous_page=web_code_link&foo=bar",
    ),
    "https://www.douyin.com/video/123",
  );
  assert.equal(
    normalizeContentUrl(
      "https://www.xiaohongshu.com/explore/abc?xsec_token=secret&xsec_source=pc_like",
    ),
    "https://www.xiaohongshu.com/explore/abc",
  );
});

test("contentIdFromUrl extracts video and note identifiers", () => {
  assert.equal(contentIdFromUrl("https://www.douyin.com/video/123"), "123");
  assert.equal(contentIdFromUrl("https://www.douyin.com/note/456"), "456");
  assert.equal(
    contentIdFromUrl("https://www.xiaohongshu.com/explore/abc"),
    "abc",
  );
});


test("parseArgs supports collection modes", () => {
  assert.equal(parseArgs([]).mode, "count");
  assert.equal(parseArgs(["--mode", "count"]).mode, "count");
  assert.equal(
    parseArgs(["--mode", "since-latest-excel"]).mode,
    "since-latest-excel",
  );
  assert.throws(
    () => parseArgs(["--mode", "unknown"]),
    /--mode 必须是 count 或 since-latest-excel/,
  );
});
test("JsonlStateStore resumes without duplicating the same platform item", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-liked-state-"));
  const file = path.join(dir, "state.jsonl");
  const store = new JsonlStateStore(file);

  await store.append({
    platform: "douyin",
    contentId: "123",
    url: "https://www.douyin.com/video/123",
    status: "success",
  });
  await store.append({
    platform: "douyin",
    contentId: "123",
    url: "https://www.douyin.com/video/123?foo=bar",
    status: "failed",
  });

  const rows = await store.readAll();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.equal(await store.has("douyin", "123"), true);
  assert.equal(await store.has("xiaohongshu", "123"), false);
});

test("hasStableAnswer requires repeated non-placeholder text", () => {
  assert.equal(hasStableAnswer(["生成中", "生成中", "生成中"]), false);
  assert.equal(hasStableAnswer(["问题分析中", "问题分析中", "问题分析中"]), false);
  assert.equal(hasStableAnswer(["第一版", "最终总结", "最终总结"]), true);
  assert.equal(hasStableAnswer(["", "完整总结", "完整总结"]), true);
  assert.equal(hasStableAnswer(["短", "短"]), false);
});

test("fixed XHS image-note limits scan all available candidates", () => {
  assert.equal(candidateScanLimitForXhs(20), "all");
  assert.equal(candidateScanLimitForXhs("all"), "all");
});
