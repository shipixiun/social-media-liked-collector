import assert from "node:assert/strict";
import test from "node:test";

import {
  detectPageAccessBlock,
  mergeUniqueCandidates,
  pageShowsAccessBlock,
  selectPageByHost,
  waitForStableText,
} from "../src/browser/helpers.mjs";
import { classifyXhsNote } from "../src/xiaohongshu/collector.mjs";

test("selectPageByHost chooses an existing matching page", async () => {
  const pages = [
    { url: () => "https://example.com/" },
    { url: () => "https://www.douyin.com/user/self?showTab=like" },
  ];
  assert.equal(
    selectPageByHost(pages, "www.douyin.com"),
    pages[1],
  );
  assert.equal(selectPageByHost(pages, "www.xiaohongshu.com"), null);
});

test("mergeUniqueCandidates normalizes URLs and respects a numeric limit", () => {
  const current = [
    { url: "https://www.douyin.com/video/1", title: "一" },
  ];
  const incoming = [
    { url: "https://www.douyin.com/video/1?foo=bar", title: "重复" },
    { url: "https://www.douyin.com/note/2?x=1", title: "二" },
    { url: "https://www.douyin.com/video/3", title: "三" },
  ];
  assert.deepEqual(mergeUniqueCandidates(current, incoming, 2), [
    { url: "https://www.douyin.com/video/1", title: "一" },
    { url: "https://www.douyin.com/note/2", title: "二" },
  ]);
});

test("pageShowsAccessBlock recognizes login, captcha, and risk messages", () => {
  assert.equal(pageShowsAccessBlock("请登录后查看喜欢内容"), "login");
  assert.equal(pageShowsAccessBlock("保存登录信息"), null);
  assert.equal(pageShowsAccessBlock("请完成验证码"), "captcha");
  assert.equal(pageShowsAccessBlock("访问频繁，请稍后再试"), "risk");
  assert.equal(pageShowsAccessBlock("视频讨论投资风险和收益"), null);
  assert.equal(pageShowsAccessBlock("正常的视频正文"), null);
});

test("detectPageAccessBlock recognizes captcha iframe URLs", async () => {
  const page = {
    locator: (selector) =>
      selector.startsWith("iframe")
        ? {
            evaluateAll: async () => [{ visible: true }],
          }
        : { innerText: async () => "正常页面正文" },
    frames: () => [
      { url: () => "https://www.douyin.com/" },
      {
        url: () =>
          "https://verify.example.com/rmc-nocaptcha/index.html",
      },
    ],
  };
  assert.equal(await detectPageAccessBlock(page), "captcha");
});

test("detectPageAccessBlock ignores a hidden leftover captcha iframe", async () => {
  const page = {
    locator: (selector) =>
      selector.startsWith("iframe")
        ? {
            evaluateAll: async () => [{ visible: false }],
          }
        : { innerText: async () => "正常页面正文" },
    frames: () => [
      {
        url: () =>
          "https://verify.example.com/rmc-nocaptcha/index.html",
      },
    ],
  };
  assert.equal(await detectPageAccessBlock(page), null);
});

test("classifyXhsNote skips videos and accepts image-text notes", () => {
  assert.equal(
    classifyXhsNote({ videoCount: 1, contentImageCount: 3 }),
    "video",
  );
  assert.equal(
    classifyXhsNote({ videoCount: 0, contentImageCount: 3 }),
    "image-text",
  );
  assert.equal(
    classifyXhsNote({ videoCount: 0, contentImageCount: 0 }),
    "unknown",
  );
});

test("waitForStableText returns after the same complete answer is observed twice", async () => {
  const values = ["生成中", "这是完整回答", "这是完整回答"];
  let index = 0;
  const result = await waitForStableText(
    async () => values[Math.min(index++, values.length - 1)],
    { timeoutMs: 200, intervalMs: 1 },
  );
  assert.equal(result, "这是完整回答");
});

test("waitForStableText throws on an answer that never stabilizes", async () => {
  let index = 0;
  await assert.rejects(
    () =>
      waitForStableText(async () => `变化${index++}`, {
        timeoutMs: 10,
        intervalMs: 1,
      }),
    /等待 AI 回答超时/,
  );
});
