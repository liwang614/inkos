# AI Change Log

本文件记录由 AI 协助完成的代码 / 配置改动，**按时间倒序**（最新在最上）。
区别于正式发布日志 `CHANGELOG.md`（按版本号组织）——本文件面向"后续接手的 AI / 开发者"，记录每次改动的动机、涉及文件、行为变化和验证情况。

## 如何续写本文件（给后续 AI）

- 在下方 `---` 分隔线**上方**插入新条目，保持最新在最上。
- 每条用如下模板：

```
## YYYY-MM-DD 一句话标题

**动机**：为什么改。
**改动**：
- `文件路径` — 改了什么。
**配置**：涉及的项目/书籍配置变更（如有）。
**验证**：测试 / 编译 / 实际运行结果。
**遗留 / 注意**：已知问题、备份位置等。
```

- 只记"非显而易见"的信息（动机、坑、验证结论），不要复述能从 git diff 直接看出的逐行细节。

---

## 2026-05-31 《夜血同盟》第2章排查：根因=opus-4-8 不守输出协议，换 gpt-5.5 解决；normalizer 改动为防御性、可回退

**动机**：用户让查看 `vampire-gang-short/`（书《夜血同盟》，book-id `夜血同盟`）。第2章是 `state-degraded`：正文开头泄漏 `CHAPTER_TITLE/CHAPTER_CONTENT` 脚手架文本；`current_state.md`/`pending_hooks.md` 一直是空占位 `(未更新)`；跨章连续性漂移（名单"末位=三年前下葬之人"这条压轴钩子反复被写错）。

**根因（已确认）**：写作模型是本地代理（`http://127.0.0.1:8317/v1`）的 `claude-opus-4-8`，它不遵守 InkOS 输出协议——StateValidator 要求"第一行恰好 PASS/FAIL"、ContinuityAuditor 要求纯 JSON，该模型却返回 markdown 小作文（开头"I'll validate Chapter 2..."）。引擎解析失败 → 每行被塞成 warning → `state-degraded`、真相文件空占位、`audit` 恒返回 FAILED+空摘要。对照：上一个 AI 在 `test-project`/《雾港无明日》用 `gpt-5.5` + `inkos draft` 没遇到（`draft` 只走"写稿+字数归一化"，不跑 StateValidator；且 gpt-5.5 守格式）。

**改动**：
- **真正的修复（配置）** `vampire-gang-short/.env`：`INKOS_LLM_MODEL` 由 `claude-opus-4-8` → `gpt-5.5`。换后 `write next` 重跑第2章：state-degraded 消失、真相文件正确填充（详实状态表 + H1–H10 伏笔账本）、审计返回规范结构化 issue。
- **防御性代码改动（非必需，gpt-5.5 下用不到，可回退）** `packages/core/src/agents/length-normalizer.ts`：归一化器输出若含裸 `CHAPTER_CONTENT` 标记则取其后正文；`isWrapperLine` 增补剥离裸 `CHAPTER_TITLE/CHAPTER_CONTENT/PRE_WRITE_CHECK` 标记与"压缩/扩写…"前言（writer-parser 的 `=== TAG ===` 正则抓不到裸标记）。+ 回归测试 `packages/core/src/__tests__/length-normalizer.test.ts` 用例 `strips leaked bare CHAPTER_TITLE/CHAPTER_CONTENT markers and the compression preamble`。
- **数据修复** `books/夜血同盟/story/state/`：反复删/重跑攒下状态不一致（`current_state.json.chapter=2` 但 `manifest.lastAppliedChapter=1` → persist 报错 `current_state_ahead_of_manifest@currentState.chapter`）。把 `current_state.json.chapter` 复位为 1、`chapter_summaries.json` 删掉残留的第2章行后，gpt-5.5 重跑成功。
- **正文** `books/夜血同盟/chapters/0002_冷库里的血账.md`：gpt-5.5 + `--context`（手动钉回：末位=三年前亲手送葬之人且债额留白、第3行双头带冠鸟纹章、账本=整本随身账本不是撕下单页、周聿排第2行）重写。状态 `ready-for-review`，2 条 craft warning（中段过早揭"血族/停战"全知设定；周聿名字章尾"暗下"易让读者误判已死），无 critical。

**配置变更**：`vampire-gang-short/.env` 的 `INKOS_LLM_MODEL`：`claude-opus-4-8` → `gpt-5.5`（同一本地代理）。

**验证**：`npx vitest run src/__tests__/length-normalizer.test.ts` → 11 passed；`npm run build`（@actalk/inkos-core）通过；`inkos doctor` API Connectivity OK (model gpt-5.5)；gpt-5.5 重跑 `write next` 第2章正文 grep 无任何脚手架标记、真相文件填充正常、审计 issue 可解析。

**遗留 / 注意（含回退指引）**：
- **本书现固定用 gpt-5.5**；不要再用本地代理的 `claude-opus-4-8` 跑 `write next` 全管线（会复发 state-degraded）。
- normalizer 代码改动如需回退（gpt-5.5 下并不需要）：
  ```bash
  git checkout packages/core/src/agents/length-normalizer.ts packages/core/src/__tests__/length-normalizer.test.ts
  cd packages/core && npm run build
  ```
  这两个文件本次会话之前是干净的 baseline，`git checkout` 即完全还原。
