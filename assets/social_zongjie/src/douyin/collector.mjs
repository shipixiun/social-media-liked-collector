import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  detectPageAccessBlock,
  mergeUniqueCandidates,
  waitForStableText,
} from "../browser/helpers.mjs";
import { contentIdFromUrl, normalizeContentUrl } from "../core/url.mjs";
import { ocrImage } from "../xiaohongshu/ocr.mjs";

const LIKE_URL =
  "https://www.douyin.com/user/self?from_tab_name=main&showTab=like";

async function findFirstVisible(locators) {
  for (const locator of locators) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
  }
  return null;
}

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
function intersectionArea(box, viewport) {
  if (!box) return 0;
  const width = Math.max(
    0,
    Math.min(box.x + box.width, viewport.width) - Math.max(box.x, 0),
  );
  const height = Math.max(
    0,
    Math.min(box.y + box.height, viewport.height) - Math.max(box.y, 0),
  );
  return width * height;
}

export async function findVisibleDouyinAiIcon(page) {
  const viewport =
    page.viewportSize() ??
    await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  const roots = page.locator(".modalPlayer, .modal-video-container");
  let activeRoot = null;
  let activeArea = 0;
  for (let index = 0; index < await roots.count(); index += 1) {
    const root = roots.nth(index);
    const area = intersectionArea(
      await root.boundingBox().catch(() => null),
      viewport,
    );
    if (area > activeArea) {
      activeRoot = root;
      activeArea = area;
    }
  }

  const candidates = (activeRoot ?? page)
    .locator('svg[viewBox="0 0 34 34"]');
  let visibleIcon = null;
  let visibleArea = 0;
  for (let index = 0; index < await candidates.count(); index += 1) {
    const icon = candidates.nth(index);
    const area = intersectionArea(
      await icon.boundingBox().catch(() => null),
      viewport,
    );
    if (area > visibleArea) {
      visibleIcon = icon;
      visibleArea = area;
    }
  }
  return visibleIcon;
}

export async function collectDouyinCandidateLinks(
  page,
  limit,
  { maxStagnantRounds = 3, scrollDelayMs = 1_000, stopUrl = null } = {},
) {
  const target = limit === "all" ? Infinity : limit;
  let candidates = [];
  let stagnantRounds = 0;
  let stopped = false;
  while (candidates.length < target && stagnantRounds < maxStagnantRounds && !stopped) {
    const found = await page.locator(
      '[data-e2e="user-like-list"] a[href*="/video/"], [data-e2e="user-like-list"] a[href*="/note/"]',
    )
      .evaluateAll((anchors) =>
        anchors.map((anchor) => ({
          url: anchor.href,
          title: (anchor.innerText || anchor.textContent || "").trim(),
        })),
      );
    const before = candidates.length;
    const merged = mergeUntilStop(
      candidates,
      found.map((item) => ({
        url: normalizeContentUrl(item.url),
        accessUrl: item.url,
        title: item.title,
      })),
      target,
      stopUrl,
    );
    candidates = merged.candidates;
    stopped = merged.stopped;
    stagnantRounds = candidates.length === before ? stagnantRounds + 1 : 0;
    if (candidates.length >= target || stopped) break;
    await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 800)));
    await page.waitForTimeout(scrollDelayMs);
  }
  return candidates;
}

