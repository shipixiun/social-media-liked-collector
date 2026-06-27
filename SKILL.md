---
name: social-media-liked-collector
description: Use when collecting, resuming, inspecting, or exporting liked/favorited Douyin/抖音 and Xiaohongshu/小红书 social media content from the local social_zongjie project, especially when the user asks for social_media, social media liked collection, 点赞采集, 原文采集, OCR, or Excel output.
---

# Social Media Liked Collector

## Overview

Use the local `social_zongjie` Node project to collect original liked-content text from Douyin and Xiaohongshu into Excel. The tool connects to a dedicated Edge session over CDP, preserves source links, uses local Tesseract OCR for image text, and does not call external AI services.

Project path:

`C:\Users\Administrator\Desktop\code\social_zongjie`

## Required Boundaries

- Do not bypass login, CAPTCHA, permission prompts, rate limits, or platform risk-control screens. Stop and hand off clearly.
- Do not like, favorite, comment, follow, post, message, upload, or change account settings.
- Do not inspect cookies, local storage, passwords, session stores, or hidden private data.
- Use browser-visible content and the project's generated rows as the source of truth.
- Keep OCR local. The default Tesseract paths are `D:\Tools\Tesseract-OCR\tesseract.exe` and `D:\Tools\Tesseract-OCR\tessdata`.

## Workflow

1. Work from the project directory:

```powershell
Set-Location 'C:\Users\Administrator\Desktop\code\social_zongjie'
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

6. Run collection:

```powershell
npm start
```

The default processes 20 Douyin items and 20 Xiaohongshu items.

Use targeted commands when the user specifies scope:

```powershell
node src\cli.mjs --platform both --douyin-limit 10 --xhs-limit 15
node src\cli.mjs --platform douyin --douyin-limit 20
node src\cli.mjs --platform xhs --xhs-limit all
node src\cli.mjs --platform both --resume
```

7. Report the generated Excel path printed as `Excel 已生成: ...`. Outputs are written under:

`C:\Users\Administrator\Desktop\code\social_zongjie\output`

## What The Tool Collects

- Douyin liked videos: opens content, uses the platform's built-in AI entry when available, asks for `视频总结`, and saves the original answer.
- Douyin image-text posts: saves visible copy and local OCR text from post images.
- Xiaohongshu liked image-text notes: saves visible note text and local OCR text from all reachable images.
- Excel workbook sheets include Douyin content, Xiaohongshu content, and run logs. Rows retain clickable source links.

## Resume And Recovery

- `output\state.jsonl` stores processed rows for resume support.
- Use `--resume` after interruption to skip already processed content IDs.
- A per-item failure should be recorded in output and collection should continue.
- A platform-level failure such as login loss, CAPTCHA, blocked access, or page redesign should stop that platform and be included in the final handoff.

## Common Checks

- If Edge cannot connect, confirm the dedicated browser was launched with remote debugging on the `.env` `EDGE_DEBUG_URL`, default `http://127.0.0.1:9222`.
- If output export fails, run `npm install` again to refresh the artifact-tool link, then run `npm test -- test\artifact-link.test.mjs` if needed.
- If OCR is empty or garbled, confirm Tesseract language data, then trust the project's preprocessing/retry path. Mark uncertainty instead of inventing text.
- If Xiaohongshu needs an unbounded liked traversal, prefer `--xhs-limit all`; Douyin requires a positive integer limit.

## Verification

Before claiming completion, run the narrow tests that do not require live platform access:

```powershell
npm test -- test\core.test.mjs test\processing.test.mjs test\excel.test.mjs test\artifact-link.test.mjs
```

For live collection, successful verification is the printed Excel path plus a workbook under `output\` containing the requested platform rows or clearly logged platform errors.
