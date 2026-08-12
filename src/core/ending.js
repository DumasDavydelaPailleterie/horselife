/* 結局判定 — 依規格草案 8.2 節的雙軸設計
 * 主軸:人斬總數(六級);副軸:結束方式(畢業 / 退學 / 玩太大出事)
 */

import { CONFIG } from '../data/config.js';

export function tierOf(kills) {
  for (const t of CONFIG.endingTiers) {
    if (kills >= t.min) return t;
  }
  return CONFIG.endingTiers[CONFIG.endingTiers.length - 1];
}

/* fatal 的語意是「從大學生活登出」——住院、被家裡關起來、學籍中斷,不是死亡 */
const SUFFIX = {
  graduated: '順利畢業',
  expelled: '中途退學',
  fatal: '提前登出',
};

export function makeEnding(S) {
  const tier = tierOf(S.kills);
  const reason = S.overReason;
  const graduated = reason === 'graduated';
  /* 畢業時 semester 已經被推到第 9 個(超出總數才觸發畢業),
   * 顯示用的「就讀學期數」要夾回總學期數,否則會出現「9 / 8」。 */
  const semestersPlayed = Math.min(S.semester, CONFIG.totalSemesters);

  let gradLine;
  if (graduated) {
    gradLine = '你順利拿到了畢業證書。';
  } else if (reason === 'fatal') {
    gradLine = S.fatalReason
      || '你玩得太大了，而且對方不是你可以碰的人。你的大學生活在這裡按下了停止鍵。';
  } else {
    gradLine = `你的學生證在第 ${semestersPlayed} 個學期就被收回了。`;
  }

  const stdCfg = S.std ? CONFIG.std[S.std] : null;

  return {
    tier: tier.key,
    tierName: tier.name,
    headline: `${tier.name}・${SUFFIX[reason] || '結束'}`,
    reason,
    graduated,
    kills: S.kills,
    semestersPlayed,
    ab: { ...S.ab },
    rep: S.rep,
    conquered: S.conquered.slice(),
    mentorFound: S.mentorFound,
    std: S.std,
    stdName: stdCfg ? stdCfg.name : null,
    stdSemesters: S.stdSemesters || 0,
    stdCured: S.stdCured || 0,
    fatalGirl: S.stats.fatalGirl || null,
    gradLine,
    stats: {
      ...S.stats,
      successRate: S.stats.attempts > 0
        ? Math.round((S.stats.successes / S.stats.attempts) * 100)
        : 0,
    },
  };
}
