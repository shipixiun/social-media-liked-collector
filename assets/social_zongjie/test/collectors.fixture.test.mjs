import assert from "node:assert/strict";
import test from "node:test";

import { chromium } from "playwright";

import {
  collectDouyinCandidateLinks,
  extractDouyinMetadata,
  extractDouyinNote,
  findVisibleDouyinAiIcon,
  requestDouyinAiSummary,
} from "../src/douyin/collector.mjs";
import {
  closeXhsDetail,
  collectXhsCandidateLinks,
  detectXhsAccessBlock,
  extractXhsNote,
  openXhsDetail,
  processXhsCandidateWithAi,
  requestXhsDiandianAiAnswer,
  runXhsCollector,
} from "../src/xiaohongshu/collector.mjs";

const edgePath =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function withPage(run) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
  });
  const page = await browser.newPage();
  try {
    await run(page);
  } finally {
    await browser.close();
  }
}

test("collectDouyinCandidateLinks collects normalized video and note links", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div data-e2e="user-like-list">
        <a href="https://www.douyin.com/video/100?foo=bar">视频标题</a>
        <a href="https://www.douyin.com/note/200?track=1">图文标题</a>
      </div>
      <a href="https://example.com/not-content">忽略</a>
      <a href="https://www.douyin.com/video/999">推荐内容也忽略</a>
    `);
    const rows = await collectDouyinCandidateLinks(page, 2, {
      maxStagnantRounds: 1,
      scrollDelayMs: 1,
    });
    assert.deepEqual(rows, [
      {
        url: "https://www.douyin.com/video/100",
        accessUrl: "https://www.douyin.com/video/100?foo=bar",
        title: "视频标题",
      },
      {
        url: "https://www.douyin.com/note/200",
        accessUrl: "https://www.douyin.com/note/200?track=1",
        title: "图文标题",
      },
    ]);
  });
});


test("collectDouyinCandidateLinks stops before the latest Excel anchor link", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div data-e2e="user-like-list">
        <a href="https://www.douyin.com/video/100?foo=bar">新视频</a>
        <a href="https://www.douyin.com/note/200?track=1">历史第一条</a>
        <a href="https://www.douyin.com/video/300">更旧视频</a>
      </div>
    `);
    const rows = await collectDouyinCandidateLinks(page, "all", {
      stopUrl: "https://www.douyin.com/note/200",
      maxStagnantRounds: 1,
      scrollDelayMs: 1,
    });
    assert.deepEqual(rows.map((row) => row.url), [
      "https://www.douyin.com/video/100",
    ]);
  });
});
test("requestDouyinAiSummary opens AI, enters prompt, and returns stable answer", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <button id="ai-button" aria-label="AI助手">AI</button>
      <script>
        document.querySelector('#ai-button').addEventListener('click', () => {
          const aside = document.createElement('aside');
          aside.innerHTML = '<textarea placeholder="问问 AI"></textarea><div data-ai-answer></div>';
          document.body.appendChild(aside);
          const textarea = aside.querySelector('textarea');
          textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              aside.querySelector('[data-ai-answer]').textContent =
                '这是抖音 AI 返回的完整视频总结。';
            }
          });
        });
      </script>
    `);
    const answer = await requestDouyinAiSummary(page, {
      prompt: "视频总结",
      timeoutMs: 500,
      intervalMs: 5,
    });
    assert.equal(answer, "这是抖音 AI 返回的完整视频总结。");
  });
});

test("findVisibleDouyinAiIcon selects the icon inside the current viewport modal", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div class="modalPlayer" style="position:fixed;left:0;top:-1000px;width:800px;height:900px">
        <div id="offscreen-button">
          <svg viewBox="0 0 34 34"></svg>
        </div>
      </div>
      <div class="modalPlayer" style="position:fixed;left:0;top:0;width:800px;height:700px">
        <div id="visible-button">
          <svg viewBox="0 0 34 34" style="width:46px;height:46px"></svg>
        </div>
      </div>
      <script>
        window.clickedAi = '';
        document.querySelector('#offscreen-button').addEventListener(
          'click',
          () => window.clickedAi = 'offscreen',
        );
        document.querySelector('#visible-button').addEventListener(
          'click',
          () => window.clickedAi = 'visible',
        );
      </script>
    `);
    const icon = await findVisibleDouyinAiIcon(page);
    assert.ok(icon);
    await icon.click();
    assert.equal(await page.evaluate(() => window.clickedAi), "visible");
  });
});

