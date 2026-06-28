export function isLikelyContentImage(image) {
  const src = image.src ?? "";
  if (!/^https?:/i.test(src)) return false;
  if (/avatar|comment|picasso-static|fe-platform/i.test(src)) return false;
  if (/\/notes_pre_post\//i.test(src)) return true;
  if ((image.naturalWidth ?? 0) < 400 || (image.naturalHeight ?? 0) < 400) {
    return false;
  }
  return /xhscdn\.com|xiaohongshu\.com/i.test(src);
}

export function cleanOcrText(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
