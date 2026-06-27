# Social Media Liked Collector Skill

Codex skill for collecting liked/favorited Douyin and Xiaohongshu content with the local `social_zongjie` project.

## What It Does

- Uses the local `social_zongjie` Node.js tool as the execution project.
- Collects original liked-content text from Douyin and Xiaohongshu.
- Preserves clickable source links in the generated Excel workbook.
- Uses local Tesseract OCR for image text.
- Avoids external AI APIs and does not rewrite or summarize image-text content.

## Files

- `SKILL.md`: Codex skill instructions, workflow, safety boundaries, recovery notes, and verification commands.
- `agents/openai.yaml`: Skill display metadata for OpenAI/Codex agent surfaces.

## Requirements

- Local project: `C:\Users\Administrator\Desktop\code\social_zongjie`
- Node.js dependencies installed in that project with `npm install`
- Dedicated Edge session launched by `scripts\start-edge.ps1`
- Manual login to Douyin and Xiaohongshu in the dedicated Edge window
- Local Tesseract OCR with Chinese and English language data

## Safety Boundaries

The skill instructs Codex to stop rather than bypass login, CAPTCHA, rate limits, permission prompts, or platform risk-control screens. It also forbids liking, commenting, following, posting, messaging, uploading, changing account settings, or inspecting hidden private session data.

## Verification

Before claiming the workflow is ready, run the non-live tests from the `social_zongjie` project:

```powershell
npm test -- test\core.test.mjs test\processing.test.mjs test\excel.test.mjs test\artifact-link.test.mjs
```
