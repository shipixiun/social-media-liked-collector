import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  detectPageAccessBlock,
  mergeUniqueCandidates,
  waitForStableText,
} from "../browser/helpers.mjs";
import { contentIdFromUrl, normalizeContentUrl } from "../core/url.mjs";
import { isLikelyContentImage } from "./image-processing.mjs";
import { recognizeImageText } from "./ocr.mjs";

const LIKED_URL =
  "https://www.xiaohongshu.com/user/profile/60abbbe10000000001003c44?tab=liked";

function sameContent(candidateUrl, stopUrl) {
  if (!stopUrl) return false;
  try {
    return (
      normalizeContentUrl(candidateUrl) === normalizeContentUrl(stopUrl) ||
      contentIdFromUrl(candidateUrl) === contentIdFromUrl(stopUrl)
    );
  } catch {
    return false;
  }
}

function mergeUntilStop(existing, found, target, stopUrl) {
  const merged = [...existing];
  let stopped = false;
  for (const item of found) {
    if (sameContent(item.url, stopUrl)) {
      stopped = true;
      break;
    }
    if (merged.some((candidate) => candidate.url === item.url)) continue;
    if (merged.length >= target) break;
    merged.push(item);
  }
  return { candidates: merged, stopped };
}

export async function detectXhsAccessBlock(
  page,
  { captchaWaitMs = 10_000, intervalMs = 500 } = {},
) {
  let block = await detectPageAccessBlock(page);
  if (block !== "captcha") return block;
  const hasVisibleCaptchaSurface = async () =>
    page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll(
          'iframe[src*="captcha" i], iframe[src*="nocaptcha" i], iframe[src*="verify" i], [role="dialog"], [class*="captcha" i], [class*="verify" i], [class*="security" i]',
        ),
      ];
      return candidates.some((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          return false;
        }
        if (element.tagName === "IFRAME") return true;
        return /验证码|安全验证|滑块/.test(element.innerText || "");
      });
    });
  if (!await hasVisibleCaptchaSurface()) return null;
  const deadline = Date.now() + captchaWaitMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(intervalMs);
    block = await detectPageAccessBlock(page);
    if (block !== "captcha" || !await hasVisibleCaptchaSurface()) {
      return block === "captcha" ? null : block;
    }
  }
  return block;
}

export function classifyXhsNote({ videoCount, contentImageCount }) {
  if (videoCount > 0) return "video";
  if (contentImageCount > 0) return "image-text";
  return "unknown";
}

export async function extractXhsNote(page) {
  const data = await page.evaluate(() => {
    const intersectionArea = (element) => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(
        0,
        Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
      );
      const height = Math.max(
        0,
        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
      );
      return width * height;
    };
    const activeNote =
      [...document.querySelectorAll(".note-container")]
        .map((element) => ({ element, area: intersectionArea(element) }))
        .filter(({ area }) => area > 0)
        .sort((a, b) => b.area - a.area)[0]?.element ?? null;
    const roots = [
      ...document.querySelectorAll(
        "[role='dialog'], article, main, [class*='note-detail'], [class*='note-container']",
      ),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const root = activeNote ??
      roots
        .map((element) => ({
          element,
          score:
            element.querySelectorAll("img").length * 10 +
            (element.querySelector("h1, [data-testid='title']") ? 100 : 0) +
            Math.min((element.innerText || "").length, 2_000) / 100,
        }))
        .sort((a, b) => b.score - a.score)[0]?.element ?? document.body;
    const text = (selectors) => {
      for (const selector of selectors) {
        const element = root.querySelector(selector);
        const value = element?.innerText?.trim();
        if (value) return value;
      }
      return "";
    };
    const images = [...root.querySelectorAll("img")]
      .map((image) => ({
        src: image.currentSrc || image.src,
        naturalWidth: image.naturalWidth || image.width,
        naturalHeight: image.naturalHeight || image.height,
      }));
    return {
      title: text([".title", "h1", "[data-testid='title']"]),
      author: text([
        ".username",
        "[data-testid='author']",
        "[class*='author']",
      ]),
      captionText: text([
        ".desc",
        "[data-testid='caption']",
        "[data-testid='desc']",
        "[class*='content']",
      ]),
      videoCount: root.querySelectorAll("video").length,
      images,
    };
  });
  const imageUrls = [
    ...new Set(
      data.images.filter(isLikelyContentImage).map((image) => image.src),
    ),
  ];
  return {
    title: data.title,
    author: data.author,
    captionText: data.captionText,
    imageUrls,
    kind: classifyXhsNote({
      videoCount: data.videoCount,
      contentImageCount: imageUrls.length,
    }),
  };
}

