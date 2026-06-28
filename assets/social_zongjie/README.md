# 抖音 / 小红书点赞原文采集工具

该工具连接一个开启远程调试的专用 Edge 会话：

- 遍历抖音点赞视频，点击抖音页面自带 AI，输入“视频总结”并原样保存回答。
- 遍历抖音点赞图文，保存简介及正文图片的本地 OCR 原文。
- 遍历小红书点赞图文，保存正文及正文图片的本地 OCR 原文。
- 输出一个包含 `抖音内容`、`小红书图文`、`运行日志` 的 Excel。
- 每条内容在 Excel 中都保留可点击的原始链接。
- 不调用 OpenAI 或其他外部 AI 接口，不对图文文字做二次总结、改写或归纳。

## 首次设置

1. 安装项目依赖：

   ```powershell
   npm install
   ```

2. `npm install` 会自动把 `node_modules\@oai\artifact-tool` 连接到 Codex 工作区提供的 Excel 运行库。

3. 复制本地配置：

   ```powershell
   Copy-Item .env.example .env
   ```

4. 启动专用 Edge：

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\start-edge.ps1
   ```

5. 首次运行时，在打开的抖音和小红书页面中手动登录。不要关闭这个 Edge 窗口。

## 运行

两个平台各处理 20 条：

```powershell
npm start
```

模式一按指定数量采集，默认就是该模式：

```powershell
node src\cli.mjs --mode count --platform both --douyin-limit 10 --xhs-limit 15
```

模式二从桌面 `社媒总结` 文件夹读取时间最新的 Excel，用抖音和小红书各自第一条原始链接作为停止位置；没有第一条链接的平台只采集 10 条：

```powershell
node src\cli.mjs --mode since-latest-excel --platform both
```

小红书遍历到连续三轮滚动没有新内容：

```powershell
node src\cli.mjs --platform xhs --xhs-limit all
```

从上次桌面 `社媒总结\state.jsonl` 继续：

```powershell
node src\cli.mjs --platform both --resume
```

## 重要说明

- 遇到登录失效、验证码、访问频繁或风控时，对应平台停止，不绕过验证。
- 单条普通失败会写入 Excel 并继续下一条。
- OCR 图片只保存在系统临时目录，处理后无论成功失败都会删除。
- OCR 使用本机 Tesseract，不向外部服务上传图片或文字。
- 工具不会点赞、评论、关注、发布或修改账号设置。
- 页面改版可能导致抖音站内 AI 按钮或正文区域定位失效；错误原因会写入结果。
