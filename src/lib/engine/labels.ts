import type { AbilityMode, EffectDuration, EffectKind, Range, StatusKind, Tempo } from "./types";

export const TEMPO_LABEL: Record<Tempo, string> = {
  instant: "即時",
  fast: "速い",
  normal: "標準",
  slow: "遅い",
  charge: "溜め",
};

export const RANGE_LABEL: Record<Range, string> = {
  self: "自己",
  melee: "近接",
  mid: "中距離",
  far: "遠距離",
  unlimited: "無制限",
};

export const MODE_LABEL: Record<AbilityMode, string> = {
  active: "能動",
  passive: "常時",
  reactive: "反応",
  conditional: "条件発動",
};

export const DURATION_LABEL: Record<EffectDuration, string> = {
  instant: "瞬間",
  short: "短期",
  battle: "戦闘中",
  permanent: "永続",
};

export const EFFECT_LABEL: Record<EffectKind, string> = {
  damage: "損耗",
  bind: "拘束",
  disable: "能力封じ",
  weaken: "弱体化",
  empower: "強化",
  heal: "回復",
  barrier: "防壁",
  evasion: "回避",
  nullify: "無効化",
  copy: "模倣",
  field: "環境操作",
  rule: "規則変更",
  mental: "精神干渉",
  other: "特殊",
};

export const STATUS_TONE: Record<StatusKind, string> = {
  barrier: "tag",
  evasion: "tag",
  bind: "tag-danger",
  seal: "tag-danger",
  silence: "tag-danger",
  regen: "tag-ok",
  empower: "tag-ok",
  weaken: "tag-danger",
  mark: "tag-accent",
  stun: "tag-danger",
  field: "tag",
  other: "tag",
};

export const CONDITION_STATUS_LABEL: Record<string, string> = {
  met: "条件充足",
  partial: "部分充足",
  unmet: "不成立",
  na: "対象外",
};

export const COUNTERPLAY_LABEL: Record<string, string> = {
  none: "対抗なし",
  partial: "部分的に対抗",
  strong: "強い対抗",
};

export const TEMPO_EDGE_LABEL: Record<string, string> = {
  advantage: "優位",
  neutral: "互角",
  disadvantage: "劣位",
};

export const ACTION_LABEL_JA: Record<string, string> = {
  activate: "能力発動",
  strike: "攻撃",
  defend: "防御",
  evade: "回避",
  maneuver: "機動",
  recover: "立て直し",
  observe: "観察",
  break_free: "拘束解除",
  feint: "牽制",
};
