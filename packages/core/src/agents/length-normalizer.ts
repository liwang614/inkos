import { BaseAgent } from "./base.js";
import type { LengthNormalizeMode, LengthSpec } from "../models/length-governance.js";
import { countChapterLength, chooseNormalizeMode, isOutsideHardRange, isOutsideSoftRange } from "../utils/length-metrics.js";

export interface NormalizeLengthInput {
  readonly chapterContent: string;
  readonly lengthSpec: LengthSpec;
  readonly chapterIntent?: string;
  readonly reducedControlBlock?: string;
}

export interface NormalizeLengthOutput {
  readonly normalizedContent: string;
  readonly finalCount: number;
  readonly applied: boolean;
  readonly mode: LengthNormalizeMode;
  readonly warning?: string;
  readonly tokenUsage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export class LengthNormalizerAgent extends BaseAgent {
  get name(): string {
    return "length-normalizer";
  }

  async normalizeChapter(input: NormalizeLengthInput): Promise<NormalizeLengthOutput> {
    const originalCount = countChapterLength(input.chapterContent, input.lengthSpec.countingMode);
    const mode = input.lengthSpec.normalizeMode === "none"
      ? chooseNormalizeMode(originalCount, input.lengthSpec)
      : input.lengthSpec.normalizeMode;

    if (mode === "none") {
      return {
        normalizedContent: input.chapterContent,
        finalCount: originalCount,
        applied: false,
        mode,
      };
    }

    const systemPrompt = this.buildSystemPrompt(mode);
    const userPrompt = this.buildUserPrompt(input, originalCount, mode);
    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.2,
      },
    );

    const sanitizedContent = this.sanitizeNormalizedContent(response.content, input.chapterContent);
    const sanitizedCount = countChapterLength(sanitizedContent, input.lengthSpec.countingMode);
    const wasTruncated = sanitizedContent !== input.chapterContent
      && sanitizedCount < input.lengthSpec.hardMin
      && this.looksTruncated(sanitizedContent);
    const normalizedContent = wasTruncated ? input.chapterContent : sanitizedContent;
    const finalCount = countChapterLength(normalizedContent, input.lengthSpec.countingMode);
    const warning = wasTruncated
      ? "Length normalizer output appeared truncated; kept original chapter."
      : this.buildWarning(finalCount, input.lengthSpec);