function canonicalXhsUrl(input) {
  const url = new URL(input);
  const explore = url.pathname.match(/\/explore\/([^/?#]+)/)?.[1];
  if (explore) return `https://www.xiaohongshu.com/explore/${explore}`;
  const profileNote = url.pathname.match(/\/user\/profile\/[^/]+\/([^/?#]+)/)?.[1];
  if (profileNote) {
    return `https://www.xiaohongshu.com/explore/${profileNote}`;
  }
  return "";
}

export async function collectXhsCandidateLinks(
  page,
  limit,
  {
    maxStagnantRounds = 3,
    maxInitialEmptyRounds = 12,
    scrollDelayMs = 1_000,
    stopUrl = null,
  } = {},
) {
  const target = limit === "all" ? Infinity : limit;
  let candidates = [];
  let stagnantRounds = 0;
  let initialEmptyRounds = 0;
  let stopped = false;
  while (
    candidates.length < target &&
    stagnantRounds < maxStagnantRounds &&
    initialEmptyRounds < maxInitialEmptyRounds &&
    !stopped
  ) {
    const found = await page.locator(
      'a[href*="/explore/"], a[href*="/user/profile/"]',
    ).evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        url: anchor.href,
        title: (anchor.innerText || anchor.textContent || "").trim(),
      })),
    );
    const mapped = found
      .map((item) => ({
        url: canonicalXhsUrl(item.url),
        accessUrl: item.url,
        title: item.title,
      }))
      .filter((item) => item.url);
    const before = candidates.length;
    const merged = mergeUntilStop(candidates, mapped, target, stopUrl);
    candidates = merged.candidates;
    stopped = merged.stopped;
    if (candidates.length === 0 && mapped.length === 0) {
      initialEmptyRounds += 1;
      stagnantRounds = 0;
    } else {
      initialEmptyRounds = 0;
      stagnantRounds = candidates.length === before ? stagnantRounds + 1 : 0;
    }
    if (candidates.length >= target || stopped) break;
    await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 800)));
    await page.waitForTimeout(scrollDelayMs);
  }
  return candidates;
}

export function candidateScanLimitForXhs() {
  return "all";
}

async function visibleTexts(locator) {
  const values = [];
  for (let index = 0; index < await locator.count(); index += 1) {
    const candidate = locator.nth(index);
    if (!await candidate.isVisible().catch(() => false)) continue;
    const text = (await candidate.innerText().catch(() => "")).trim();
    if (text) values.push(text);
  }
  return values;
}

function isUsefulAiAnswer(text, prompt) {
  return (
    text &&
    text !== prompt &&
    !/生成中|思考中|正在生成|加载中|重新生成/.test(text)
  );
}

async function readXhsDiandianAiAnswers(page, prompt) {
  const explicit = page.locator(
    ".flow-markdown-body, .ai-answer, [data-ai-answer], [data-testid*='answer' i], [class*='answer' i], [class*='message' i]",
  );
  const explicitTexts = (await visibleTexts(explicit)).filter((text) =>
    isUsefulAiAnswer(text, prompt)
  );
  if (explicitTexts.length) return explicitTexts;

  return page.evaluate((submittedPrompt) => {
    const roots = [
      ...document.querySelectorAll(
        "aside, [role='dialog'], [class*='assistant' i], [class*='chat' i], [class*='conversation' i], [class*='message' i], [data-testid*='ai' i], [data-testid*='chat' i], [data-testid*='message' i]",
      ),
    ];
    return roots
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .map((element) => (element.innerText || "").trim())
      .filter(
        (text) =>
          text &&
          text !== submittedPrompt &&
          !/生成中|思考中|正在生成|加载中|重新生成/.test(text),
      );
  }, prompt);
}