test("extractDouyinNote reads only the active note caption and aweme images", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div class="modalPlayer" style="display:none">
        <img src="https://example.com/old-aweme-images.webp">
      </div>
      <div class="modalPlayer" style="width:900px;height:900px">
        <div>@作者甲 · 1天前</div>
        <div>图文</div>
        <div data-testid="note-caption">这是图文简介</div>
        <img src="https://example.com/avatar.jpeg" width="100" height="100">
        <img src="https://example.com/pcweb_cover.jpeg" width="900" height="1200">
        <img class="FC4GEoia" src="https://example.com/aweme-images-1.webp" width="900" height="1200">
        <img class="FC4GEoia" src="https://example.com/aweme-images-2.webp" width="900" height="1200">
      </div>
    `);
    const note = await extractDouyinNote(page);
    assert.equal(note.captionText, "这是图文简介");
    assert.deepEqual(note.imageUrls, [
      "https://example.com/aweme-images-1.webp",
      "https://example.com/aweme-images-2.webp",
    ]);
  });
});

test("extractDouyinMetadata prefers the liked-card title over unrelated page headings", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <h1>寻山海</h1>
      <div>@行研笔记 · 7小时前</div>
      <div data-e2e="video-desc">基金入门：主动与被动一条看懂</div>
    `);
    const metadata = await extractDouyinMetadata(page, {
      url: "https://www.douyin.com/video/100",
      title: "136\n\n基金入门：主动/被动/股/债/混合？一条看懂",
    });
    assert.equal(
      metadata.title,
      "基金入门：主动/被动/股/债/混合？一条看懂",
    );
    assert.equal(metadata.author, "@行研笔记");
    assert.equal(metadata.publishedAt, "7小时前");
  });
});

test("extractXhsNote returns metadata and only likely content images", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <main>
        ${"<img src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' />".repeat(20)}
      </main>
      <div class="note-container" style="width:900px;height:900px">
        <div class="title">测试图文标题</div>
        <span class="username">作者甲</span>
        <div class="desc">正文第一段</div>
        <div class="comments-container">
          评论中的安全验证、验证码和其他无关文字
        </div>
        <img src="https://sns-avatar.xhscdn.com/avatar/a.webp" width="50" height="50">
        <img src="https://sns-webpic.xhscdn.com/notes_pre_post/1.webp" width="1080" height="1440">
        <img src="https://sns-webpic.xhscdn.com/notes_pre_post/2.webp" style="position:absolute;left:2000px;width:600px;height:900px">
      </div>
    `);
    const note = await extractXhsNote(page);
    assert.equal(note.title, "测试图文标题");
    assert.equal(note.author, "作者甲");
    assert.equal(note.captionText, "正文第一段");
    assert.deepEqual(note.imageUrls, [
      "https://sns-webpic.xhscdn.com/notes_pre_post/1.webp",
      "https://sns-webpic.xhscdn.com/notes_pre_post/2.webp",
    ]);
    assert.equal(note.kind, "image-text");
  });
});

test("openXhsDetail and closeXhsDetail reuse the liked page", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <a class="cover" href="/user/profile/u1/abc">打开笔记</a>
      <script>
        document.querySelector('.cover').addEventListener('click', (event) => {
          event.preventDefault();
          const detail = document.createElement('div');
          detail.className = 'note-container';
          detail.innerHTML =
            '<button class="close-icon" style="position:fixed;left:2000px;top:20px"></button>' +
            '<button class="close-circle"></button><div class="title">标题</div>';
          document.body.appendChild(detail);
          detail.querySelector('.close-circle').addEventListener('click', () => {
            detail.remove();
          });
        });
      </script>
    `);
    page.setDefaultTimeout(500);
    const pageCount = page.context().pages().length;
    await openXhsDetail(page, {
      url: "https://www.xiaohongshu.com/explore/abc",
      accessUrl: "https://www.xiaohongshu.com/user/profile/u1/abc",
    });
    assert.equal(page.context().pages().length, pageCount);
    assert.equal(await page.locator(".note-container").count(), 1);
    await closeXhsDetail(page);
    assert.equal(await page.locator(".note-container").count(), 0);
  });
});

