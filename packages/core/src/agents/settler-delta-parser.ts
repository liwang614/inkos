import {
  canonicalizeHookStatus,
  RuntimeStateDeltaSchema,
  type RuntimeStateDelta,
} from "../models/runtime-state.js";

export interface SettlerDeltaOutput {
  readonly postSettlement: string;
  readonly runtimeStateDelta: RuntimeStateDelta;
}

function sanitizeJSON(str: string): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/,\s*([}\]])/g, "$1");
}

export function parseSettlerDeltaOutput(content: string): SettlerDeltaOutput {
  const extract = (tag: string): string => {
    const regex = new RegExp(
      `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
    );
    const match = content.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  const rawDelta = extract("RUNTIME_STATE_DELTA");
  if (!rawDelta) {
    throw new Error("runtime state delta block is missing");
  }

  const jsonPayload = stripCodeFence(rawDelta);
  let parsed: unknown;
  try {
    parsed = normalizeDeltaHookStatuses(JSON.parse(sanitizeJSON(jsonPayload)));
  } catch (error) {
    throw new Error(`runtime state delta is not valid JSON: ${String(error)}`);
  }

  try {
    return {
      postSettlement: extract("POST_SETTLEMENT"),
      runtimeStateDelta: RuntimeStateDeltaSchema.parse(parsed),
    };
  } catch (error) {
    throw new Error(`runtime state delta failed schema validation: ${String(error)}`);
  }
}

/**
 * Coerce hook statuses inside `hookOps.upsert` onto the persisted enum before
 * schema validation. The settler often emits lifecycle-vocabulary statuses
 * (e.g. `pressured`, `planted`, `near_payoff`) that are not part of
 * {@link HookStatusSchema}; left untouched they would fail validation and force
 * the whole book onto the legacy markdown path. Mutates in place and returns the
 * same value for convenience.
 */
function normalizeDeltaHookStatuses(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const hookOps = (parsed as Record<string, unknown>).hookOps;
  if (!hookOps || typeof hookOps !== "object") return parsed;
  const upsert = (hookOps as Record<string, unknown>).upsert;
  if (!Array.isArray(upsert)) return parsed;
  for (const hook of upsert) {
    if (hook && typeof hook === "object" && "status" in hook) {
      const record = hook as Record<string, unknown>;
      record.status = canonicalizeHookStatus(record.status);
    }
  }
  return parsed;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