const XHS_AI_INPUT_SELECTORS = [
  "textarea",
  "input:not([type='hidden'])",
  "[contenteditable='true']",
];
const XHS_AI_INPUT_SELECTOR = XHS_AI_INPUT_SELECTORS.join(", ");

async function findXhsDiandianInput(page) {
  if (page.url().includes("/ai_chat")) {
    const aiChatInput = await firstVisible(page.locator(XHS_AI_INPUT_SELECTOR));
    if (aiChatInput) return aiChatInput;
  }

  const aiRoots = [
    "aside",
    "[role='dialog']",
    "[class*='assistant' i]",
    "[class*='chat' i]",
    "[class*='conversation' i]",
    "[class*='message' i]",
    "[data-testid*='ai' i]",
    "[data-testid*='chat' i]",
    "[data-testid*='message' i]",
  ];
  for (const root of aiRoots) {
    const scopedSelector = XHS_AI_INPUT_SELECTORS
      .map((selector) => `${root} ${selector}`)
      .join(", ");
    const input = await firstVisible(page.locator(scopedSelector));
    if (input) return input;
  }

  const inputs = page.locator(XHS_AI_INPUT_SELECTOR);
  for (let index = 0; index < await inputs.count(); index += 1) {
    const input = inputs.nth(index);
    if (!await input.isVisible().catch(() => false)) continue;
    const meta = await input.evaluate((element) => {
      const placeholder = element.getAttribute("placeholder") || "";
      const label =
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        "";
      const text = element.textContent || "";
      return `${placeholder} ${label} ${text}`;
    });
    if (/搜索/.test(meta)) continue;
    if (/点点|AI|ai|问|提问|发送|输入|链接/.test(meta)) return input;
  }
  return null;
}

export async function openXhsDiandianAi(page) {
  const existingInput = await findXhsDiandianInput(page);
  if (existingInput) return existingInput;

  const entry =
    await firstVisible(page.locator('a[href*="/ai_chat"]')) ??
    await firstVisible(
      page.locator("button, a, [role='button'], nav *").filter({ hasText: /点点\s*ai|点点/i }),
    );
  if (!entry) throw new Error("未找到小红书点点 AI 入口");
  await entry.click();
  await page
    .waitForURL((url) => url.pathname.includes("/ai_chat"), { timeout: 10_000 })
    .catch(() => {});

  let input = null;
  const deadline = Date.now() + 15_000;
  while (!input && Date.now() < deadline) {
    input = await findXhsDiandianInput(page);
    if (!input) await page.waitForTimeout(250);
  }
  if (!input) throw new Error("未找到小红书点点 AI 输入框");
  return input;
}

export async function requestXhsDiandianAiAnswer(
  page,
  candidate,
  { timeoutMs = 90_000, intervalMs = 1_500 } = {},
) {
  const prompt = candidate.url ?? String(candidate);
  const input = await openXhsDiandianAi(page);
  const baseline = await readXhsDiandianAiAnswers(page, prompt);
  await input.fill(prompt);
  await input.press("Enter");
  return waitForStableText(async () => {
    const answers = await readXhsDiandianAiAnswers(page, prompt);
    const latestNew = answers.filter((text) => !baseline.includes(text)).at(-1);
    return latestNew ?? "";
  }, { timeoutMs, intervalMs });
}

export async function processXhsCandidateWithAi(
  candidate,
  { requestAi },
) {
  const contentId = contentIdFromUrl(candidate.url);
  try {
    const aiSummary = await requestAi(candidate.url);
    return {
      platform: "xiaohongshu",
      contentId,
      url: candidate.url,
      type: "链接",
      title: candidate.title || "",
      aiSummary,
      status: "success",
      error: "",
    };
  } catch (error) {
    return {
      platform: "xiaohongshu",
      contentId,
      url: candidate.url,
      type: "链接",
      title: candidate.title || "",
      aiSummary: "",
      status: "failed",
      error: error.message,
    };
  }
}