test("openXhsDetail scrolls the liked page until a virtualized card appears", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div style="height:3000px">虚拟列表占位</div>
      <script>
        addEventListener('scroll', () => {
          if (document.querySelector('.cover')) return;
          const card = document.createElement('a');
          card.className = 'cover';
          card.href = '/user/profile/u1/later';
          card.textContent = '稍后加载的笔记';
          card.addEventListener('click', (event) => {
            event.preventDefault();
            const detail = document.createElement('div');
            detail.className = 'note-container';
            detail.innerHTML =
              '<button class="close-circle"></button><div class="title">标题</div>';
            document.body.appendChild(detail);
          });
          document.body.appendChild(card);
        });
      </script>
    `);
    await openXhsDetail(page, {
      url: "https://www.xiaohongshu.com/explore/later",
      accessUrl: "https://www.xiaohongshu.com/user/profile/u1/later",
    });
    assert.equal(await page.locator(".note-container").count(), 1);
  });
});

test("detectXhsAccessBlock tolerates a captcha layer that disappears", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div id="captcha" class="captcha">安全验证</div>
      <script>
        setTimeout(() => document.querySelector('#captcha').remove(), 50);
      </script>
    `);
    const block = await detectXhsAccessBlock(page, {
      captchaWaitMs: 500,
      intervalMs: 20,
    });
    assert.equal(block, null);
  });
});

test("detectXhsAccessBlock ignores captcha words inside comments", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div class="comments-container">
        评论：无法收到验证码，安全验证有问题
      </div>
    `);
    assert.equal(await detectXhsAccessBlock(page), null);
  });
});

test("collectXhsCandidateLinks keeps original access URLs and canonical links", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <a href="https://www.xiaohongshu.com/explore/abc?xsec_token=secret">图文一</a>
      <a href="https://www.xiaohongshu.com/user/profile/u1/def?xsec_source=pc_like">图文二</a>
    `);
    const rows = await collectXhsCandidateLinks(page, 2, {
      maxStagnantRounds: 1,
      scrollDelayMs: 1,
    });
    assert.deepEqual(rows, [
      {
        url: "https://www.xiaohongshu.com/explore/abc",
        accessUrl:
          "https://www.xiaohongshu.com/explore/abc?xsec_token=secret",
        title: "图文一",
      },
      {
        url: "https://www.xiaohongshu.com/explore/def",
        accessUrl:
          "https://www.xiaohongshu.com/user/profile/u1/def?xsec_source=pc_like",
        title: "图文二",
      },
    ]);
  });
});


test("collectXhsCandidateLinks stops before the latest Excel anchor link", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <a href="https://www.xiaohongshu.com/explore/new-one?xsec_token=secret">新图文</a>
      <a href="https://www.xiaohongshu.com/user/profile/u1/old-one?xsec_source=pc_like">历史第一条</a>
      <a href="https://www.xiaohongshu.com/explore/older-one">更旧图文</a>
    `);
    const rows = await collectXhsCandidateLinks(page, "all", {
      stopUrl: "https://www.xiaohongshu.com/explore/old-one",
      maxStagnantRounds: 1,
      scrollDelayMs: 1,
    });
    assert.deepEqual(rows.map((row) => row.url), [
      "https://www.xiaohongshu.com/explore/new-one",
    ]);
  });
});
test("collectXhsCandidateLinks waits through initially empty liked grids", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <main id="grid"></main>
      <script>
        setTimeout(() => {
          const anchor = document.createElement('a');
          anchor.href = 'https://www.xiaohongshu.com/explore/delayed?xsec_token=secret';
          anchor.textContent = '延迟加载的笔记';
          document.querySelector('#grid').appendChild(anchor);
        }, 300);
      </script>
    `);
    const rows = await collectXhsCandidateLinks(page, 1, {
      maxStagnantRounds: 2,
      maxInitialEmptyRounds: 10,
      scrollDelayMs: 100,
    });
    assert.deepEqual(rows, [
      {
        url: "https://www.xiaohongshu.com/explore/delayed",
        accessUrl:
          "https://www.xiaohongshu.com/explore/delayed?xsec_token=secret",
        title: "延迟加载的笔记",
      },
    ]);
  });
});

