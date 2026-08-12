/* 攻略判定 — 核心公式
 * 依規格草案 5.5 節:
 *   成功率(%) = 技巧力×0.6 + 肌力×0.3 + 體力×0.1 − 對象難度修正 − 風評修正
 */

import { CONFIG } from '../data/config.js';
import { addSkl } from './state.js';
import { clamp } from '../rng.js';

/* 計算對某位對象的成功率(百分比) */
export function conquestRate(S, difficulty) {
  const w = CONFIG.conquestWeights;
  const base =
    S.ab.skl * w.skl + S.ab.str * w.str + S.ab.sta * w.sta + S.ab.int * w.int;
  const diffPen = CONFIG.difficultyPenalty[difficulty] ?? 0;
  const repPen = Math.floor(Math.max(0, S.rep) / CONFIG.repPenaltyDiv);
  const raw = base - diffPen - repPen;
  return clamp(raw, CONFIG.conquestRateMin, CONFIG.conquestRateMax);
}

/* 對一位對象進行一次攻略判定並套用結果 */
export function attemptConquest(S, target, rng) {
  const rate = conquestRate(S, target.difficulty);
  const success = rng.chance(rate);

  S.stats.attempts++;

  if (success) {
    S.stats.successes++;

    /* 同一位對象只計數一次 */
    const isNew = !S.conquered.includes(target.name);
    if (isNew) {
      S.kills++;
      S.conquered.push(target.name);
      S.rep += CONFIG.repPerConquest;
    }

    /* 技巧力成長:超過軟上限後減半 */
    const gain =
      S.ab.skl >= CONFIG.sklSoftCap ? CONFIG.sklOnSuccess / 2 : CONFIG.sklOnSuccess;
    addSkl(S, gain);

    return { success: true, rate, target, counted: isNew, sklGain: gain };
  }

  /* 失敗也給少量經驗,避免開局死鎖 */
  addSkl(S, CONFIG.sklOnFail);
  return { success: false, rate, target, counted: false, sklGain: CONFIG.sklOnFail };
}
