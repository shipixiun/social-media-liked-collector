const PLACEHOLDERS = new Set([
  "生成中",
  "思考中",
  "正在生成",
  "加载中",
  "问题分析中",
  "正在分析",
  "分析中",
]);

export function hasStableAnswer(samples, minimumLength = 4) {
  if (samples.length < 2) return false;
  const latest = samples.at(-1)?.trim() ?? "";
  const previous = samples.at(-2)?.trim() ?? "";
  return (
    latest.length >= minimumLength &&
    latest === previous &&
    !PLACEHOLDERS.has(latest)
  );
}