test("requestXhsDiandianAiAnswer opens Diandian AI, submits a link, and returns the latest answer", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <nav>
        <button id="diandian">点点 ai</button>
      </nav>
      <script>
        document.querySelector('#diandian').addEventListener('click', () => {
          const aside = document.createElement('aside');
          aside.setAttribute('data-testid', 'diandian-ai-panel');
          aside.innerHTML = '<textarea placeholder="发给点点 ai"></textarea><div class="messages"></div>';
          document.body.appendChild(aside);
          const textarea = aside.querySelector('textarea');
          textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const message = document.createElement('div');
              message.className = 'ai-answer';
              message.textContent = '这是点点 AI 对链接的总结。';
              aside.querySelector('.messages').appendChild(message);
            }
          });
        });
      </script>
    `);
    const answer = await requestXhsDiandianAiAnswer(
      page,
      { url: "https://www.xiaohongshu.com/explore/abc" },
      { timeoutMs: 500, intervalMs: 5 },
    );
    assert.equal(answer, "这是点点 AI 对链接的总结。");
  });
});

test("requestXhsDiandianAiAnswer ignores the page search box before opening Diandian AI", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <input id="search" placeholder="搜索小红书">
      <nav>
        <button id="diandian">点点 ai</button>
      </nav>
      <script>
        window.searchValue = '';
        document.querySelector('#search').addEventListener('keydown', (event) => {
          if (event.key === 'Enter') window.searchValue = event.target.value;
        });
        document.querySelector('#diandian').addEventListener('click', () => {
          const aside = document.createElement('aside');
          aside.setAttribute('data-testid', 'diandian-ai-panel');
          aside.innerHTML = '<textarea placeholder="发给点点 ai"></textarea><div class="messages"></div>';
          document.body.appendChild(aside);
          const textarea = aside.querySelector('textarea');
          textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const message = document.createElement('div');
              message.className = 'ai-answer';
              message.textContent = '点点已读取链接。';
              aside.querySelector('.messages').appendChild(message);
            }
          });
        });
      </script>
    `);
    const answer = await requestXhsDiandianAiAnswer(
      page,
      { url: "https://www.xiaohongshu.com/explore/abc" },
      { timeoutMs: 500, intervalMs: 5 },
    );
    assert.equal(answer, "点点已读取链接。");
    assert.equal(await page.evaluate(() => window.searchValue), "");
  });
});

