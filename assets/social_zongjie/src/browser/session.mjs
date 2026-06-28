import { chromium } from "playwright";

import { selectPageByHost } from "./helpers.mjs";

const DOUYIN_URL =
  "https://www.douyin.com/user/self?from_tab_name=main&showTab=like";
const XHS_URL =
  "https://www.xiaohongshu.com/user/profile/60abbbe10000000001003c44?tab=liked";

async function findOrCreatePage(context, host, url) {
  const existing = selectPageByHost(context.pages(), host);
  if (existing) return existing;
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

export async function connectEdgeSession(edgeDebugUrl, chromiumLike = chromium) {
  const browser = await chromiumLike.connectOverCDP(edgeDebugUrl);
  const context = browser.contexts()[0];
  if (!context) throw new Error("没有可用的 Edge 浏览器上下文");
  const douyinPage = await findOrCreatePage(
    context,
    "www.douyin.com",
    DOUYIN_URL,
  );
  const xhsPage = await findOrCreatePage(
    context,
    "www.xiaohongshu.com",
    XHS_URL,
  );
  return { browser, context, douyinPage, xhsPage };
}

