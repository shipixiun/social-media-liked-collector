import { normalizeContentUrl } from "../core/url.mjs";
import { hasStableAnswer } from "../core/stability.mjs";

export function selectPageByHost(pages, host) {
  return pages.find((page) => {
    try {
      return new URL(page.url()).host === host;
    } catch {
      return false;
    }
  }) ?? null;
}

export function mergeUniqueCandidates(current, incoming, limit = Infinity) {
  const byUrl = new Map();
  for (const item of [...current, ...incoming]) {
    const url = normalizeContentUrl(item.url);
    if (!byUrl.has(url)) byUrl.set(url, { ...item, url });
  }
  return [...byUrl.values()].slice(0, limit);
}

export function pageShowsAccessBlock(text) {
  if (/请登录|登录后|扫码登录|手机号登录|登录抖音|立即登录/.test(text)) {
    return "login";
  }
  if (/验证码|安全验证|滑块/.test(text)) return "captcha";
  if (
    /访问频繁|操作频繁|异常访问|请求过于频繁|账号(?:存在)?风险|网络环境(?:存在)?风险/.test(
      text,
    )
  ) {
    return "risk";
  }
  return null;
}

export async function detectPageAccessBlock(page) {
  const captchaFrames = await page
    .locator(
      'iframe[src*="captcha" i], iframe[src*="nocaptcha" i], iframe[src*="verify" i]',
    )
    .evaluateAll((frames) =>
      frames.map((frame) => {
        const rect = frame.getBoundingClientRect();
        const style = getComputedStyle(frame);
        return {
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
        };
      }),
    )
    .catch(() => []);
  if (captchaFrames.some((frame) => frame.visible)) {
    return "captcha";
  }
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return pageShowsAccessBlock(bodyText);
}

export async function waitForStableText(
  readText,
  { timeoutMs = 90_000, intervalMs = 1_500 } = {},
) {
  const samples = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    samples.push((await readText())?.trim() ?? "");
    if (samples.length > 3) samples.shift();
    if (hasStableAnswer(samples)) return samples.at(-1);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("等待 AI 回答超时");
}
