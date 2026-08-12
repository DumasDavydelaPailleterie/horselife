/* 攻略判定 — 核心公式
 * 依規格草案 5.5 節:
 *   成功率(%) = 技巧力×0.6 + 肌力×0.3 + 體力×0.1 − 對象難度修正 − 風評修正
 */

import { CONFIG } from '../data/config.js';
import { addAb, addSkl } from './state.js';
import { infect, grantImmunity } from './health.js';
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

/* 取得對某位對象的實際成功率。
 * 少數角色(目前只有校醫室的護理師)有固定成功率,不套用一般公式,
 * 因為她們的門檻設計在「玩家有沒有想到要去那個地方」,而不是能力值高低。 */
export function rateFor(S, target) {
  if (typeof target?.fixedRate === 'number') return target.fixedRate;
  return conquestRate(S, target?.difficulty ?? target?.diff);
}

/* 套用女角的特殊效果。回傳套用明細與是否觸發登出 */
export function applyGirlEffect(S, girl) {
  const eff = girl.eff;
  if (!eff) return { applied: [], fatal: null, std: null };

  const applied = [];
  let fatal = null;
  let std = null;
  let immuneBlocked = false;   /* 因為已免疫而擋掉的感染 */

  for (const [key, v] of Object.entries(eff)) {
    switch (key) {
      case 'sta': case 'int': case 'str': {
        const actual = addAb(S, key, v);
        applied.push({ key, amount: v, actual });
        break;
      }
      case 'skl': {
        const actual = addSkl(S, v);
        applied.push({ key, amount: v, actual });
        break;
      }
      case 'enc':  S.encBonus += v;  applied.push({ key, amount: v, actual: v }); break;
      case 'slot': S.bonusSlots += v; applied.push({ key, amount: v, actual: v }); break;
      case 'risk': S.risk += v;      applied.push({ key, amount: v, actual: v }); break;
      case 'rep':
        S.rep = Math.max(0, S.rep + v);
        applied.push({ key, amount: v, actual: v });
        break;
      case 'std': {
        const r = infect(S, v);
        std = r.changed ? r : null;
        if (r.changed) applied.push({ key: 'std', amount: v, actual: v });
        else if (r.immune) immuneBlocked = true;
        break;
      }
      case 'immune': {
        const r = grantImmunity(S);
        if (r.changed) applied.push({ key: 'immune', amount: 1, actual: 1 });
        break;
      }
      case 'fatal':
        fatal = v;
        break;
      default:
        throw new Error(`女角效果使用了未知的鍵:${key}`);
    }
  }
  return { applied, fatal, std, immuneBlocked };
}

/* 對一位對象進行一次攻略判定並套用結果 */
export function attemptConquest(S, target, rng) {
  const rate = rateFor(S, target);
  const success = rng.chance(rate);

  S.stats.attempts++;
  /* 記錄已經接觸過的名冊角色,同一局不會再遇到 */
  if (target.id && !S.metIds.includes(target.id)) S.metIds.push(target.id);

  if (!success) {
    /* 失敗也給少量經驗,避免開局死鎖 */
    addSkl(S, CONFIG.sklOnFail);
    return {
      success: false, rate, target, counted: false,
      sklGain: CONFIG.sklOnFail, applied: [], fatal: null, std: null,
      immuneBlocked: false,
    };
  }

  S.stats.successes++;

  /* 同一位對象只計數一次 */
  const isNew = !S.conquered.some((c) => c.name === target.name);
  if (isNew) {
    S.kills++;
    S.conquered.push({
      name: target.name, title: target.title || '', tier: target.tier || 'normal',
      semester: S.semester,
    });
    S.rep += CONFIG.repPerConquest;
  }

  /* 技巧力成長:超過軟上限後減半 */
  const gain =
    S.ab.skl >= CONFIG.sklSoftCap ? CONFIG.sklOnSuccess / 2 : CONFIG.sklOnSuccess;
  addSkl(S, gain);

  /* 女角的特殊效果 */
  const { applied, fatal, std, immuneBlocked } = applyGirlEffect(S, target);
  if (fatal) S.stats.fatalGirl = target.name;

  return {
    success: true, rate, target, counted: isNew,
    sklGain: gain, applied, fatal, std, immuneBlocked,
  };
}
