import { describe, expect, it } from "vitest";
import {
  buildGovernedCharacterMatrixWorkingSet,
  buildGovernedHookWorkingSet,
  mergeTableMarkdownByKey,
} from "../utils/governed-working-set.js";

describe("mergeTableMarkdownByKey placeholder semantics", () => {
  const pool = [
    "| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 备注 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| H_Model_Poison | 1 | 核心线索 | progressing | 9 | 反击构陷 | 投毒链 |",
    "| H_Chen_Missing | 2 | 支线悬念 | progressing | 7 | 卷二 | 陈默失踪 |",
  ].join("\n");

  it("preserves the original pool when the update is a placeholder (no wipe)", () => {
    const merged = mergeTableMarkdownByKey(pool, "(伏笔池未更新)", [0]);
    expect(merged).toContain("H_Model_Poison");
    expect(merged).toContain("H_Chen_Missing");
    expect(merged).not.toContain("伏笔池未更新");
  });

  it("preserves the original pool when the update is empty or non-table prose", () => {
    expect(mergeTableMarkdownByKey(pool, "", [0])).toContain("H_Model_Poison");
    expect(mergeTableMarkdownByKey(pool, "本章没有改动伏笔。", [0])).toContain("H_Chen_Missing");
  });

  it("preserves the original pool when the update is a header-only table with no data rows", () => {
    const headerOnly = [
      "| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 备注 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ].join("\n");
    const merged = mergeTableMarkdownByKey(pool, headerOnly, [0]);
    expect(merged).toContain("H_Model_Poison");
    expect(merged).toContain("H_Chen_Missing");
  });

  it("still upserts new rows and updates existing rows on a real table update", () => {
    const update = [
      "| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 备注 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| H_Model_Poison | 1 | 核心线索 | resolved | 10 | 已回收 | 投毒链闭环 |",
      "| H_New_Lead | 10 | 新线索 | open | 10 | 待定 | 第10章新增 |",
    ].join("\n");
    const merged = mergeTableMarkdownByKey(pool, update, [0]);
    expect(merged).toContain("H_New_Lead");
    expect(merged).toContain("resolved");
    expect(merged).toContain("H_Chen_Missing"); // untouched row survives
  });

  it("adopts the new table when there is no prior table (first creation)", () => {
    const created = [
      "| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 备注 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| H_First | 1 | 线索 | open | 1 | 待定 | 首个伏笔 |",
    ].join("\n");
    expect(mergeTableMarkdownByKey("(文件尚未创建)", created, [0])).toContain("H_First");
  });
});

describe("governed-working-set", () => {
  it("filters out far-future hooks from the governed hook working set", () => {
    const hooks = [
      "| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 备注 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| opening-call | 1 | mystery | open | 0 | 8 | 匿名来电开篇出现 |",
      "| nearby-ledger | 4 | evidence | open | 0 | 12 | 近期开启的账本线 |",
      "| future-pr-machine | 22 | conspiracy | open | 0 | 60 | 远期舆情操盘线 |",
      "| future-template | 45 | system | open | 0 | 80 | 远期系统性话术线 |",
    ].join("\n");

    const filtered = buildGovernedHookWorkingSet({
      hooksMarkdown: hooks,
      contextPackage: {
        chapter: 1,
        selectedContext: [
          {
            source: "story/pending_hooks.md#opening-call",
            reason: "Current chapter opening hook.",
            excerpt: "mystery | open | 8 | 匿名来电开篇出现",
          },
        ],
      },
      chapterNumber: 1,
      language: "zh",
    });

    expect(filtered).toContain("opening-call");
    expect(filtered).toContain("nearby-ledger");
    expect(filtered).not.toContain("future-pr-machine");
    expect(filtered).not.toContain("future-template");
  });

  it("includes hook agenda debt items even when they are not selected or recent", () => {
    const hooks = [
      "| hook_id | start_chapter | type | status | last_advanced | expected_payoff | notes |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| mentor-oath | 8 | relationship | open | 99 | 101 | Mentor oath debt with Lin Yue |",
      "| stale-ledger | 14 | mystery | open | 70 | 120 | Old ledger debt is dormant but unresolved |",
      "| future-pr-machine | 45 | system | open | 0 | 80 | Future hook should stay hidden |",
    ].join("\n");

    const filtered = buildGovernedHookWorkingSet({
      hooksMarkdown: hooks,
      contextPackage: {
        chapter: 100,
        selectedContext: [
          {
            source: "story/pending_hooks.md#mentor-oath",
            reason: "Carry forward unresolved hook.",
            excerpt: "relationship | open | 101 | Mentor oath debt with Lin Yue",
          },
        ],
      },
      chapterIntent: [
        "# Chapter Intent",
        "",
        "## Hook Agenda",
        "### Must Advance",
        "- mentor-oath",
        "",
        "### Eligible Resolve",
        "- none",
        "",
        "### Stale Debt",
        "- stale-ledger",
        "",
        "### Avoid New Hook Families",
        "- none",
      ].join("\n"),
      chapterNumber: 100,
      language: "en",
    });

    expect(filtered).toContain("mentor-oath");
    expect(filtered).toContain("stale-ledger");
    expect(filtered).not.toContain("future-pr-machine");
  });

  it("keeps recently-advanced hooks in the governed working set while filtering far-future hooks", () => {
    const hooks = [
      "| hook_id | start_chapter | type | status | last_advanced | expected_payoff | payoff_timing | notes |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| river-oath | 8 | relationship | progressing | 16 | Reveal why the river oath was broken | slow-burn | Long debt should stay visible through the middle game |",
      "| future-pr-machine | 45 | system | open | 0 | Future hook should stay hidden | endgame | Future hook should stay hidden |",
    ].join("\n");

    const filtered = buildGovernedHookWorkingSet({
      hooksMarkdown: hooks,
      contextPackage: {
        chapter: 20,
        selectedContext: [],
      },
      chapterNumber: 20,
      language: "en",
    });

    expect(filtered).toContain("river-oath");
    expect(filtered).not.toContain("future-pr-machine");
  });

  it("filters character matrix by exact governed character mentions instead of broad capitalized tokens", () => {
    const matrix = [
      "# Character Matrix",
      "",
      "### Character Profiles",
      "| Character | Core Tags | Contrast Detail | Speech Style | Personality Core | Relationship to Protagonist | Core Motivation | Current Goal |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Lin Yue | oath | restraint | clipped | stubborn | self | repay debt | find mentor |",
      "| Guildmaster Ren | guild | swagger | loud | opportunistic | rival | stall Mara | seize seal |",
      "",
      "### Encounter Log",
      "| Character A | Character B | First Meeting Chapter | Latest Interaction Chapter | Relationship Type | Relationship Change |",
      "| --- | --- | --- | --- | --- | --- |",
      "| Lin Yue | Guildmaster Ren | 1 | 5 | rivalry | strained |",
      "",
      "### Information Boundaries",
      "| Character | Known Information | Unknown Information | Source Chapter |",
      "| --- | --- | --- | --- |",
      "| Lin Yue | Mentor left without explanation | Why the oath was broken | 99 |",
      "| Guildmaster Ren | Harbor roster | Mentor oath debt | 12 |",
    ].join("\n");

    const filtered = buildGovernedCharacterMatrixWorkingSet({
      matrixMarkdown: matrix,
      chapterIntent: "# Chapter Intent\n\n## Goal\nBring the focus back to the mentor oath conflict.\n",
      contextPackage: {
        chapter: 100,
        selectedContext: [
          {
            source: "story/chapter_summaries.md#99",
            reason: "Relevant episodic memory.",
            excerpt: "Locked Gate | Lin Yue chooses the mentor line over the guild line | mentor-oath advanced",
          },
          {
            source: "story/pending_hooks.md#mentor-oath",
            reason: "Carry forward unresolved hook.",
            excerpt: "relationship | open | 101 | Mentor oath debt with Lin Yue",
          },
        ],
      },
    });

    expect(filtered).toContain("| Lin Yue | oath | restraint | clipped | stubborn | self | repay debt | find mentor |");
    expect(filtered).not.toContain("| Guildmaster Ren | guild | swagger | loud | opportunistic | rival | stall Mara | seize seal |");
    expect(filtered).not.toContain("| Lin Yue | Guildmaster Ren | 1 | 5 | rivalry | strained |");
    expect(filtered).not.toContain("| Guildmaster Ren | Harbor roster | Mentor oath debt | 12 |");
  });
});
