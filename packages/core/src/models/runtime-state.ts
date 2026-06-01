import { z } from "zod";

export const RuntimeStateLanguageSchema = z.enum(["zh", "en"]);
export type RuntimeStateLanguage = z.infer<typeof RuntimeStateLanguageSchema>;

export const StateManifestSchema = z.object({
  schemaVersion: z.literal(2),
  language: RuntimeStateLanguageSchema,
  lastAppliedChapter: z.number().int().min(0),
  projectionVersion: z.number().int().min(1),
  migrationWarnings: z.array(z.string()).default([]),
});

export type StateManifest = z.infer<typeof StateManifestSchema>;

export const HookStatusSchema = z.enum(["open", "progressing", "deferred", "resolved"]);
export type HookStatus = z.infer<typeof HookStatusSchema>;

/**
 * Map an arbitrary status token onto the persisted {@link HookStatus} enum.
 *
 * The planner / writer lifecycle vocabulary (`planted → pressured → near_payoff
 * → payoff`) is richer than the four persisted states. The settler echoes those
 * lifecycle words back into `hookOps.upsert[].status`, so without this mapping a
 * delta carrying e.g. `"pressured"` fails `RuntimeStateDeltaSchema` validation and
 * silently degrades the whole book onto the legacy markdown path. Normalizing here
 * keeps the structured path reachable.
 */
export function canonicalizeHookStatus(value: unknown): HookStatus {
  if (typeof value !== "string") return "open";
  const raw = value.trim().toLowerCase();
  if (!raw) return "open";

  // Lifecycle vocabulary (planted/pressured/near_payoff/payoff/…) takes priority,
  // matched as a whole token so `near_payoff` is not swallowed by the `payoff` rule.
  const token = raw.replace(/[\s-]+/g, "_");
  const lifecycle: Record<string, HookStatus> = {
    planted: "open",
    seeded: "open",
    pressured: "progressing",
    pressure: "progressing",
    near_payoff: "progressing",
    near: "progressing",
    ready: "progressing",
    escalating: "progressing",
    payoff: "resolved",
    paid_off: "resolved",
    paid: "resolved",
    stale: "open",
  };
  if (token in lifecycle) return lifecycle[token]!;

  // Synonym fallbacks (mirror the markdown bootstrap normalizer).
  if (/(resolved|closed|done|paid|payoff|已回收|回收|已解决|完成)/i.test(raw)) return "resolved";
  if (/(deferred|defer|paused|hold|搁置|延后|延期|暂缓)/i.test(raw)) return "deferred";
  if (/(progress|advanc|escalat|pressur|near|ready|推进|进行中)/i.test(raw)) return "progressing";
  if (/(open|pending|待定|未回收)/i.test(raw)) return "open";
  return "open";
}

export const HookPayoffTimingSchema = z.enum([
  "immediate",
  "near-term",
  "mid-arc",
  "slow-burn",
  "endgame",
]);
export type HookPayoffTiming = z.infer<typeof HookPayoffTimingSchema>;

export const HookRecordSchema = z.object({
  hookId: z.string().min(1),
  startChapter: z.number().int().min(0),
  type: z.string().min(1),
  status: HookStatusSchema,
  lastAdvancedChapter: z.number().int().min(0),
  expectedPayoff: z.string().default(""),
  payoffTiming: HookPayoffTimingSchema.optional(),
  notes: z.string().default(""),
  // Phase 7 — hook causality / promotion metadata.
  // All optional so hooks parsed from pre-Phase-7 markdown still validate
  // and so callers constructing HookRecord inline can omit them.
  dependsOn: z.array(z.string().min(1)).optional(),
  paysOffInArc: z.string().optional(),
  coreHook: z.boolean().optional(),
  halfLifeChapters: z.number().int().positive().optional(),
  advancedCount: z.number().int().min(0).optional(),
  // Phase 7 hotfix 2 — promotion flag. Undefined on legacy 11/12-column
  // ledgers; architect-seed and consolidator-rerun both populate it going
  // forward. Reviewer uses it to gate critical severity for stale hooks.
  promoted: z.boolean().optional(),
});

export type HookRecord = z.infer<typeof HookRecordSchema>;

export const HooksStateSchema = z.object({
  hooks: z.array(HookRecordSchema).default([]),
});

export type HooksState = z.infer<typeof HooksStateSchema>;

export const ChapterSummaryRowSchema = z.object({
  chapter: z.number().int().min(1),
  title: z.string().min(1),
  characters: z.string().default(""),
  events: z.string().default(""),
  stateChanges: z.string().default(""),
  hookActivity: z.string().default(""),
  mood: z.string().default(""),
  chapterType: z.string().default(""),
});

export type ChapterSummaryRow = z.infer<typeof ChapterSummaryRowSchema>;

export const ChapterSummariesStateSchema = z.object({
  rows: z.array(ChapterSummaryRowSchema).default([]),
});

export type ChapterSummariesState = z.infer<typeof ChapterSummariesStateSchema>;

export const CurrentStateFactSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  validFromChapter: z.number().int().min(0),
  validUntilChapter: z.number().int().min(0).nullable(),
  sourceChapter: z.number().int().min(0),
});

export type CurrentStateFact = z.infer<typeof CurrentStateFactSchema>;

export const CurrentStateStateSchema = z.object({
  chapter: z.number().int().min(0),
  facts: z.array(CurrentStateFactSchema).default([]),
});

export type CurrentStateState = z.infer<typeof CurrentStateStateSchema>;

export const CurrentStatePatchSchema = z.object({
  currentLocation: z.string().optional(),
  protagonistState: z.string().optional(),
  currentGoal: z.string().optional(),
  currentConstraint: z.string().optional(),
  currentAlliances: z.string().optional(),
  currentConflict: z.string().optional(),
});

export type CurrentStatePatch = z.infer<typeof CurrentStatePatchSchema>;

export const HookOpsSchema = z.object({
  upsert: z.array(HookRecordSchema).default([]),
  mention: z.array(z.string().min(1)).default([]),
  resolve: z.array(z.string().min(1)).default([]),
  defer: z.array(z.string().min(1)).default([]),
});

export type HookOps = z.infer<typeof HookOpsSchema>;

export const NewHookCandidateSchema = z.object({
  type: z.string().min(1),
  expectedPayoff: z.string().default(""),
  payoffTiming: HookPayoffTimingSchema.optional(),
  notes: z.string().default(""),
});

export type NewHookCandidate = z.infer<typeof NewHookCandidateSchema>;

const LooseOpSchema = z.record(z.string(), z.unknown());

export const RuntimeStateDeltaSchema = z.object({
  chapter: z.number().int().min(1),
  currentStatePatch: CurrentStatePatchSchema.optional(),
  hookOps: HookOpsSchema.default({
    upsert: [],
    mention: [],
    resolve: [],
    defer: [],
  }),
  newHookCandidates: z.array(NewHookCandidateSchema).default([]),
  chapterSummary: ChapterSummaryRowSchema.optional(),
  subplotOps: z.array(LooseOpSchema).default([]),
  emotionalArcOps: z.array(LooseOpSchema).default([]),
  characterMatrixOps: z.array(LooseOpSchema).default([]),
  notes: z.array(z.string()).default([]),
});

export type RuntimeStateDelta = z.infer<typeof RuntimeStateDeltaSchema>;
