# AI 写作执行指南

这份文档给后续接手的 AI 使用，目标是让它清楚如何在本项目里继续写小说、检查状态、导出稿件，并避免误用 API 或破坏 InkOS 状态。

## 项目位置

写作项目根目录：

```powershell
D:\inkos_write\test-project
```

当前小说：

- 书名：雾港无明日
- InkOS book-id：`xing-hai-hui-sheng`
- 书籍目录：`books\xing-hai-hui-sheng`
- 正文章节：`books\xing-hai-hui-sheng\chapters`
- 章节索引：`books\xing-hai-hui-sheng\chapters\index.json`
- 设定/真相文件：`books\xing-hai-hui-sheng\story`

重要：继续写作时使用 book-id，不要随意改目录名。

```powershell
inkos status xing-hai-hui-sheng
```

## API 配置

项目级 API 配置文件：

```powershell
D:\inkos_write\test-project\.env
```

不要把 API Key 输出到聊天或日志。只用 `inkos doctor` 检查连通性：

```powershell
cd D:\inkos_write\test-project
inkos doctor
```

当前项目曾验证通过的模式是 OpenAI-compatible endpoint。实际 `.env` 里应包含类似字段：

```env
INKOS_LLM_PROVIDER=openai
INKOS_LLM_BASE_URL=http://127.0.0.1:8317/v1
INKOS_LLM_API_KEY=...
INKOS_LLM_MODEL=gpt-5.5
INKOS_LLM_API_FORMAT=chat
INKOS_LLM_STREAM=true
```

如果 API 连接报错，先修 `.env`，不要改小说文件。

## 每次写作前必须读取

后续 AI 续写前，至少查看这些文件：

```powershell
Get-Content -Raw books\xing-hai-hui-sheng\book.json
Get-Content -Raw books\xing-hai-hui-sheng\story\author_intent.md
Get-Content -Raw books\xing-hai-hui-sheng\story\current_focus.md
Get-Content -Raw books\xing-hai-hui-sheng\story\current_state.md
Get-Content -Raw books\xing-hai-hui-sheng\story\pending_hooks.md
Get-Content -Raw books\xing-hai-hui-sheng\chapters\index.json
```

还要读最近 2-3 章正文，确认剧情承接：

```powershell
Get-Content -Raw books\xing-hai-hui-sheng\chapters\0009_缺失的七秒.md
Get-Content -Raw books\xing-hai-hui-sheng\chapters\0010_倒置回传.md
```

## 推荐续写方式

之前流式写作出现过 EOF，所以优先使用 `--no-stream`。

写一章草稿：

```powershell
cd D:\inkos_write\test-project
inkos --no-stream draft xing-hai-hui-sheng --words 1800 --context "续写《雾港无明日》下一章。保持科幻悬疑、证据驱动、短段落移动端节奏；每章解决一个局部谜题并打开更深谜题；不要提前揭开叶闻秋完整状态。" --json
```

如果用户要求完整审稿修订管线，可用：

```powershell
inkos --no-stream write next xing-hai-hui-sheng --count 1 --words 1800 --context "本章重点说明..." --json
```

但 `write next` 比 `draft` 更慢、更耗 token。除非用户明确要求审稿修订，优先用 `draft`。

## 批量写作建议

不要一次性盲目跑很多章，容易长时间占用 API，也不利于发现中途失败。

推荐节奏：

1. 写 1 章。
2. 检查 `inkos status` 和 `chapters\index.json`。
3. 读新章开头/结尾，确认没有跑偏。
4. 再写下一章。

检查当前章节数：

```powershell
inkos status xing-hai-hui-sheng
```

列出最新章节文件：

```powershell
Get-ChildItem books\xing-hai-hui-sheng\chapters | Sort-Object Name | Select-Object -Last 8 Name,Length,LastWriteTime
```

## 导出稿件

写完或阶段性完成后，重新导出：