- 旧第2章稿（opus 手工修正版 + 3 个坏稿 .bak）已按用户要求删除，**无法回退到那些版本**；当前 gpt-5.5 版《冷库里的血账》是唯一保留版。
- ch1 的结构化 facts 在 opus 时期是空的（`current_state.json.facts=[]`），"末位=三年前下葬之人"等钩子未入库；ch2 已靠 context 钉回。若要更稳，可用 gpt-5.5 跑 `write rewrite 夜血同盟 1` 重建 ch1 状态（注意：rewrite 需要 `snapshots/1`，本书缺，可能需手动处理或改走"删ch1+write next"）。

---

## 2026-05-31 重置「雾港无明日」到 0 章干净态（保留设定，清除旧 20 章遗留）

**动机**：旧 20 章运行残留持续污染新章——审计反复报「知识库污染 / 伏笔账本污染」（`current_focus.md` 还写"前8章已完成…南音梦境、林栖结盟"，`memory.db` 含旧叙事记忆，旧快照 9–12 等）。用户决定：保留故事设定，清掉所有正文遗留，从第 1 章重新开始写同一个故事。

**做法**（纯文件操作，无代码改动；参考引擎 `runner.ts:resetImportReplayTruthFiles` 的"派生状态"清单，但偏离两处以保护设定）：
- 备份整本 → `test-project/_backups/xing-hai-hui-sheng_precleanup_20260531_024511`。
- 清空 `chapters/`（删正文 .md，`index.json` 置 `[]`）。
- `current_state.md` / `pending_hooks.md` ← 还原为 `snapshots/0` 的干净初始态。
- 删 `current_focus.md`（`ensureControlDocuments` 会用 `defaultCurrentFocus` 自动重建干净版）。
- 删派生累积文件 `chapter_summaries.md` / `subplot_board.md` / `emotional_arcs.md` / `audit_drift.md`（runner 读取处均 `.catch(()=>"")`，缺省当空，写章时重建）。
- 删 `memory.db`(+shm/wal) 与 `story/state/`（写章时从 markdown 重建）。
- 删旧快照 9–12（**保留 `snapshots/0`** 以便将来 `write rewrite 1`）；清空 `story/runtime/`。

**保留（设定，未动）**：`story_bible.md` / `book_rules.md` / `volume_outline.md` / `brief.md` / `style_guide.md` / `author_intent.md` / `character_matrix.md` / `story/outline/` / `story/roles/`。

**注意（给后续 AI）**：
- `write rewrite` **不**清 `memory.db` / `current_focus.md` / `story/state/`，所以单纯 rewrite 会留遗留；真要干净重来需按上面手动清。
- 引擎的 `resetImportReplayTruthFiles` 会删 `character_matrix.md` 和整个 `snapshots/`——本次**故意没用它**，以保住角色设定和快照 0。

---

## 2026-05-31 章节字数策略：放弃"硬上限+压缩"，改用"低下限"（最终决定）

**结论先行**：本次**没有保留任何字数相关的代码改动**——加上限配置 + 归一化循环压缩的方案被用户否决并已**全部还原到 baseline**。当前只改了本书配置：下限 1200、不设上限。

**走过的弯路（给后续 AI：不要重复）**：
- 曾尝试新增 `maxChapterWordCount` 上限配置 + 让 `normalizeDraftLengthIfNeeded` 循环压缩，把章节卡进 2200–2900。
- 实测失败：模型**初稿天然就奔着 ~3700–3900 字写**（瞄准 2550 也照样写 3927），事后压缩到 ~3127 就平台期、压不下去；而且**事后压缩正文本身就在破坏叙事节奏**。
- 用户明确认同写作 prompt 的原则（`writer-prompts.ts:242`「章节结构优先于字数，宁可超字数也不卡节奏」），所以"写完再砍"方向错误，已撤销。

**用户的判断（采纳）**：真正病灶是**下限定太高 → 模型为达标把太多情节塞进一章**。对策是**降低下限、取消上限**，让模型每章少装剧情、自然写短，而不是事后压。

**最终改动**：
- 代码：无（`project.ts` / `length-metrics.ts` / `runner.ts` / `cli/utils.ts` / `studio/server.ts` / `config.ts` 及相关测试全部还原 baseline；`minChapterWordCount` schema 默认值也还原为 `0`）。
- 配置 `test-project/inkos.json`：`writing.minChapterWordCount = 1200`，**不设** `maxChapterWordCount`。
- 配置 `test-project/books/xing-hai-hui-sheng/book.json`：`chapterWordCount` 还原为 `2500`。

**验证**：`length-metrics.test.ts` / `models.test.ts` 全过；core+cli 编译通过。注意 `pipeline-runner.test.ts` 有 4 个**预先存在**失败（SQLite 实验特性 / planner v2 递归 spy），与本会话无关（已 `git stash` 在 baseline 复现）。

**待观察**：降下限到 1200 后，模型实际写出的字数是否变短/稳定，需要重写几章观察。（注：技术上下限 1200 < 目标 2500，下限并不直接顶高目标；这是用户要验证的假设。）

**遗留 / 注意**：
- 旧版第 13–20 章过短（771–942 字）已通过 `write rewrite 1` 从快照 0 清空重写（故事设定保留）；当前正文只剩重写过的第 1 章。
- 整本旧稿备份：`test-project/_backups/xing-hai-hui-sheng_20260531_011520`。
- `write rewrite` 只删 `.md`；旧版遗留的 `0020_无明日之门.txt` 已手动清除。

---
