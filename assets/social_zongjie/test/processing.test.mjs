import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs, readConfig } from "../src/config.mjs";
import {
  cleanOcrText,
  isLikelyContentImage,
} from "../src/xiaohongshu/image-processing.mjs";

test("parseArgs applies defaults and accepts xhs all", () => {
  assert.deepEqual(parseArgs([]), {
    platform: "both",
    douyinLimit: 20,
    xhsLimit: 20,
    resume: false,
    mode: "count",
  });
  assert.deepEqual(
    parseArgs([
      "--platform",
      "xhs",
      "--douyin-limit",
      "3",
      "--xhs-limit",
      "all",
      "--resume",
    ]),
    {
      platform: "xhs",
      douyinLimit: 3,
      xhsLimit: "all",
      resume: true,
      mode: "count",
    },
  );
});

test("readConfig never requires or returns external AI settings", () => {
  const common = {
    EDGE_DEBUG_URL: "http://127.0.0.1:9222",
    TESSERACT_PATH: "D:\\Tools\\Tesseract-OCR\\tesseract.exe",
    TESSDATA_PREFIX: "D:\\Tools\\Tesseract-OCR\\tessdata",
  };
  assert.equal("openai" in readConfig(common, "douyin"), false);
  assert.equal("openai" in readConfig(common, "xhs"), false);
  assert.equal("openai" in readConfig(common, "both"), false);
});

test("isLikelyContentImage excludes avatars, comments, icons, and tiny images", () => {
  assert.equal(
    isLikelyContentImage({
      src: "https://sns-webpic.xhscdn.com/notes_pre_post/content.webp",
      naturalWidth: 1080,
      naturalHeight: 1440,
    }),
    true,
  );
  assert.equal(
    isLikelyContentImage({
      src: "https://sns-avatar.xhscdn.com/avatar/a.webp",
      naturalWidth: 360,
      naturalHeight: 360,
    }),
    false,
  );
  assert.equal(
    isLikelyContentImage({
      src: "https://sns-webpic-qc.xhscdn.com/notes_pre_post/lazy.webp",
      naturalWidth: 0,
      naturalHeight: 0,
    }),
    true,
  );
  assert.equal(
    isLikelyContentImage({
      src: "https://sns-webpic.xhscdn.com/comment/a.webp",
      naturalWidth: 1080,
      naturalHeight: 1440,
    }),
    false,
  );
  assert.equal(
    isLikelyContentImage({
      src: "data:image/png;base64,abc",
      naturalWidth: 32,
      naturalHeight: 32,
    }),
    false,
  );
});

test("cleanOcrText removes duplicate whitespace and blank lines", () => {
  assert.equal(
    cleanOcrText("  第一行   内容 \r\n\r\n  第二行\t内容  "),
    "第一行 内容\n第二行 内容",
  );
});
