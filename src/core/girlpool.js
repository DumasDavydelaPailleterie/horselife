/* 女角抽取:從名冊中依活動地點與權重挑人 */

import { CONFIG } from '../data/config.js';
import { GIRLS, girlAvailableAt, GENERIC_DESC, GENERIC_HIT } from '../data/girls.js';
import { ACT_BY_ID } from '../data/activities.js';
import { makeName } from '../data/names.js';

/* 該活動可能出現、且尚未被攻略過的候選名單 */
export function candidates(S, actId) {
  const act = ACT_BY_ID[actId];
  const done = new Set(S.conquered.map((c) => c.name));
  return GIRLS.filter((g) => {
    if ((S.excludedIds || []).includes(g.id)) return false;
    /* 可重複遇到的角色(例如校醫室的護理師)只有在攻略成功之後才會消失,
     * 出手失敗還可以再來。其他角色接觸過一次就不會再出現。 */
    if (g.repeatable) {
      if (done.has(g.name)) return false;
    } else if (S.metIds.includes(g.id)) {
      return false;
    }
    /* 專屬場所只讓明確指定在此出現的角色登場,不限地點的一般角色不會混進來 */
    if (act?.exclusive) return Array.isArray(g.where) && g.where.includes(actId);
    return girlAvailableAt(g, actId);
  });
}

/* 依權重抽一位。權重讓特殊角色比一般角色罕見得多 */
function weightedPick(list, rng) {
  const weights = list.map((g) => CONFIG.girlWeights[g.tier] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/* 名冊抽完時的備援:隨機生成一位無特效的路人,避免遊戲卡住 */
function randomStranger(S, rng, actDiff) {
  return {
    id: null,
    name: makeName(rng),
    title: '路人',
    tier: 'normal',
    diff: actDiff,
    where: null,
    generated: true,
  };
}

/* 為一場活動抽出 n 位對象。同一場不重複 */
export function drawGirls(S, actId, n, actDiff, rng) {
  const pool = candidates(S, actId);
  const picked = [];
  const usedThisRound = new Set();

  for (let i = 0; i < n; i++) {
    const avail = pool.filter((g) => !usedThisRound.has(g.id));
    let g = avail.length > 0 ? weightedPick(avail, rng) : null;

    if (!g) {
      if (!CONFIG.girlFallbackToRandom) break;
      picked.push(randomStranger(S, rng, actDiff));
      continue;
    }

    usedThisRound.add(g.id);
    /* 一般角色沒有專屬文案,補上通用句子 */
    picked.push({
      ...g,
      desc: g.desc || rng.pick(GENERIC_DESC),
      hit: g.hit || rng.pick(GENERIC_HIT),
    });
  }
  return picked;
}