```powershell
inkos export xing-hai-hui-sheng --format md --output .\wu-gang-wu-ming-ri.md
inkos export xing-hai-hui-sheng --format txt --output .\wu-gang-wu-ming-ri.txt
```

导出文件位置：

```powershell
D:\inkos_write\test-project\wu-gang-wu-ming-ri.md
D:\inkos_write\test-project\wu-gang-wu-ming-ri.txt
```

## 番茄小说粘贴版导出

InkOS 默认章节和导出文件使用 Markdown 段落格式，段落之间会有空行。复制到番茄小说编辑器时，这些空行会被保留，造成正文段间距过大。

给番茄使用时，不要直接复制 `wu-gang-wu-ming-ri.txt`，先运行专用导出：

```powershell
cd D:\inkos_write\test-project
.\scripts\export-fanqie.ps1
```

输出位置：

```powershell
D:\inkos_write\test-project\fanqie\wu-gang-wu-ming-ri.txt
D:\inkos_write\test-project\fanqie\chapters\
```

这个版本会：

- 删除段落之间的空行。
- 删除章节标题前的 Markdown `#`。
- 保留每段一行，适合直接复制到番茄小说编辑器。

## 当前剧情方向

当前第一卷阶段目标：

- 向天井据点暴露。
- 林定川与“第一道命令”的责任继续发酵。
- 江砚和林栖出现信任裂痕，但不要立刻拆散同盟。
- 南音的梦境采样能力要持续成为证据链，而不是单纯预言工具。
- 白塔围捕要逐步升级。
- 叶闻秋仍是核心悬念，第一卷内只能逐步确认其影响，不能提前完全揭开她的完整状态。

写作风格：

- 科幻悬疑。
- 证据驱动。
- 短段落，移动端可读。
- 少解释，多用现场、记录、仪器读数、对话和行动推进。
- 每章至少推进一个事实、一个人物关系变化、一个伏笔状态。

## 常见问题

### `inkos doctor` 卡住或超时

先用短请求或等待重试。多数情况是 endpoint 慢，不要立刻改书。

### `draft` 中途失败但没有新章节

检查章节数：

```powershell
inkos status xing-hai-hui-sheng
```

如果章节数没增加，说明没有落盘，可以重试同一章。优先加 `--no-stream`。

### 有 runtime 文件但没有章节正文

这说明计划/上下文生成成功，但正文或状态结算失败。可以直接重试 `draft`，InkOS 会继续按下一章准备。

### 字数超出 hard range

InkOS 会在 `index.json` 里记录 `lengthWarnings`。轻微超出可接受；如果用户要求严格字数，再单独修订该章。
本项目已设置 `writing.minChapterWordCount = 1500`，后续生成低于 1500 字会触发扩写归一化。

## 禁止事项

- 不要把 `.env` 内容或 API Key 输出给用户。
- 不要用 `git reset --hard`、`git checkout --` 回滚用户文件。
- 不要手动改 `chapters\index.json` 来假装章节完成。
- 不要随意删除 `story\state`、`story\runtime`、`story\snapshots`。
- 不要改 book-id 或目录名，除非用户明确要求并同步迁移所有引用。
- 不要在未经用户同意的情况下启动长时间后台批量写作。

## 如果用户要求“写到 20 章”

当前做法应该是逐章推进，直到 `inkos status` 显示：

```text
Chapters: 20 / 120
```

每章推荐命令：

```powershell
inkos --no-stream draft xing-hai-hui-sheng --words 1800 --context "续写《雾港无明日》下一章。围绕第一卷主线推进：向天井暴露、林定川第一道命令、南音梦境采样、白塔围捕、江砚与林栖信任裂痕。保持科幻悬疑、证据驱动、短段落移动端节奏；不要提前揭开叶闻秋完整状态。" --json
```

完成后必须验证并导出：

```powershell
inkos status xing-hai-hui-sheng
inkos export xing-hai-hui-sheng --format md --output .\wu-gang-wu-ming-ri.md
inkos export xing-hai-hui-sheng --format txt --output .\wu-gang-wu-ming-ri.txt
```
