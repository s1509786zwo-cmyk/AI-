import { z } from "zod";
import {
  ABILITY_MODES,
  ACTIONS,
  EFFECT_DURATIONS,
  EFFECT_KINDS,
  EFFECT_TARGETS,
  RANGES,
  TEMPOS,
} from "./types";
import type {
  AbilityEffectSpec,
  AbilitySpec,
  ActionPlan,
  CharacterAnalysis,
  JudgeEffect,
  JudgeEvent,
  Side,
  TurnAdjudication,
} from "./types";

const trimmed = (max: number, min = 1) => z.string().trim().min(min).max(max);
const textList = (maxItems: number, maxLen: number) =>
  z.array(z.string().trim().max(maxLen)).max(maxItems).default([]);

const conditionSchema = z.object({
  text: trimmed(300),
  evidence: trimmed(400),
});

const ambiguitySchema = z.object({
  point: trimmed(300),
  resolution: trimmed(500),
});

const effectSpecSchema = z.object({
  kind: z.enum(EFFECT_KINDS),
  severity: z.number().int().min(1).max(4),
  description: trimmed(400),
  duration: z.enum(EFFECT_DURATIONS).default("short"),
  lethal: z.boolean().default(false),
  target: z.enum(EFFECT_TARGETS).default("opponent"),
  targetAbilityId: z.string().trim().max(60).nullable().default(null),
});

const abilitySpecSchema = z.object({
  id: z.string().trim().max(60).optional(),
  name: trimmed(100),
  summary: trimmed(400),
  kinds: z.array(z.enum(EFFECT_KINDS)).min(1).max(5),
  mode: z.enum(ABILITY_MODES).default("active"),
  tempo: z.enum(TEMPOS).default("normal"),
  range: z.enum(RANGES).default("mid"),
  effects: z.array(effectSpecSchema).min(1).max(6),
  conditions: z.array(conditionSchema).max(6).default([]),
  costs: textList(6, 240),
  limits: textList(6, 240),
  weaknesses: textList(6, 300),
  counterplay: textList(6, 300),
  observability: z.string().trim().max(400).default(""),
  ambiguities: z.array(ambiguitySchema).max(6).default([]),
  usesPerBattle: z.number().int().min(0).max(99).nullable().default(null),
  cooldownRounds: z.number().int().min(0).max(20).nullable().default(null),
});

export const analysisSchema = z.object({
  combatIdentity: trimmed(600),
  abilities: z.array(abilitySpecSchema).min(1).max(6),
  behavior: trimmed(500),
  defense: trimmed(500),
  endurance: trimmed(500),
  winCondition: trimmed(400),
  lossCondition: trimmed(400),
  fairnessNotes: textList(8, 400),
  unresolved: textList(8, 400),
});

export type RawAnalysis = z.infer<typeof analysisSchema>;

const slug = (value: string, fallback: string): string => {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || fallback;
};