async function readAiAnswer(page, prompt) {
  const contextualFrame = page
    .frames()
    .find(
      (frame) =>
        frame.url().includes("search_ai_mobile") &&
        frame.url().includes("scene=feed"),
    );
  if (contextualFrame) {
    const answers = contextualFrame.locator(".flow-markdown-body");
    const count = await answers.count();
    if (count > 0) {
      const text = (await answers.nth(count - 1).innerText().catch(() => "")).trim();
      if (text && text !== prompt) return text;
    }
  }

  const explicit = page.locator(
    "[data-ai-answer], [data-testid*='answer'], [class*='answer'], [class*='message']",
  );
  const explicitCount = await explicit.count();
  const values = [];
  for (let index = 0; index < explicitCount; index += 1) {
    const locator = explicit.nth(index);
    if (!await locator.isVisible().catch(() => false)) continue;
    const text = (await locator.innerText().catch(() => "")).trim();
    if (text && text !== prompt && !/生成中|思考中|重新生成/.test(text)) {
      values.push(text);
    }
  }
  if (values.length) return values.sort((a, b) => b.length - a.length)[0];

  return page.evaluate((submittedPrompt) => {
    const roots = [
      ...document.querySelectorAll(
        "aside, [role='dialog'], [class*='ai'], [class*='assistant']",
      ),
    ];
    const texts = roots
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.innerText || "").trim())
      .filter(
        (text) =>
          text &&
          text !== submittedPrompt &&
          !/生成中|思考中|重新生成/.test(text),
      );
    return texts.sort((a, b) => b.length - a.length)[0] || "";
  }, prompt);
}

export async function requestDouyinAiSummary(
  page,
  { prompt = "视频总结", timeoutMs = 90_000, intervalMs = 1_500 } = {},
) {
  const findContextualFrame = () =>
    page
      .frames()
      .find(
        (frame) =>
          frame.url().includes("search_ai_mobile") &&
          frame.url().includes("scene=feed"),
      );
  let contextualFrame = findContextualFrame();
  if (!contextualFrame) {
    const identifyFrame = page.getByText("识别画面", { exact: true });
    if (
      (await identifyFrame.count()) === 1 &&
      (await identifyFrame.isVisible().catch(() => false))
    ) {
      await identifyFrame.click();
    } else {
      const aiIcon = await findVisibleDouyinAiIcon(page);
      if (aiIcon) {
        await aiIcon.click();
      }
    }
    const deadline = Date.now() + 15_000;
    while (!contextualFrame && Date.now() < deadline) {
      await page.waitForTimeout(250);
      contextualFrame = findContextualFrame();
    }
  }
  if (contextualFrame) {
    const input = contextualFrame.locator("#input_ai_search");
    await input.waitFor({ state: "visible", timeout: 15_000 });
    const answers = contextualFrame.locator(".flow-markdown-body");
    const baselineCount = await answers.count();
    const baselineText =
      baselineCount > 0
        ? (await answers
            .nth(baselineCount - 1)
            .innerText()
            .catch(() => "")).trim()
        : "";
    await input.fill(prompt);
    await input.press("Enter");
    return waitForStableText(async () => {
      const count = await answers.count();
      if (count === 0) return "";
      const latest = (await answers
        .nth(count - 1)
        .innerText()
        .catch(() => "")).trim();
      if (count <= baselineCount && latest === baselineText) return "";
      return latest;
    }, { timeoutMs, intervalMs });
  }

  const aiButton = await findFirstVisible([
    page.locator("[aria-label*='AI' i], [title*='AI' i]"),
    page.getByRole("button", { name: /AI|智能助手|豆包/i }),
    page.locator("button, [role='button']").filter({ hasText: /AI|智能助手|豆包/i }),
  ]);
  if (!aiButton) throw new Error("未找到抖音 AI 按钮");
  await aiButton.click();

  const input = await findFirstVisible([
    page.locator("textarea"),
    page.locator("input[placeholder*='AI' i], input[placeholder*='问']"),
    page.locator("[contenteditable='true']"),
  ]);
  if (!input) throw new Error("未找到抖音 AI 输入框");
  await input.fill(prompt);
  await input.press("Enter");

  return waitForStableText(() => readAiAnswer(page, prompt), {
    timeoutMs,
    intervalMs,
  });
}

