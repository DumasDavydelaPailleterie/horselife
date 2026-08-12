/* 風評與意外事件 */

import { CONFIG } from '../data/config.js';
import { EVENTS } from '../data/events.js';
import { forceBadOutcome } from './eventcard.js';
import { clamp } from '../rng.js';

/* 當學期意外事件的觸發機率 */
export function accidentChance(S) {
  return clamp(S.risk, 0, CONFIG.riskCapPercent);
}

/* 學期結束前判定意外事件。觸發則強制結算一張風險類卡片的壞結果 */
export function rollAccident(S, rng) {
  const p = accidentChance(S);
  if (!rng.chance(p)) return { triggered: false, chance: p };

  const pool = EVENTS.filter((c) => c.cat === 'risk');
  if (pool.length === 0) return { triggered: false, chance: p };

  const card = rng.pick(pool);
  const outcome = forceBadOutcome(S, card, rng);
  return { triggered: true, chance: p, outcome };
}

/* 學期結算:風評自然消退、風險歸零 */
export function endOfSemesterDecay(S) {
  S.rep = Math.max(0, S.rep - CONFIG.repDecayPerSemester);
  S.risk = 0;
}
