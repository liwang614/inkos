import {
  RuntimeStateDeltaSchema,
  type HookRecord,
  type NewHookCandidate,
  type RuntimeStateDelta,
} from "../models/runtime-state.js";
import { evaluateHookAdmission } from "./hook-governance.js";
import { resolveHookPayoffTiming } from "./hook-lifecycle.js";

export interface HookArbiterDecision {
  readonly action: "created" | "mapped" | "mentioned" | "rejected";
  readonly reason: string;
  readonly hookId?: string;
  readonly candidate: NewHookCandidate;
}

interface PendingHookCandidate extends NewHookCandidate {
  readonly preferredHookId?: string;
}

export function arbitrateRuntimeStateDeltaHooks(params: {
  readonly hooks: ReadonlyArray<HookRecord>;
  readonly delta: RuntimeStateDelta;
}): {
  readonly resolvedDelta: RuntimeStateDelta;
  readonly decisions: ReadonlyArray<HookArbiterDecision>;
} {
  const delta = RuntimeStateDeltaSchema.parse(params.delta);
  const workingHooks = params.hooks.map((hook) => ({ ...hook }));
  const knownHookIds = new Set(workingHooks.map((hook) => hook.hookId));
  const upsertsById = new Map<string, HookRecord>();
  const mentions = new Set(delta.hookOps.mention);
  const resolves = uniqueStrings(delta.hookOps.resolve);
  const defers = uniqueStrings(delta.hookOps.defer);
  const fallbackCandidates: PendingHookCandidate[] = [];
  const decisions: HookArbiterDecision[] = [];

  for (const hook of delta.hookOps.upsert) {
    if (knownHookIds.has(hook.hookId)) {
      const normalized = { ...hook };
      upsertsById.set(normalized.hookId, normalized);
      replaceWorkingHook(workingHooks, normalized);
      continue;
    }

    fallbackCandidates.push({
      type: hook.type,
      expectedPayoff: hook.expectedPayoff,
      notes: hook.notes,
      preferredHookId: hook.hookId,
    });
  }

  for (const candidate of [...fallbackCandidates, ...delta.newHookCandidates]) {
    const activeHooks = workingHooks.filter((hook) => hook.status !== "resolved");
    const admission = evaluateHookAdmission({
      candidate,
      activeHooks,
    });

    if (!admission.admit) {
      if (admission.reason === "duplicate_family" && admission.matchedHookId) {
        const matched = workingHooks.find((hook) => hook.hookId === admission.matchedHookId);
        if (!matched) {
          decisions.push({
            action: "rejected",
            reason: "duplicate_family_without_match",
            candidate,
          });
          continue;
        }

        if (isPureRestatement(candidate, matched)) {
          if (!upsertsById.has(matched.hookId) && !resolves.includes(matched.hookId) && !defers.includes(matched.hookId)) {
            mentions.add(matched.hookId);
          }
          decisions.push({
            action: "mentioned",
            reason: "restated_existing_family",
            hookId: matched.hookId,
            candidate,
          });
          continue;
        }

        const base = upsertsById.get(matched.hookId) ?? matched;
        const mapped = mergeCandidateIntoExistingHook(base, candidate, delta.chapter);
        upsertsById.set(mapped.hookId, mapped);
        mentions.delete(mapped.hookId);
        replaceWorkingHook(workingHooks, mapped);
        decisions.push({
          action: "mapped",
          reason: "duplicate_family_with_novelty",
          hookId: matched.hookId,
          candidate,
        });
        continue;
      }

      decisions.push({
        action: "rejected",
        reason: admission.reason,
        candidate,
      });
      continue;
    }

    const created = createCanonicalHook({
      candidate,
      chapter: delta.chapter,
      existingIds: new Set([
        ...workingHooks.map((hook) => hook.hookId),
        ...upsertsById.keys(),
      ]),
    });
    upsertsById.set(created.hookId, created);
    workingHooks.push(created);
    decisions.push({
      action: "created",
      reason: "admit",
      hookId: created.hookId,
      candidate,
    });
  }

  const resolvedDelta = RuntimeStateDeltaSchema.parse({
    ...delta,
    hookOps: {
      upsert: [...upsertsById.values()].sort(sortHooks),
      mention: [...mentions]
        .filter((hookId) => !upsertsById.has(hookId))
        .filter((hookId) => !resolves.includes(hookId))
        .filter((hookId) => !defers.includes(hookId))
        .sort(),
      resolve: resolves,
      defer: defers,
    },
    newHookCandidates: [],
  });

  return {
    resolvedDelta,
    decisions,
  };
}

function mergeCandidateIntoExistingHook(
  existing: HookRecord,
  candidate: NewHookCandidate,
  chapter: number,
): HookRecord {
  return {
    ...existing,
    type: preferRicherText(existing.type, candidate.type),
    status: existing.status === "resolved" ? "resolved" : "progressing",
    lastAdvancedChapter: Math.max(existing.lastAdvancedChapter, chapter),
    expectedPayoff: preferRicherText(existing.expectedPayoff, candidate.expectedPayoff),
    payoffTiming: resolveHookPayoffTiming({
      payoffTiming: candidate.payoffTiming ?? existing.payoffTiming,
      expectedPayoff: preferRicherText(existing.expectedPayoff, candidate.expectedPayoff),
      notes: preferRicherText(existing.notes, candidate.notes),
    }),
    notes: preferRicherText(existing.notes, candidate.notes),
  };
}