async function closeDouyinModal(page) {
  if (!page.url().includes("modal_id=")) return;
  await page.keyboard.press("Escape").catch(() => {});
  await page
    .waitForFunction(() => !location.href.includes("modal_id="), null, {
      timeout: 2_000,
    })
    .catch(() => {});
  if (page.url().includes("modal_id=")) {
    await page.goto(LIKE_URL, { waitUntil: "domcontentloaded" });
  }
}

async function openDouyinModal(page, candidate) {
  await closeDouyinModal(page);
  const likeList = page.locator('[data-e2e="user-like-list"]');
  await likeList.waitFor({ state: "visible", timeout: 15_000 });
  const contentId = contentIdFromUrl(candidate.url);
  const card = likeList.locator(`a[href*="/${contentId}"]`);
  await card.first().waitFor({ state: "visible", timeout: 15_000 });
  const count = await card.count();
  if (count !== 1) {
    throw new Error(`未在喜欢列表找到内容卡片: ${contentId}`);
  }
  await card.click();
  await page.waitForURL((url) => url.searchParams.get("modal_id") === contentId, {
    timeout: 15_000,
  });
  await page.waitForTimeout(800);
}

export async function extractDouyinMetadata(page, candidate) {
  const values = await page.evaluate(() => {
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
    const roots = [
      ...document.querySelectorAll(".modalPlayer, .modal-video-container"),
    ];
    const root =
      roots
        .map((element) => ({ element, area: intersectionArea(element) }))
        .filter(({ area }) => area > 0)
        .sort((a, b) => b.area - a.area)[0]?.element ?? document.body;
    const text = (selectors) => {
      for (const selector of selectors) {
        const element = root.querySelector(selector);
        const value = element?.innerText?.trim();
        if (value) return value;
      }
      return "";
    };
    const authorLine = (root.innerText || "").match(
      /@([^\n·•]{1,50})\s*[·•]\s*([^\n]+)/,
    );
    return {
      title: text(["h1", "[data-e2e*='desc']", "[class*='desc']"]),
      author: authorLine
        ? `@${authorLine[1].trim()}`
        : text(["[data-e2e*='author']", "[class*='author']", "h2"]),
      publishedAt: authorLine
        ? authorLine[2].trim()
        : text(["time", "[class*='time']", "[class*='date']"]),
      heat: text(["[data-e2e*='like']", "[class*='like-count']"]),
    };
  });
  const candidateTitle = (candidate.title || "")
    .replace(/^\s*[\d.万wW+]+\s*(?:\r?\n)+/, "")
    .trim();
  return {
    ...values,
    title: candidateTitle || values.title || "",
    type: /\/note\//.test(candidate.url) ? "图文" : "视频",
  };
}

export async function extractDouyinNote(page) {
  return page.evaluate(() => {
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
    const roots = [
      ...document.querySelectorAll(".modalPlayer, .modal-video-container"),
    ];
    const root =
      roots
        .map((element) => ({ element, area: intersectionArea(element) }))
        .filter(({ area }) => area > 0)
        .sort((a, b) => b.area - a.area)[0]?.element ?? document.body;
    const text = (selectors) => {
      for (const selector of selectors) {
        const value = root.querySelector(selector)?.innerText?.trim();
        if (value) return value;
      }
      return "";
    };
    const captionText = text([
      "[data-testid='note-caption']",
      "[data-e2e='video-desc']",
      "[data-e2e*='desc']",
    ]).replace(/\s*展开\s*$/, "");
    const imageUrls = [
      ...new Set(
        [...root.querySelectorAll("img")]
          .map((image) => image.currentSrc || image.src)
          .filter((url) => url && url.includes("aweme-images")),
      ),
    ];
    return {
      captionText,
      imageUrls,
      author: text([
        "[data-e2e*='author']",
        "[data-testid='author']",
        "[class*='author']",
      ]),
    };
  });
}

export async function processDouyinContent(
  metadata,
  { requestAi, processNote },
) {
  if (metadata.type === "图文") {
    return { ...metadata, ...(await processNote()) };
  }
  return { ...metadata, aiSummary: await requestAi() };
}