test("requestXhsDiandianAiAnswer does not treat global ai-layout search as Diandian input", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div id="app" class="ai-layout-active">
        <input id="search" class="search-input" placeholder="搜索或输入任何问题">
        <a class="link-wrapper" href="/ai_chat?from=sidebar">点点<span>ai</span></a>
      </div>
      <script>
        window.searchValue = '';
        document.querySelector('#search').addEventListener('keydown', (event) => {
          if (event.key === 'Enter') window.searchValue = event.target.value;
        });
        document.querySelector('a.link-wrapper').addEventListener('click', (event) => {
          event.preventDefault();
          document.body.innerHTML = '<textarea class="textarea" placeholder="问问点点"></textarea><div class="messages"></div>';
          const textarea = document.querySelector('textarea');
          textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const message = document.createElement('div');
              message.className = 'ai-answer';
              message.textContent = '点点真正收到链接。';
              document.querySelector('.messages').appendChild(message);
            }
          });
        });
      </script>
    `);
    const answer = await requestXhsDiandianAiAnswer(
      page,
      { url: "https://www.xiaohongshu.com/explore/abc" },
      { timeoutMs: 500, intervalMs: 5 },
    );
    assert.equal(answer, "点点真正收到链接。");
    assert.equal(await page.evaluate(() => window.searchValue), "");
  });
});

test("requestXhsDiandianAiAnswer prefers the real ai_chat sidebar link over inert 点点 text", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <button id="inert">点点 ai</button>
      <a class="link-wrapper" href="/ai_chat?from=sidebar">点点<span>ai</span></a>
      <script>
        document.querySelector('#inert').addEventListener('click', () => {
          window.clickedInert = true;
        });
        document.querySelector('a.link-wrapper').addEventListener('click', (event) => {
          event.preventDefault();
          document.body.innerHTML = '<textarea class="textarea" placeholder="问问点点"></textarea><div class="messages"></div>';
          const textarea = document.querySelector('textarea');
          textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const message = document.createElement('div');
              message.className = 'ai-answer';
              message.textContent = '真实点点 AI 回答';
              document.querySelector('.messages').appendChild(message);
            }
          });
        });
      </script>
    `);
    const answer = await requestXhsDiandianAiAnswer(
      page,
      { url: "https://www.xiaohongshu.com/explore/abc" },
      { timeoutMs: 500, intervalMs: 5 },
    );
    assert.equal(answer, "真实点点 AI 回答");
    assert.equal(await page.evaluate(() => window.clickedInert || false), false);
  });
});

test("processXhsCandidateWithAi stores a successful Diandian AI answer", async () => {
  const row = await processXhsCandidateWithAi(
    { url: "https://www.xiaohongshu.com/explore/abc", title: "卡片标题" },
    { requestAi: async (url) => `回答 ${url}` },
  );
  assert.equal(row.platform, "xiaohongshu");
  assert.equal(row.contentId, "abc");
  assert.equal(row.type, "链接");
  assert.equal(row.title, "卡片标题");
  assert.equal(row.aiSummary, "回答 https://www.xiaohongshu.com/explore/abc");
  assert.equal(row.status, "success");
  assert.equal(row.error, "");
});

test("runXhsCollector sends liked links directly to Diandian AI", async () => {
  await withPage(async (page) => {
    await page.route(
      "https://www.xiaohongshu.com/user/profile/60abbbe10000000001003c44?tab=liked",
      async (route) => {
        await route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `
            <nav><button id="diandian">点点 ai</button></nav>
            <main>
              <a class="cover" href="https://www.xiaohongshu.com/explore/abc?xsec_token=one">图文一</a>
              <a class="cover" href="https://www.xiaohongshu.com/explore/video123?xsec_token=two">视频一</a>
            </main>
            <script>
              document.querySelector('#diandian').addEventListener('click', () => {
                if (document.querySelector('aside')) return;
                const aside = document.createElement('aside');
                aside.innerHTML = '<textarea placeholder="发给点点 ai"></textarea><div class="messages"></div>';
                document.body.appendChild(aside);
                const textarea = aside.querySelector('textarea');
                textarea.addEventListener('keydown', (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const message = document.createElement('div');
                    message.className = 'ai-answer';
                    message.textContent = '总结 ' + textarea.value;
                    aside.querySelector('.messages').appendChild(message);
                  }
                });
              });
            </script>
          `,
        });
      },
    );
    const rows = [];
    const stateStore = {
      has: async () => false,
      append: async (row) => rows.push(row),
    };
    await runXhsCollector({
      context: page.context(),
      listPage: page,
      limit: 2,
      stateStore,
      resume: false,
      config: {},
    });
    assert.deepEqual(rows.map((row) => row.contentId), ["abc", "video123"]);
    assert.deepEqual(rows.map((row) => row.status), ["success", "success"]);
    assert.match(rows[0].aiSummary, /explore\/abc/);
    assert.match(rows[1].aiSummary, /explore\/video123/);
  });
});