function createCanonicalHook(params: {
  readonly candidate: PendingHookCandidate;
  readonly chapter: number;
  readonly existingIds: ReadonlySet<string>;
}): HookRecord {
  return {
    hookId: buildCanonicalHookId(params.candidate, params.existingIds, params.chapter),
    startChapter: params.chapter,
    type: params.candidate.type.trim(),
    status: "open",
    lastAdvancedChapter: params.chapter,
    expectedPayoff: params.candidate.expectedPayoff.trim(),
    payoffTiming: resolveHookPayoffTiming(params.candidate),
    notes: params.candidate.notes.trim(),
  };
}

// Mint a stable, ASCII, H_-prefixed hook id for a genuinely-new hook. The
// create/dedup decision is made upstream (evaluateHookAdmission); this only
// picks the *name*. Priority: an explicit handle the settler proposed
// (preferredHookId from a stray upsert, or suggestedId on the candidate) \u2192
// a handle derived from the hook type \u2192 a generic per-chapter fallback. Chinese
// is intentionally never embedded in the id (it stays in notes/expectedPayoff),
// both to match the architect's H_Xxx convention and to keep ids from leaking
// into prose.
function buildCanonicalHookId(
  candidate: PendingHookCandidate,
  existingIds: ReadonlySet<string>,
  chapter: number,
): string {
  // A stray upsert id (preferredHookId) that is already a clean ASCII handle is
  // preserved verbatim: this keeps id matching stable across chapters and leaves
  // books that use a different (e.g. lower-kebab) convention untouched. Only when
  // it is missing or carries non-ASCII (e.g. Chinese) do we mint a fresh handle.
  const preferred = candidate.preferredHookId?.trim() ?? "";
  if (preferred && isCleanAsciiHandle(preferred)) {
    return existingIds.has(preferred) ? dedupeHookId(preferred, existingIds) : preferred;
  }

  const base = canonicalizeHookHandle(preferred)
    || canonicalizeHookHandle(candidate.suggestedId)
    || canonicalizeHookHandle(candidate.type)
    || `H_Ch${Math.max(1, Math.trunc(chapter))}_Hook`;
  return dedupeHookId(base, existingIds);
}

function isCleanAsciiHandle(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function dedupeHookId(base: string, existingIds: ReadonlySet<string>): string {
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

// Turn an arbitrary suggestion ("QiFeng_Cleanup", "enemy-cleanup", "H_Foo",
// "\u654c\u65b9\u7ebf\u7d22") into an `H_PascalCase` ASCII handle, or "" when it carries no ASCII
// content (e.g. a pure-Chinese string) so the caller can fall back.
function canonicalizeHookHandle(raw: string | undefined): string {
  if (!raw) return "";
  const segments = raw
    .trim()
    .replace(/^[hH]_+/, "")            // avoid a doubled H_ prefix
    .replace(/[^A-Za-z0-9]+/g, " ")    // drop CJK / punctuation
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));
  if (segments.length === 0) return "";
  return `H_${segments.join("_")}`.slice(0, 60).replace(/_+$/g, "");
}

function isPureRestatement(candidate: NewHookCandidate, existing: HookRecord): boolean {
  const candidateText = normalizeText([
    candidate.type,
    candidate.expectedPayoff,
    candidate.notes,
  ].join(" "));
  const existingText = normalizeText([
    existing.type,
    existing.expectedPayoff,
    existing.notes,
  ].join(" "));

  if (!candidateText) return true;
  if (candidateText === existingText) return true;

  const candidateTerms = extractTerms(candidateText);
  const existingTerms = extractTerms(existingText);
  const novelTerms = [...candidateTerms].filter((term) => !existingTerms.has(term));

  const candidateChinese = extractChineseBigrams(candidateText);
  const existingChinese = extractChineseBigrams(existingText);
  const novelChinese = [...candidateChinese].filter((term) => !existingChinese.has(term));

  return novelTerms.length === 0 && novelChinese.length < 2;
}

function replaceWorkingHook(workingHooks: HookRecord[], hook: HookRecord): void {
  const index = workingHooks.findIndex((candidate) => candidate.hookId === hook.hookId);
  if (index >= 0) {
    workingHooks[index] = hook;
    return;
  }

  workingHooks.push(hook);
}

function sortHooks(left: HookRecord, right: HookRecord): number {
  return left.startChapter - right.startChapter
    || left.lastAdvancedChapter - right.lastAdvancedChapter
    || left.hookId.localeCompare(right.hookId);
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function preferRicherText(primary: string, fallback: string): string {
  const left = primary.trim();
  const right = fallback.trim();

  if (!left) return right;
  if (!right) return left;
  if (left === right) return left;
  return right.length > left.length ? right : left;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTerms(value: string): Set<string> {
  const english = value
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 4)
    .filter((term) => !STOP_WORDS.has(term));
  const chinese = value.match(/[\u4e00-\u9fff]{2,6}/g) ?? [];
  return new Set([...english, ...chinese]);
}

function extractChineseBigrams(value: string): Set<string> {
  const segments = value.match(/[\u4e00-\u9fff]+/g) ?? [];
  const terms = new Set<string>();

  for (const segment of segments) {
    if (segment.length < 2) {
      continue;
    }

    for (let index = 0; index <= segment.length - 2; index += 1) {
      terms.add(segment.slice(index, index + 2));
    }
  }

  return terms;
}

const STOP_WORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "into",
  "still",
  "just",
  "have",
  "will",
  "reveal",
  "about",
  "already",
  "question",
  "chapter",
]);