    return {
      normalizedContent,
      finalCount,
      applied: true,
      mode,
      warning,
      tokenUsage: response.usage,
    };
  }

  private buildSystemPrompt(mode: LengthNormalizeMode): string {
    const action = mode === "compress"
      ? "compress"
      : "expand";

    return `你是一位章节长度修正器。你的任务是对章节正文做一次单次修正，只能执行一次，不得递归重写。

修正目标：
- ${action} 章节长度到给定目标区间
- 保留章节原有事实、关键钩子、角色名和必须保留的标记
- 不要引入新的支线、未来揭示或额外总结
- 不要在正文外输出任何解释`;
  }

  private buildUserPrompt(
    input: NormalizeLengthInput,
    originalCount: number,
    mode: LengthNormalizeMode,
  ): string {
    const intentBlock = input.chapterIntent
      ? `\n## Chapter Intent\n${input.chapterIntent}\n`
      : "";
    const controlBlock = input.reducedControlBlock
      ? `\n## Reduced Control Block\n${input.reducedControlBlock}\n`
      : "";

    return `请对下面正文做一次${mode === "compress" ? "压缩" : "扩写"}修正。

## Length Spec
- Target: ${input.lengthSpec.target}
- Soft Range: ${input.lengthSpec.softMin}-${input.lengthSpec.softMax}
- Hard Range: ${input.lengthSpec.hardMin}-${input.lengthSpec.hardMax}
- Counting Mode: ${input.lengthSpec.countingMode}

## Current Count
${originalCount}

## Correction Rules
- 只修正一次，不要递归
- 保留正文中的关键标记、人物名、地点名和已有事实
- 不要凭空新增子情节
- 不要插入解释性总结或分析
- 输出修正后的完整正文，不要加标签

${intentBlock}${controlBlock}
## Chapter Content
${input.chapterContent}`;
  }

  private buildWarning(finalCount: number, lengthSpec: LengthSpec): string | undefined {
    if (!isOutsideSoftRange(finalCount, lengthSpec)) {
      return undefined;
    }

    if (isOutsideHardRange(finalCount, lengthSpec)) {
      return `Final count ${finalCount} is outside the hard range ${lengthSpec.hardMin}-${lengthSpec.hardMax} after one normalization pass.`;
    }

    return `Final count ${finalCount} is outside the soft range ${lengthSpec.softMin}-${lengthSpec.softMax} after one normalization pass.`;
  }

  private sanitizeNormalizedContent(rawContent: string, fallbackContent: string): string {
    const trimmed = rawContent.trim();
    if (!trimmed) return fallbackContent;

    const fenced = this.extractFirstFencedBlock(trimmed);
    if (fenced) return fenced;

    // The normalizer model sometimes echoes the writer's section format
    // (PRE_WRITE_CHECK / CHAPTER_TITLE / CHAPTER_CONTENT) even though the body
    // it received was already clean — and usually with the bare marker names,
    // without the "=== ... ===" delimiters, so the writer parser does not catch
    // them. When a CHAPTER_CONTENT marker is present, the real body is whatever
    // follows the last such marker (this drops any preamble + the title block).
    const afterContentMarker = this.extractAfterChapterContentMarker(trimmed);
    const base = afterContentMarker ?? trimmed;

    const stripped = this.stripCommonWrappers(base);
    if (stripped !== undefined) {
      // Empty after stripping = response was only wrapper text, use original
      if (!stripped) return fallbackContent;
      // Guard: if stripping removed more than 50% of content, the regex was too aggressive.
      if (stripped.length < base.length * 0.5) return base;
      return stripped;
    }

    return base;
  }

  private extractAfterChapterContentMarker(content: string): string | undefined {
    const lines = content.split("\n");
    let markerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (this.isChapterContentMarker(lines[i]!.trim())) {
        markerIndex = i;
      }
    }
    if (markerIndex < 0) return undefined;
    const body = lines.slice(markerIndex + 1).join("\n").trim();
    return body || undefined;
  }

  private isChapterContentMarker(line: string): boolean {
    return /^(?:={3,}\s*)?CHAPTER_CONTENT(?:\s*={3,})?\s*[：:]?\s*$/.test(line);
  }

  private looksTruncated(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) return false;
    if (trimmed.endsWith("```")) return false;
    if (/[。！？!?」』”’）)\]】》…]$/.test(trimmed)) return false;
    if (/\n\s*$/.test(content) && /[，,；;：:]$/.test(trimmed)) return true;
    return /[，,；;：:、]$/.test(trimmed) || /[\u4e00-\u9fffA-Za-z0-9]$/.test(trimmed);
  }

  private extractFirstFencedBlock(content: string): string | undefined {
    const match = content.match(/```(?:[a-zA-Z-]+)?\s*\n([\s\S]*?)\n```/);
    if (!match) return undefined;
    const body = match[1]?.trim();
    return body ? body : undefined;
  }

  private stripCommonWrappers(content: string): string | undefined {
    const lines = content.split("\n");
    let removedAny = false;
    const keptLines: string[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (this.isWrapperLine(trimmed)) {
        removedAny = true;
        continue;
      }
      keptLines.push(rawLine);
    }

    if (!removedAny) {
      return undefined;
    }

    return keptLines.join("\n").trim();
  }

  private isWrapperLine(line: string): boolean {
    if (!line) return false;
    if (/^```/.test(line)) return true;
    // Bare or ===-wrapped section markers leaked from the writer output format.
    if (/^(?:={3,}\s*)?(PRE_WRITE_CHECK|CHAPTER_TITLE|CHAPTER_CONTENT|写作自检|章节标题)(?:\s*={3,})?\s*[：:]?$/.test(line)) {
      return true;
    }
    // Normalizer preambles describing the compression/expansion it just performed,
    // e.g. "正文压缩至目标字数。" / "压缩约430字，保留全部Must Keep与硬线索。"
    if (/^(正文)?(已)?(压缩|扩写)(约|至|到).*(字|字数|目标|区间|Must\s?Keep|硬线索|正文)/i.test(line)) {
      return true;
    }
    if (/^#+\s*(说明|解释|注释|analysis|analysis note)\b/i.test(line)) return true;

    if (/^(下面是|以下是).*(正文|章节|压缩|扩写|修正|修改|调整|改写|润色|结果|内容|输出|版本)/i.test(line)) {
      return true;
    }

    if (/^我先.*(压缩|扩写|修正|修改|调整|改写|润色|处理).*(正文|章节)?/i.test(line)) {
      return true;
    }

    if (/^(here(?:'s| is)|below is).*(chapter|draft|content|rewrite|revised|compressed|expanded|normalized|adjusted|output|version|result)/i.test(line)) {
      return true;
    }

    if (/^i(?:'ll| will)\s+(rewrite|revise|reword|compress|expand|normalize|adjust|shorten|lengthen|trim|fix)\b/i.test(line)) {
      return true;
    }

    return false;
  }
}
