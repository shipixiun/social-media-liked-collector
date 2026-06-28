import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupTemporaryDirectory,
  processDouyinContent,
  processDouyinNoteData,
} from "../src/douyin/collector.mjs";

test("processDouyinContent routes videos to contextual AI", async () => {
  let aiCalls = 0;
  let noteCalls = 0;
  const result = await processDouyinContent(
    { type: "视频", title: "视频标题" },
    {
      requestAi: async () => {
        aiCalls += 1;
        return "视频 AI 总结";
      },
      processNote: async () => {
        noteCalls += 1;
        return {};
      },
    },
  );
  assert.equal(aiCalls, 1);
  assert.equal(noteCalls, 0);
  assert.equal(result.aiSummary, "视频 AI 总结");
});

test("processDouyinContent routes notes to OCR and never calls contextual AI", async () => {
  let aiCalls = 0;
  let noteCalls = 0;
  const result = await processDouyinContent(
    { type: "图文", title: "图文标题" },
    {
      requestAi: async () => {
        aiCalls += 1;
        return "不应调用";
      },
      processNote: async () => {
        noteCalls += 1;
        return {
          captionText: "简介",
          imageCount: 1,
          ocrTextByImage: ["图片文字"],
        };
      },
    },
  );
  assert.equal(aiCalls, 0);
  assert.equal(noteCalls, 1);
  assert.equal(result.captionText, "简介");
  assert.deepEqual(result.ocrTextByImage, ["图片文字"]);
});

test("processDouyinNoteData returns only source caption and local OCR text", async () => {
  const processed = await processDouyinNoteData(
    {
      title: "图文标题",
      captionText: "图文简介",
      imageUrls: ["https://example.com/1.webp", "https://example.com/2.webp"],
    },
    {
      processImage: async (_url, index) => `第${index + 1}张图片文字`,
    },
  );
  assert.equal(processed.imageCount, 2);
  assert.deepEqual(processed.ocrTextByImage, [
    "第1张图片文字",
    "第2张图片文字",
  ]);
  assert.equal("detailedSummary" in processed, false);
  assert.equal("uncertain" in processed, false);
});

test("cleanupTemporaryDirectory does not fail content collection when Windows keeps OCR files locked", async () => {
  let attempts = 0;
  await cleanupTemporaryDirectory("temp-dir", {
    remove: async () => {
      attempts += 1;
      const error = new Error("resource busy or locked");
      error.code = "EBUSY";
      throw error;
    },
    wait: async () => {},
    maxAttempts: 2,
    warn: () => {},
  });
  assert.equal(attempts, 2);
});