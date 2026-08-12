/* 性病系統
 *
 * 設計參考原著 YaKyoLife 的湯米約翰手術機制:持續累積的傷害、
 * 玩家可以選擇處理或硬撐、而且其中一種是不可逆的。
 *
 * 梅毒:可治癒。就醫要消耗社交場次,有成功率,失敗可以再試。
 * 愛滋:不可治癒。每學期持續扣三項能力與風評,直到畢業或退學。
 */

import { CONFIG } from '../data/config.js';
import { addAb } from './state.js';

export function hasStd(S) {
  return !!S.std;
}

export function stdInfo(S) {
  if (!S.std) return null;
  return { key: S.std, ...CONFIG.std[S.std] };
}

/* 感染。已經有愛滋的人不會被梅毒覆蓋(嚴重的優先) */
export function infect(S, kind) {
  if (!CONFIG.std[kind]) throw new Error(`未知的性病種類:${kind}`);
  /* 跟校醫室的護理師交流過之後永久免疫,任何角色都不會再造成感染 */
  if (S.immune) return { changed: false, std: S.std, immune: true };
  if (S.std === 'hiv') return { changed: false, std: S.std };
  if (S.std === kind) return { changed: false, std: S.std };
  S.std = kind;
  S.stdSemesters = 0;
  return { changed: true, std: kind, info: CONFIG.std[kind] };
}

/* 取得免疫。回傳是否是這次才取得的(用來決定要不要顯示卡片) */
export function grantImmunity(S) {
  if (S.immune) return { changed: false };
  S.immune = true;
  return { changed: true };
}

/* 每學期結算時套用損失 */
export function applyStdPenalty(S) {
  if (!S.std) return null;
  const cfg = CONFIG.std[S.std];
  S.stdSemesters = (S.stdSemesters || 0) + 1;

  const applied = [];
  for (const [k, v] of Object.entries(cfg.perSemester)) {
    const actual = addAb(S, k, -v);
    applied.push({ key: k, amount: -v, actual });
  }
  if (cfg.repPerSemester) {
    S.rep += cfg.repPerSemester;
    applied.push({ key: 'rep', amount: cfg.repPerSemester, actual: cfg.repPerSemester });
  }
  return { std: S.std, name: cfg.name, applied, semesters: S.stdSemesters };
}

/* 能不能就醫(只有可治癒的、而且場次夠) */
export function canCure(S) {
  if (!S.std) return false;
  const cfg = CONFIG.std[S.std];
  if (!cfg.curable) return false;
  return S.slots >= cfg.cureSlots;
}

/* 就醫治療。回傳是否治好 */
export function attemptCure(S, rng) {
  if (!S.std) throw new Error('沒有需要治療的病');
  const cfg = CONFIG.std[S.std];
  if (!cfg.curable) throw new Error(`${cfg.name} 無法治癒`);

  S.slots -= cfg.cureSlots;
  const applied = [];
  for (const [k, v] of Object.entries(cfg.cureCost || {})) {
    const actual = addAb(S, k, -v);
    applied.push({ key: k, amount: -v, actual });
  }

  const cured = rng.chance(cfg.cureRate);
  if (cured) {
    const was = S.std;
    S.std = null;
    S.stdSemesters = 0;
    S.stdCured = (S.stdCured || 0) + 1;
    return { cured: true, was, name: cfg.name, applied, rate: cfg.cureRate };
  }
  return { cured: false, was: S.std, name: cfg.name, applied, rate: cfg.cureRate };
}
