/* 社交活動:場次計算、可用活動過濾、邂逅對象生成、活動結算 */

import { CONFIG } from '../data/config.js';
import { ACTIVITIES, activityAvailable, activityLockReason } from '../data/activities.js';
import { examThreshold } from '../data/depts.js';
import { attemptConquest } from './conquest.js';
import { drawGirls } from './girlpool.js';

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

/* 生成本場活動邂逅到的對象。從女角名冊抽人,難度以角色自身為準 */
export function makeTargets(act, S, rng) {
  const n = Math.max(0, act.enc + S.encBonus);
  S.encBonus = 0;                      /* 邂逅加成一次用完 */
  return drawGirls(S, act.id, n, act.diff, rng);
}

/* 執行一場活動。
 *
 * 一般對象(名冊上的 63 位路人與隨機生成的)會立刻批次結算——這是遊戲的吞吐量主體。
 * 但有稱號的特殊角色不自動結算,而是被挑出來交給玩家逐一決定要不要出手。
 *
 * 這個設計是刻意的:如果特殊角色也自動結算,那麼「夜店常客」「來者不拒」
 * 這類稱號就只是裝飾,玩家看到的時候事情已經發生了,無從判斷也無從迴避;
 * 而且因為名冊會被接觸完,帶病與登出級的角色幾乎必定會遇到,
 * 導致實際的登出率遠高於名冊上的 2%。
 * 改成玩家決定之後,稱號就成為真正的情報,風險也回到玩家自己的選擇上。
 */
export function runActivity(S, actId, rng) {
  const act = ACTIVITIES.find((a) => a.id === actId);
  if (!act) throw new Error(`未知活動:${actId}`);

  const th = examThreshold(S.dept, S.semester);
  if (!activityAvailable(act, S.ab, th.int)) {
    throw new Error(`活動門檻不足:${act.name}`);
  }

  S.stats.activitiesDone++;

  if (CONFIG.riskFromActivity) {
    S.risk += CONFIG.activityRiskValue[act.risk] || 0;
  }

  const targets = makeTargets(act, S, rng);
  const specials = targets.filter((t) => t.tier !== 'normal');
  const ordinary = targets.filter((t) => t.tier === 'normal');

  const results = ordinary.map((t) => attemptConquest(S, t, rng));
  const gained = results.filter((r) => r.counted).length;

  return { activity: act, results, gained, specials };
}
