---
name: social-media-liked-collector
description: Use when collecting, resuming, inspecting, or exporting liked/favorited Douyin/抖音 and Xiaohongshu/小红书 social media content with the bundled social_zongjie project, especially for social_media, 点赞采集, 原文采集, OCR, or Excel output.
---

# Social Media Liked Collector

## Overview

Use the bundled `social_zongjie` Node project to collect original liked-content text from Douyin and Xiaohongshu into Excel. The tool connects to a dedicated Edge session over CDP, preserves source URLs as plain `http`/`https` text, uses local Tesseract OCR for image text, and does not call external AI services.

Bundled project path:

`C:\Users\Administrator\.agents\skills\social-media-liked-collector\assets\social_zongjie`

## Required Boundaries

- Do not bypass login, CAPTCHA, permission prompts, rate limits, or platform risk-control screens. Stop and hand off clearly.
- Do not like, favorite, comment, follow, post, message, upload, or change account settings.
- Do not inspect cookies, local storage, passwords, session stores, or hidden private data.
- Use browser-visible content and the project's generated rows as the source of truth.
- Keep OCR local. The default Tesseract paths are `D:\Tools\Tesseract-OCR\tesseract.exe` and `D:\Tools\Tesseract-OCR\tessdata`.

## Workflow

1. Work from the bundled project directory:

```powershell
Set-Location 'C:\Users\Administrator\.agents\skills\social-media-liked-collector\assets\social_zongjie'
```

2. Verify dependencies are present. If `node_modules` is missing, run `npm install`. The project postinstall links Codex's spreadsheet artifact tool.

3. Ensure `.env` exists. If missing:

```powershell
Copy-Item .env.example .env
```

4. Verify local OCR before collecting image-text notes:

```powershell
D:\Tools\Tesseract-OCR\tesseract.exe --version
D:\Tools\Tesseract-OCR\tesseract.exe --list-langs
```

`--list-langs` must include `chi_sim`, `eng`, and preferably `osd`. If Chinese language data is missing, stop and report it.

5. Start the dedicated Edge session if it is not already running:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-edge.ps1
```

Ask the user to log in manually if Douyin or Xiaohongshu is not logged in. Do not close this Edge window while collecting.

6. Run collection. Default `count` mode processes 20 Douyin items and 20 Xiaohongshu items:

```powershell
npm start
```

Use targeted commands when the user specifies scope:

```powershell
node src\cli.mjs --mode count --platform both --douyin-limit 10 --xhs-limit 15
node src\cli.mjs --platform douyin --douyin-limit 20
node src\cli.mjs --platform xhs --xhs-limit all
node src\cli.mjs --mode since-latest-excel --platform both
node src\cli.mjs --platform both --resume
```

`--mode since-latest-excel` reads the newest workbook in the desktop social summary folder, stops each platform before the first link from that workbook, and collects 10 items for any platform whose first link is missing.

7. Report the generated Excel path printed as `Excel 已生成: ...`. Outputs are written under the desktop social summary folder:

`C:\Users\Administrator\Desktop\社媒总结`

## What The Tool Collects

- Douyin liked videos: opens content, uses the platform's built-in AI entry when available, asks for `视频总结`, and saves the original answer.
- Douyin image-text posts: saves visible copy and local OCR text from post images.
- Xiaohongshu liked links: sends liked links to Xiaohongshu 点点 AI and saves the original answer.
- Excel workbook sheets include Douyin content, Xiaohongshu content, and run logs. Rows retain plain source URLs.

## Resume And Recovery

- `C:\Users\Administrator\Desktop\社媒总结\state.jsonl` stores processed rows for resume support.
- Use `--resume` after interruption to skip already processed content IDs.
- A per-item failure should be recorded in output and collection should continue.
- A platform-level failure such as login loss, CAPTCHA, blocked access, or page redesign should stop that platform and be included in the final handoff.
- Temporary OCR cleanup warnings such as Windows `EBUSY` should not be treated as content collection failures.

## Common Checks

- If Edge cannot connect, confirm the dedicated browser was launched with remote debugging on the `.env` `EDGE_DEBUG_URL`, default `http://127.0.0.1:9222`.
- If output export fails, run `npm install` again to refresh the artifact-tool link, then run `npm test -- test\artifact-link.test.mjs` if needed.
- If OCR is empty or garbled, confirm Tesseract language data, then trust the project's preprocessing/retry path. Mark uncertainty instead of inventing text.
- If Xiaohongshu needs an unbounded liked traversal, prefer `--xhs-limit all`; Douyin requires a positive integer limit.

## Verification

Before claiming completion, run the narrow tests that do not require live platform access:

```powershell
npm test -- test\core.test.mjs test\processing.test.mjs test\excel.test.mjs test\artifact-link.test.mjs test\workflow.test.mjs test\douyin-note.test.mjs
```

For live collection, successful verification is the printed Excel path plus a workbook under `C:\Users\Administrator\Desktop\社媒总结` containing the requested platform rows or clearly logged platform errors.