export function normalizeAnalysis(raw: RawAnalysis, model: string, now = new Date()): CharacterAnalysis {
  const used = new Set<string>();
  const abilities: AbilitySpec[] = raw.abilities.map((a, index) => {
    let id = a.id ? slug(a.id, `ability-${index + 1}`) : `ability-${index + 1}`;
    let suffix = 2;
    const baseId = id;
    while (used.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    used.add(id);
    const effects: AbilityEffectSpec[] = a.effects.map((e) => ({
      kind: e.kind,
      severity: Math.min(4, Math.max(1, Math.round(e.severity))),
      description: e.description,
      duration: e.duration,
      lethal: Boolean(e.lethal),
      target: e.target,
      targetAbilityId: e.targetAbilityId ?? null,
    }));
    return {
      id,
      name: a.name,
      summary: a.summary,
      kinds: Array.from(new Set(a.kinds)),
      mode: a.mode,
      tempo: a.tempo,
      range: a.range,
      effects,
      conditions: a.conditions,
      costs: a.costs,
      limits: a.limits,
      weaknesses: a.weaknesses,
      counterplay: a.counterplay,
      observability: a.observability,
      ambiguities: a.ambiguities,
      usesPerBattle: a.usesPerBattle,
      cooldownRounds: a.cooldownRounds,
    };
  });
  return {
    version: 1,
    combatIdentity: raw.combatIdentity,
    abilities,
    behavior: raw.behavior,
    defense: raw.defense,
    endurance: raw.endurance,
    winCondition: raw.winCondition,
    lossCondition: raw.lossCondition,
    fairnessNotes: raw.fairnessNotes,
    unresolved: raw.unresolved,
    analyzedAt: now.toISOString(),
    model,
  };
}

/* ────────────────────────── 行動 ────────────────────────── */

export const actionPlanSchema = z.object({
  action: z.enum(ACTIONS),
  abilityId: z.string().trim().max(60).nullable().default(null),
  intent: trimmed(400),
  declaration: z.string().trim().max(160).optional().default(""),
  reasoning: trimmed(600),
  target: z.enum(EFFECT_TARGETS).default("opponent"),
});

export type RawActionPlan = z.infer<typeof actionPlanSchema>;

export function normalizeAction(raw: RawActionPlan, side: Side): ActionPlan {
  return {
    side,
    action: raw.action,
    abilityId: raw.abilityId || null,
    intent: raw.intent,
    declaration: raw.declaration ?? "",
    reasoning: raw.reasoning,
    target: raw.target,
  };
}

/* ────────────────────────── 裁定 ────────────────────────── */

const judgeEffectSchema = z.object({
  kind: z.enum(EFFECT_KINDS),
  severity: z.number().int().min(1).max(4),
  target: z.enum(EFFECT_TARGETS).default("opponent"),
  duration: z.enum(EFFECT_DURATIONS).default("short"),
  lethal: z.boolean().default(false),
  label: trimmed(80),
  description: trimmed(400),
  targetAbilityId: z.string().trim().max(60).nullable().optional().default(null),
});

const judgeEventSchema = z.object({
  side: z.enum(["A", "B"]),
  action: z.enum(ACTIONS),
  abilityId: z.string().trim().max(60).nullable().default(null),
  conditionStatus: z.enum(["met", "partial", "unmet", "na"]).default("na"),
  conditionEvidence: z.string().trim().max(500).default(""),
  counterplay: z.enum(["none", "partial", "strong"]).default("none"),
  counterplayDetail: z.string().trim().max(500).default(""),
  tempo: z.enum(["advantage", "neutral", "disadvantage"]).default("neutral"),
  interrupted: z.boolean().default(false),
  success: z.boolean().default(true),
  effects: z.array(judgeEffectSchema).max(5).default([]),
  summary: trimmed(600),
  beats: textList(6, 300),
});

export const adjudicationSchema = z.object({
  initiative: z
    .object({
      first: z.enum(["A", "B", "simultaneous"]).default("A"),
      reason: trimmed(500),
    })
    .default({ first: "A", reason: "" }),
  events: z.array(judgeEventSchema).min(1).max(4),
  fieldNotes: textList(6, 300),
  persistentFacts: textList(8, 300),
  refereeNote: trimmed(800),
  finished: z.boolean().default(false),
  winner: z.enum(["A", "B", "draw"]).nullable().default(null),
  endingReason: z.string().trim().max(600).nullable().default(null),
});

export type RawAdjudication = z.infer<typeof adjudicationSchema>;

export function normalizeAdjudication(raw: RawAdjudication): TurnAdjudication {
  const events: JudgeEvent[] = raw.events.map((e) => ({
    side: e.side,
    action: e.action,
    abilityId: e.abilityId || null,
    conditionStatus: e.conditionStatus,
    conditionEvidence: e.conditionEvidence,
    counterplay: e.counterplay,
    counterplayDetail: e.counterplayDetail,
    tempo: e.tempo,
    interrupted: e.interrupted,
    success: e.success,
    effects: e.effects.map((eff): JudgeEffect => ({
      kind: eff.kind,
      severity: eff.severity,
      target: eff.target,
      duration: eff.duration,
      lethal: eff.lethal,
      label: eff.label,
      description: eff.description,
      targetAbilityId: eff.targetAbilityId ?? null,
    })),
    summary: e.summary,
    beats: e.beats,
  }));
  return {
    initiative: raw.initiative,
    events,
    fieldNotes: raw.fieldNotes,
    persistentFacts: raw.persistentFacts,
    refereeNote: raw.refereeNote,
    finished: raw.finished,
    winner: raw.winner ?? null,
    endingReason: raw.endingReason ?? null,
  };
}

/* ────────────────────────── 描写・検証 ────────────────────────── */

export const narrationSchema = z.object({
  narration: trimmed(2200, 40),
  highlight: trimmed(120),
  quotes: z
    .array(
      z.object({
        side: z.enum(["A", "B"]),
        line: trimmed(160),
      }),
    )
    .max(2)
    .default([]),
});

export type Narration = z.infer<typeof narrationSchema>;

export const auditSchema = z.object({
  consistent: z.boolean(),
  issues: textList(8, 400),
  correctedNarration: z.string().trim().max(2400).nullable().default(null),
});

export type AuditResult = z.infer<typeof auditSchema>;

export const closingSchema = z.object({
  verdict: trimmed(1600, 40),
  keyMoments: textList(3, 240),
  lesson: trimmed(600),
});

export type ClosingResult = z.infer<typeof closingSchema>;

export const connectionProbeSchema = z.object({
  ok: z.boolean(),
  model: z.string().trim().max(120),
  note: z.string().trim().max(300),
});