export async function processDouyinNoteData(
  note,
  { processImage },
) {
  const ocrTextByImage = [];
  for (let index = 0; index < note.imageUrls.length; index += 1) {
    ocrTextByImage.push(await processImage(note.imageUrls[index], index));
  }
  return {
    ...note,
    imageCount: note.imageUrls.length,
    ocrTextByImage,
  };
}

const LOCKED_FILE_ERROR_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);

export async function cleanupTemporaryDirectory(
  tempDir,
  {
    remove = (target) => fs.rm(target, { recursive: true, force: true }),
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    maxAttempts = 4,
    delayMs = 250,
    warn = console.warn,
  } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await remove(tempDir);
      return;
    } catch (error) {
      lastError = error;
      if (!LOCKED_FILE_ERROR_CODES.has(error.code)) throw error;
      if (attempt < maxAttempts) await wait(delayMs * attempt);
    }
  }
  warn(`临时 OCR 目录清理失败，已忽略: ${tempDir} (${lastError.message})`);
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

async function processDouyinNote(page, context, config) {
  const note = await extractDouyinNote(page);
  if (!note.imageUrls.length) throw new Error("未识别到抖音图文正文图片");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "douyin-note-ocr-"));
  try {
    return await processDouyinNoteData(note, {
      processImage: async (url, index) => {
        const imagePath = path.join(tempDir, `image-${index + 1}.webp`);
        await downloadImage(context, url, imagePath, page.url());
        const ocr = await ocrImage(imagePath, config);
        return ocr.text;
      },
    });
  } finally {
    await cleanupTemporaryDirectory(tempDir);
  }
}

export async function runDouyinCollector({
  context,
  listPage,
  limit,
  stateStore,
  resume,
  config,
  delay = async () => {},
  stopUrl = null,
}) {
  if (!listPage.url().includes("douyin.com/user/self")) {
    await listPage.goto(LIKE_URL, { waitUntil: "domcontentloaded" });
  }
  const blocked = await detectPageAccessBlock(listPage);
  if (blocked) throw new Error(`抖音页面被阻止: ${blocked}`);
  const candidates = await collectDouyinCandidateLinks(listPage, limit, { stopUrl });

  for (const candidate of candidates) {
    if (sameContent(candidate.url, stopUrl)) break;
    const contentId = contentIdFromUrl(candidate.url);
    if (resume && await stateStore.has("douyin", contentId)) continue;
    let row;
    try {
      await openDouyinModal(listPage, candidate);
      const accessBlock = await detectPageAccessBlock(listPage);
      if (accessBlock) throw new Error(`抖音页面被阻止: ${accessBlock}`);
      const metadata = await extractDouyinMetadata(listPage, candidate);
      const processed = await processDouyinContent(metadata, {
        requestAi: () => requestDouyinAiSummary(listPage),
        processNote: () => processDouyinNote(listPage, context, config),
      });
      row = {
        platform: "douyin",
        contentId,
        url: candidate.url,
        ...processed,
        aiSummary: processed.aiSummary ?? "",
        captionText: processed.captionText ?? "",
        imageCount: processed.imageCount ?? 0,
        ocrTextByImage: processed.ocrTextByImage ?? [],
        status: "success",
        error: "",
      };
    } catch (error) {
      row = {
        platform: "douyin",
        contentId,
        url: candidate.url,
        type: /\/note\//.test(candidate.url) ? "图文" : "视频",
        title: candidate.title || "",
        author: "",
        publishedAt: "",
        heat: "",
        aiSummary: "",
        captionText: "",
        imageCount: 0,
        ocrTextByImage: [],
        status: "failed",
        error: error.message,
      };
      if (/页面被阻止/.test(error.message)) {
        await stateStore.append(row);
        throw error;
      }
    } finally {
      await closeDouyinModal(listPage);
    }
    await stateStore.append(row);
    await delay();
  }
}
