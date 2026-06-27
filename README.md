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

---

# 社交媒体点赞内容采集 Skill

这是一个 Codex skill，用于配合本地 `social_zongjie` 项目采集抖音和小红书点赞/收藏内容，并导出为 Excel。

## 功能

- 使用本地 `social_zongjie` Node.js 项目作为执行工具。
- 采集抖音和小红书点赞内容的原文信息。
- 在生成的 Excel 中保留可点击的原始链接。
- 使用本机 Tesseract OCR 识别图片文字。
- 不调用外部 AI 接口，也不对图文内容进行二次总结、改写或归纳。

## 文件

- `SKILL.md`：Codex skill 的工作流、安全边界、恢复说明和验证命令。
- `agents/openai.yaml`：面向 OpenAI/Codex agent 界面的展示元数据。

## 运行要求

- 本地项目路径：`C:\Users\Administrator\Desktop\code\social_zongjie`
- 已在该项目中通过 `npm install` 安装依赖。
- 已通过 `scripts\start-edge.ps1` 启动专用 Edge 会话。
- 已在专用 Edge 窗口中手动登录抖音和小红书。
- 本机已安装 Tesseract OCR，并包含中文和英文语言数据。

## 安全边界

该 skill 会要求 Codex 在遇到登录、验证码、权限提示、访问频率限制或平台风控页面时停止，而不是尝试绕过。它也禁止点赞、评论、关注、发布、私信、上传、修改账号设置，或检查隐藏的私有会话数据。

## 验证

在确认工作流可用前，从 `social_zongjie` 项目目录运行不依赖线上平台的测试：

```powershell
npm test -- test\core.test.mjs test\processing.test.mjs test\excel.test.mjs test\artifact-link.test.mjs
```
