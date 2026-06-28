const VALID_PLATFORMS = new Set(["douyin", "xhs", "both"]);
const VALID_MODES = new Set(["count", "since-latest-excel"]);

function positiveInteger(value, flag) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${flag} 必须是正整数`);
  }
  return number;
}

export function parseArgs(argv) {
  const options = {
    platform: "both",
    douyinLimit: 20,
    xhsLimit: 20,
    resume: false,
    mode: "count",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--resume") {
      options.resume = true;
    } else if (flag === "--mode") {
      options.mode = argv[++index];
      if (!VALID_MODES.has(options.mode)) {
        throw new Error("--mode 必须是 count 或 since-latest-excel");
      }
    } else if (flag === "--platform") {
      options.platform = argv[++index];
      if (!VALID_PLATFORMS.has(options.platform)) {
        throw new Error("--platform 必须是 douyin、xhs 或 both");
      }
    } else if (flag === "--douyin-limit") {
      options.douyinLimit = positiveInteger(argv[++index], flag);
    } else if (flag === "--xhs-limit") {
      const value = argv[++index];
      options.xhsLimit =
        value === "all" ? "all" : positiveInteger(value, flag);
    } else {
      throw new Error(`未知参数: ${flag}`);
    }
  }
  return options;
}

export function readConfig(env, platform) {
  const edgeDebugUrl =
    env.EDGE_DEBUG_URL?.trim() || "http://127.0.0.1:9222";
  return {
    edgeDebugUrl,
    tesseractPath:
      env.TESSERACT_PATH?.trim() ||
      "D:\\Tools\\Tesseract-OCR\\tesseract.exe",
    tessdataPrefix:
      env.TESSDATA_PREFIX?.trim() ||
      "D:\\Tools\\Tesseract-OCR\\tessdata",
    ocrTimeoutMs: Number.parseInt(env.OCR_TIMEOUT_MS, 10) || 60_000,
  };
}
