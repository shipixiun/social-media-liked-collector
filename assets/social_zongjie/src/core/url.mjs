const CONTENT_PATH = /\/(?:video|note|explore)\/([^/?#]+)/;

export function normalizeContentUrl(input) {
  const url = new URL(input);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function contentIdFromUrl(input) {
  return new URL(input).pathname.match(CONTENT_PATH)?.[1] ?? "";
}

