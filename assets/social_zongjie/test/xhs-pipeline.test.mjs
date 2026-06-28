import assert from "node:assert/strict";
import test from "node:test";

import {
  ocrImage,
  recognizeImageText,
} from "../src/xiaohongshu/ocr.mjs";

test("ocrImage retries with preprocessing when the first result is weak", async () => {
  const calls = [];
  const result = await ocrImage(
    "original.webp",
    { tesseractPath: "tesseract", tessdataPrefix: "tessdata" },
    {
      run: async (imagePath) => {
        calls.push(["run", imagePath]);
        return imagePath.includes("enhanced")
          ? "增强后识别出的完整中文内容"
          : "??";
      },
      preprocess: async (_input, output) => {
        calls.push(["preprocess", output]);
      },
      enhancedPath: "enhanced.png",
    },
  );
  assert.equal(result.text, "增强后识别出的完整中文内容");
  assert.equal(result.retried, true);
  assert.deepEqual(calls, [
    ["run", "original.webp"],
    ["preprocess", "enhanced.png"],
    ["run", "enhanced.png"],
  ]);
});

test("ocrImage stops a recognition stage after the configured timeout", async () => {
  await assert.rejects(
    ocrImage(
      "stuck.webp",
      {
        tesseractPath: "tesseract",
        tessdataPrefix: "tessdata",
        ocrTimeoutMs: 20,
      },
      {
        run: async () => new Promise(() => {}),
      },
    ),
    /OCR识别超时/,
  );
});

test("recognizeImageText converts one timed-out image to a placeholder", async () => {
  const text = await recognizeImageText(
    "stuck.webp",
    { ocrTimeoutMs: 20 },
    {
      ocr: async () => new Promise(() => {}),
    },
  );
  assert.equal(text, "[OCR识别超时]");
});
