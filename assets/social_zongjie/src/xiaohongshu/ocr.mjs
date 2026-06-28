import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";

import { cleanOcrText } from "./image-processing.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_OCR_TIMEOUT_MS = 60_000;

function timeoutMs(config) {
  return config.ocrTimeoutMs ?? DEFAULT_OCR_TIMEOUT_MS;
}

export async function withTimeout(task, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          error.code = "OCR_TIMEOUT";
          reject(error);
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runTesseract(imagePath, config) {
  const { stdout } = await execFileAsync(
    config.tesseractPath,
    [imagePath, "stdout", "-l", "chi_sim+eng", "--psm", "6"],
    {
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        TESSDATA_PREFIX: config.tessdataPrefix,
      },
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs(config),
      killSignal: "SIGKILL",
    },
  );
  return cleanOcrText(stdout);
}

export async function preprocessForOcr(inputPath, outputPath) {
  await sharp(inputPath)
    .resize({ width: 2400, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toFile(outputPath);
}

function weakOcr(text) {
  if (text.length < 8) return true;
  const noise = (text.match(/[?？�]/g) ?? []).length;
  return noise / text.length > 0.2;
}

export async function ocrImage(
  imagePath,
  config,
  {
    run = (target) => runTesseract(target, config),
    preprocess = preprocessForOcr,
    enhancedPath = path.join(
      path.dirname(imagePath),
      `${path.parse(imagePath).name}.enhanced.png`,
    ),
  } = {},
) {
  const stageTimeoutMs = timeoutMs(config);
  const first = cleanOcrText(
    await withTimeout(
      run(imagePath),
      stageTimeoutMs,
      `OCR识别超时: ${imagePath}`,
    ),
  );
  if (!weakOcr(first)) return { text: first, retried: false };
  await withTimeout(
    preprocess(imagePath, enhancedPath),
    stageTimeoutMs,
    `OCR图像增强超时: ${imagePath}`,
  );
  const second = cleanOcrText(
    await withTimeout(
      run(enhancedPath),
      stageTimeoutMs,
      `OCR识别超时: ${enhancedPath}`,
    ),
  );
  return {
    text: second.length >= first.length ? second : first,
    retried: true,
  };
}

export async function recognizeImageText(
  imagePath,
  config,
  { ocr = ocrImage } = {},
) {
  try {
    const result = await withTimeout(
      ocr(imagePath, config),
      timeoutMs(config),
      `OCR识别超时: ${imagePath}`,
    );
    return result.text;
  } catch (error) {
    if (error.code === "OCR_TIMEOUT" || /timed out|超时/i.test(error.message)) {
      return "[OCR识别超时]";
    }
    return `[OCR识别失败: ${error.message}]`;
  }
}
