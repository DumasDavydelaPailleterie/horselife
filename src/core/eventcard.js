/* 事件卡:抽取與效果結算 */

import { CONFIG } from '../data/config.js';
import { EVENTS } from '../data/events.js';
import { gradeOf } from '../data/config.js';
import { addAb, addSkl } from './state.js';

const ABILITY_KEYS = ['sta', 'int', 'str', 'skl', 'rand'];

/* 卡片是否符合當前狀態的出現條件 */
export function cardEligible(card, S, phase) {
  if (!card.phase.includes(phase)) return false;
  if (card.dept && !card.dept.includes(S.dept)) return false;
  if (card.grade && !card.grade.includes(gradeOf(S.semester))) return false;
  if (card.once && S.usedEventIds.includes(card.id)) return false;
  if (S.semesterEventIds.includes(card.id)) return false;

  /* req:能力門檻或風評門檻 */
  if (card.req) {
    for (const [k, v] of Object.entries(card.req)) {
      if (k === 'rep') {
        if (S.rep < v) return false;
      } else if ((S.ab[k] ?? 0) < v) {
        return false;
      }
    }
  }
  return true;
}

export function eligibleCards(S, phase) {
  return EVENTS.filter((c) => cardEligible(c, S, phase));
}

/* 抽一張卡 */
export function drawCard(S, phase, rng) {
  const pool = eligibleCards(S, phase);
  if (pool.length === 0) return null;
  const card = rng.pick(pool);
  S.semesterEventIds.push(card.id);
  if (card.once) S.usedEventIds.push(card.id);
  return card;
}

/* 依應對方式的幅度縮放能力值效果
 * 權重 2 = 主要效果 → 變動量等於 mag
 * 權重 1 = 次要效果 → 變動量等於 ceil(mag / 2)
 */
export function scaleAbility(weight, mag) {
  if (weight >= 2) return mag;
  return Math.ceil(mag / 2);
}

/* 套用效果物件。sign 為 +1(好結果)或 -1(壞結果) */
export function applyEffects(S, effects, mag, sign, rng) {
  const applied = [];
  for (const [key, raw] of Object.entries(effects || {})) {
    if (ABILITY_KEYS.includes(key)) {
      const amount = scaleAbility(raw, mag) * sign;
      let target = key;
      if (key === 'rand') {
        target = rng.pick(['sta', 'int', 'str']);   /* 隨機一項,不含技巧力 */
      }
      const actual = target === 'skl' ? addSkl(S, amount) : addAb(S, target, amount);
      applied.push({ key: target, amount, actual });
    } else {
      /* 感情線與系統鍵值:不縮放,而且正負號直接寫在卡片資料裡,
       * 不隨好壞結果翻轉(例如壞結果的 rep:2 就是風評惡化 2 點)。 */
      const v = raw;
      switch (key) {
        case 'enc':  S.encBonus += v; break;
        case 'rep':  S.rep = Math.max(0, S.rep + v); break;
        case 'risk': S.risk += v; break;
        case 'slot': S.bonusSlots += v; break;
        case 'kill':
          S.kills += v;
          S.rep = Math.max(0, S.rep + CONFIG.repPerConquest * v);
          break;
        default: break;
      }
      applied.push({ key, amount: v, actual: v });
    }
  }
  return applied;
}

/* 結算一張卡:玩家選擇 response('bold'|'normal'|'safe') */
export function resolveCard(S, card, response, rng) {
  const r = CONFIG.responses[response];
  if (!r) throw new Error(`未知應對方式:${response}`);

  const success = rng.chance(r.rate);
  const effects = success ? card.g : card.b;
  const applied = applyEffects(S, effects, r.mag, success ? 1 : -1, rng);

  return {
    card,
    response,
    responseLabel: r.label,
    success,
    text: success ? card.gt : card.bt,
    applied,
  };
}

/* 強制以「照常執行」的幅度套用壞結果(意外事件用) */
export function forceBadOutcome(S, card, rng) {
  const mag = CONFIG.responses.normal.mag;
  const applied = applyEffects(S, card.b, mag, -1, rng);
  return { card, success: false, forced: true, text: card.bt, applied };
}

export function eventsForPhase(phase) {
  return CONFIG.eventsPerPhase[phase] ?? 0;
}