async function firstVisible(locator) {
  for (let index = 0; index < await locator.count(); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function firstInViewport(page, locator) {
  const viewport =
    page.viewportSize() ??
    await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  for (let index = 0; index < await locator.count(); index += 1) {
    const candidate = locator.nth(index);
    const box = await candidate.boundingBox().catch(() => null);
    if (!box) continue;
    const width = Math.max(
      0,
      Math.min(box.x + box.width, viewport.width) - Math.max(box.x, 0),
    );
    const height = Math.max(
      0,
      Math.min(box.y + box.height, viewport.height) - Math.max(box.y, 0),
    );
    if (width * height > 0) return candidate;
  }
  return null;
}

export async function closeXhsDetail(page) {
  const detail = page.locator(".note-container");
  if (!await detail.first().isVisible().catch(() => false)) return;
  const close = await firstInViewport(
    page,
    page.locator(
      ".close-circle, .close-mask-dark, button.close-icon, [role='button'].close-icon",
    ),
  );
  if (close) {
    await close.click();
  } else {
    await page.goBack({ waitUntil: "domcontentloaded" });
  }
  await detail
    .first()
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {});
}

async function findXhsCard(
  page,
  contentId,
  { maxSearchRounds = 40, scrollDelayMs = 300 } = {},
) {
  const locator = page.locator(
    `a.cover[href*="/${contentId}"], a.title[href*="/${contentId}"]`,
  );
  for (let round = 0; round <= maxSearchRounds; round += 1) {
    const card = await firstVisible(locator);
    if (card) return card;
    if (round === maxSearchRounds) break;
    const moved = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollBy(0, Math.max(window.innerHeight * 0.8, 700));
      return window.scrollY !== before;
    });
    await page.waitForTimeout(scrollDelayMs);
    if (!moved) break;
  }
  return null;
}

export async function openXhsDetail(page, candidate, searchOptions) {
  await closeXhsDetail(page);
  const contentId = contentIdFromUrl(candidate.url);
  const card = await findXhsCard(page, contentId, searchOptions);
  if (!card) throw new Error(`未在喜欢列表找到小红书卡片: ${contentId}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page
    .locator(".note-container")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

async function downloadImage(context, url, outputPath, referer) {
  const response = await context.request.get(url, {
    headers: { Referer: referer },
    timeout: 30_000,
  });
  if (!response.ok()) {
    throw new Error(`图片下载失败 ${response.status()}: ${url}`);
  }
  await fs.writeFile(outputPath, await response.body());
}

export async function runXhsCollector({
  context,
  listPage,
  limit,
  stateStore,
  resume,
  config,
  delay = async () => {},
  stopUrl = null,
}) {
  if (!listPage.url().includes("xiaohongshu.com/user/profile")) {
    await listPage.goto(LIKED_URL, { waitUntil: "domcontentloaded" });
  }
  const blocked = await detectXhsAccessBlock(listPage);
  if (blocked) throw new Error(`小红书页面被阻止: ${blocked}`);
  await closeXhsDetail(listPage);
  await listPage.evaluate(() => window.scrollTo(0, 0));
  await listPage.waitForTimeout(800);
  const candidates = await collectXhsCandidateLinks(listPage, limit, { stopUrl });
  await listPage.evaluate(() => window.scrollTo(0, 0));
  await listPage.waitForTimeout(800);
  if (!candidates.length) return;
  await openXhsDiandianAi(listPage);

  for (const candidate of candidates) {
    if (sameContent(candidate.url, stopUrl)) break;
    const contentId = contentIdFromUrl(candidate.url);
    if (resume && await stateStore.has("xiaohongshu", contentId)) continue;
    const row = await processXhsCandidateWithAi(candidate, {
      requestAi: () => requestXhsDiandianAiAnswer(listPage, candidate),
    });
    await stateStore.append(row);
    if (/页面被阻止/.test(row.error)) throw new Error(row.error);
    await delay();
  }
}
