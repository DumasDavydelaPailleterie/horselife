/* 社交活動:場次計算、可用活動過濾、邂逅對象生成、活動結算 */

import { CONFIG } from '../data/config.js';
import { ACTIVITIES, activityAvailable, activityLockReason } from '../data/activities.js';
import { examThreshold } from '../data/depts.js';
import { makeName } from '../data/names.js';
import { attemptConquest } from './conquest.js';

/* 該學期的社交活動總場次 = 基礎(依體力) + 骰子兌換與事件卡的加成 */
export function baseSlots(S) {
  return CONFIG.baseSlotConst + Math.floor(S.ab.sta / CONFIG.slotStaDiv);
}

export function totalSlots(S) {
  return Math.max(0, baseSlots(S) + S.bonusSlots);
}

/* 列出所有活動並標記是否可參加 */
export function listActivities(S) {
  const th = examThreshold(S.dept, S.semester);
  return ACTIVITIES.map((act) => {
    const ok = activityAvailable(act, S.ab, th.int);
    return {
      ...act,
      available: ok,
      lockReason: ok ? '' : activityLockReason(act, th.int),
    };
  });
}

/* 生成本場活動邂逅到的對象 */
export function makeTargets(act, S, rng) {
  const n = act.enc + S.encBonus;
  S.encBonus = 0;                      /* 邂逅加成一次用完 */
  const targets = [];
  for (let i = 0; i < n; i++) {
    /* 難度以活動基準為主,加入隨機浮動:有機會遇到更好或更差的對象 */
    let difficulty = act.diff;
    const roll = rng.next();
    if (roll < 0.15) {
      difficulty = act.diff === 'high' ? 'mid' : 'low';
    } else if (roll > 0.85) {
      difficulty = act.diff === 'low' ? 'mid' : 'high';
    }
    targets.push({ name: makeName(rng), difficulty });
  }
  return targets;
}

/* 執行一場活動:生成對象、逐一攻略判定、累積風險 */
export function runActivity(S, actId, rng) {
  const act = ACTIVITIES.find((a) => a.id === actId);
  if (!act) throw new Error(`未知活動:${actId}`);

  const th = examThreshold(S.dept, S.semester);
  if (!activityAvailable(act, S.ab, th.int)) {
    throw new Error(`活動門檻不足:${act.name}`);
  }

  S.stats.activitiesDone++;

  /* 風險累積 */
  if (CONFIG.riskFromActivity) {
    S.risk += CONFIG.activityRiskValue[act.risk] || 0;
  }

  const targets = makeTargets(act, S, rng);
  const results = targets.map((t) => attemptConquest(S, t, rng));
  const gained = results.filter((r) => r.counted).length;

  return { activity: act, results, gained };
}
