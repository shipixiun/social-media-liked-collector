import assert from "node:assert/strict";
import test from "node:test";

import { connectEdgeSession } from "../src/browser/session.mjs";

test("connectEdgeSession reuses matching pages and creates missing platform page", async () => {
  const douyinPage = {
    url: () => "https://www.douyin.com/user/self?showTab=like",
  };
  const createdPages = [];
  const context = {
    pages: () => [douyinPage],
    newPage: async () => {
      const page = {
        currentUrl: "",
        url() {
          return this.currentUrl;
        },
        async goto(url) {
          this.currentUrl = url;
        },
      };
      createdPages.push(page);
      return page;
    },
  };
  const browser = { contexts: () => [context], close: async () => {} };
  const chromiumLike = {
    connectOverCDP: async (url) => {
      assert.equal(url, "http://127.0.0.1:9222");
      return browser;
    },
  };

  const session = await connectEdgeSession(
    "http://127.0.0.1:9222",
    chromiumLike,
  );
  assert.equal(session.douyinPage, douyinPage);
  assert.equal(createdPages.length, 1);
  assert.match(session.xhsPage.url(), /xiaohongshu\.com\/user\/profile/);
});

test("connectEdgeSession fails clearly when no browser context exists", async () => {
  const chromiumLike = {
    connectOverCDP: async () => ({ contexts: () => [] }),
  };
  await assert.rejects(
    () => connectEdgeSession("http://127.0.0.1:9222", chromiumLike),
    /没有可用的 Edge 浏览器上下文/,
  );
});
