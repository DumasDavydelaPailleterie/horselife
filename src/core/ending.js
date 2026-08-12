/* 結局判定 — 依規格草案 8.2 節的雙軸設計
 * 主軸:人斬總數(六級);副軸:畢業狀態
 */

import { CONFIG } from '../data/config.js';

export function tierOf(kills) {
  for (const t of CONFIG.endingTiers) {
    if (kills >= t.min) return t;
  }
  return CONFIG.endingTiers[CONFIG.endingTiers.length - 1];
}

const GRAD_TEXT = {
  graduated: '你順利拿到了畢業證書。',
  expelled: '你的學生證在第 %s 個學期就被收回了。',
};

export function makeEnding(S) {
  const tier = tierOf(S.kills);
  const graduated = S.overReason === 'graduated';
  /* 畢業時 semester 已經被推到第 9 個(超出總數才觸發畢業),
   * 顯示用的「就讀學期數」要夾回總學期數,否則會出現「9 / 8」。 */
  const semestersPlayed = Math.min(S.semester, CONFIG.totalSemesters);

  let headline;
  if (graduated) {
    headline = `${tier.name}・順利畢業`;
  } else {
    headline = `${tier.name}・中途退學`;
  }

  const gradLine = graduated
    ? GRAD_TEXT.graduated
    : GRAD_TEXT.expelled.replace('%s', String(semestersPlayed));

  return {
    tier: tier.key,
    tierName: tier.name,
    headline,
    graduated,
    kills: S.kills,
    semestersPlayed,
    ab: { ...S.ab },
    rep: S.rep,
    conquered: S.conquered.slice(),
    mentorFound: S.mentorFound,
    gradLine,
    stats: {
      ...S.stats,
      successRate: S.stats.attempts > 0
        ? Math.round((S.stats.successes / S.stats.attempts) * 100)
        : 0,
    },
  };
}
