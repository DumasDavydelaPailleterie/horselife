/* 自動模擬器 — 平衡驗證與流程驗證
 *
 * 用法:node sim/playthrough.js [每科系輪數]
 *
 * 目的:
 *   1. 驗證四個科系都能完整走完流程(不崩潰)
 *   2. 統計退學率、人斬數分佈、結局等級分佈,用數據檢查平衡
 *   3. 比較不同策略(顧學業 / 衝社交 / 均衡 / 找老學長)的結果差異
 */

import { createGame } from '../src/core/engine.js';
import { CONFIG } from '../src/data/config.js';
import { DEPTS, DEPT_KEYS } from '../src/data/depts.js';
import { MENTORS } from '../src/data/mentors.js';

/* ---------- 自動玩家策略 ---------- */

/* 骰子分配:先補期末考差距,達標後換社交場次 */
function diceBalanced(game, pending) {
  const S = game.state;
  const th = game.info().exam;
  /* 逐顆分配,並在過程中追蹤已投入的點數,避免超投 */
  let intGap = th.int - S.ab.int;
  let strGap = th.str - S.ab.str;
  return pending.dice.map((pip, i) => {
    if (intGap > 0 && intGap >= strGap) { intGap -= pip; return { die: i, to: 'int' }; }
    if (strGap > 0) { strGap -= pip; return { die: i, to: 'str' }; }
    /* 兩項都達標:多餘的點數投體力(提高場次)或直接換場次 */
    return { die: i, to: pip >= 4 ? 'social' : 'sta' };
  });
}

/* 骰子分配:預留安全邊際。邊際越大越保守,但能換到的社交場次越少 */
function makeDiceWithMargin(margin) {
  return function diceMargin(game, pending) {
    const S = game.state;
    const th = game.info().exam;
    let intGap = th.int + margin - S.ab.int;
    let strGap = th.str + margin - S.ab.str;
    return pending.dice.map((pip, i) => {
      if (intGap > 0 && intGap >= strGap) { intGap -= pip; return { die: i, to: 'int' }; }
      if (strGap > 0) { strGap -= pip; return { die: i, to: 'str' }; }
      return { die: i, to: 'social' };
    });
  };
}

/* 骰子分配:全部換社交場次(極端衝量,預期會被退學) */
function diceAllSocial(game, pending) {
  return pending.dice.map((_, i) => ({ die: i, to: 'social' }));
}

const DICE_POLICIES = {
  balanced: diceBalanced,
  margin2: makeDiceWithMargin(2),
  margin4: makeDiceWithMargin(4),
  allSocial: diceAllSocial,
};

/* 活動選擇 */
function chooseActivity(game, pending, policy) {
  const S = game.state;
  const avail = pending.list.filter((a) => a.available);
  if (avail.length === 0) return null;

  /* 大一優先去找老學長(除了 noMentor 策略) */
  if (policy !== 'noMentor' && !S.mentorFound && Math.ceil(S.semester / 2) === 1) {
    const target = avail.find((a) => a.id === MENTORS[S.dept].activity);
    if (target) return target;
  }
  /* 其餘時候選流量最高的 */
  return avail.reduce((x, y) => (y.enc > x.enc ? y : x));
}

/* 執行一整局 */
function playOne({ dept, seed, dicePolicy = 'balanced', actPolicy = 'default',
                  eventPolicy = 'normal', specialPolicy = 'accept' }) {
  const game = createGame({ name: '模擬員', dept, seed });
  const dice = DICE_POLICIES[dicePolicy];
  let steps = 0;

  while (game.pending.type !== 'gameover') {
    if (++steps > 50000) throw new Error(`無限迴圈:${dept} / ${seed}`);
    const p = game.pending;

    switch (p.type) {
      case 'dice':
        game.submit({ assignments: dice(game, p) });
        break;
      case 'event':
        game.submit({ response: eventPolicy });
        break;
      case 'activity': {
        if (p.mentor?.available) { game.submit({ mentor: true }); break; }
        /* 生病就先治療:不治療的話每學期扣能力,期末考很快就過不了 */
        if (p.cure?.available) { game.submit({ cure: true }); break; }
        const act = chooseActivity(game, p, actPolicy);
        if (!act) { game.submit({ skip: true }); break; }
        game.submit({ actId: act.id });
        break;
      }
      case 'special':
        /* 特殊角色的出手決策。模擬器只看得到稱號與情境(跟玩家一樣),
         * 看不到分級,所以策略只有「一律出手」與「一律收手」兩種極端。 */
        game.submit({ go: specialPolicy !== 'decline' });
        break;
      default:
        game.submit({});
        break;
    }
  }
  return { ending: game.pending.ending, state: game.state };
}

/* ---------- 統計 ---------- */

function pct(n, total) {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function runBatch({ dept, rounds, dicePolicy, actPolicy, eventPolicy, specialPolicy, seedPrefix }) {
  const kills = [];
  const tiers = {};
  let graduated = 0;
  let mentorFound = 0;
  let loggedOut = 0;
  let infected = 0;
  let hiv = 0;
  const expelSemesters = [];

  for (let i = 0; i < rounds; i++) {
    const { ending, state } = playOne({
      dept, seed: `${seedPrefix}-${dept}-${i}`, dicePolicy, actPolicy, eventPolicy, specialPolicy,
    });
    kills.push(ending.kills);
    tiers[ending.tierName] = (tiers[ending.tierName] || 0) + 1;
    if (ending.graduated) graduated++; else expelSemesters.push(state.semester);
    if (ending.reason === 'fatal') loggedOut++;
    if (state.std || state.stdCured > 0) infected++;
    if (state.std === 'hiv') hiv++;
    if (state.mentorFound) mentorFound++;
  }

  return {
    dept, rounds, graduated,
    gradRate: graduated / rounds,
    mentorRate: mentorFound / rounds,
    logoutRate: loggedOut / rounds,
    infectRate: infected / rounds,
    hivRate: hiv / rounds,
    killsAvg: kills.reduce((a, b) => a + b, 0) / rounds,
    killsMedian: median(kills),
    killsMax: Math.max(...kills),
    killsMin: Math.min(...kills),
    expelAvgSemester: expelSemesters.length
      ? expelSemesters.reduce((a, b) => a + b, 0) / expelSemesters.length : null,
    tiers,
  };
}

/* ---------- 主程式 ---------- */

const ROUNDS = Number(process.argv[2]) || 200;

console.log('='.repeat(72));
console.log(`大種馬 — 自動模擬報告(每個科系每種策略 ${ROUNDS} 輪)`);
console.log('='.repeat(72));

const STRATEGIES = [
  {
    key: 'newbie', label: '新手（不留邊際、事件都照常執行）',
    dicePolicy: 'balanced', actPolicy: 'default', eventPolicy: 'normal',
  },
  {
    key: 'careful', label: '熟練（留 4 點邊際、事件都保守應對）',
    dicePolicy: 'margin4', actPolicy: 'default', eventPolicy: 'safe',
  },
  {
    key: 'greedy', label: '貪心（只留 2 點邊際、事件保守）',
    dicePolicy: 'margin2', actPolicy: 'default', eventPolicy: 'safe',
  },
  {
    key: 'allSocial', label: '極端衝量（骰子全換場次）',
    dicePolicy: 'allSocial', actPolicy: 'default', eventPolicy: 'safe',
  },
  {
    key: 'cautious', label: '謹慎（留 4 點邊際、對特殊角色一律收手）',
    dicePolicy: 'margin4', actPolicy: 'default', eventPolicy: 'safe',
    specialPolicy: 'decline',
  },
  {
    key: 'noMentor', label: '熟練但不找老學長',
    dicePolicy: 'margin4', actPolicy: 'noMentor', eventPolicy: 'safe',
  },
];

const allResults = {};
let anyFailure = false;

for (const strat of STRATEGIES) {
  console.log(`\n【策略】${strat.label}`);
  console.log('-'.repeat(72));
  console.log('科系      畢業率   登出率  感染率  老學長   人斬平均  中位數  最高  最低');
  allResults[strat.key] = {};

  for (const dept of DEPT_KEYS) {
    let r;
    try {
      r = runBatch({
        dept, rounds: ROUNDS,
        dicePolicy: strat.dicePolicy,
        actPolicy: strat.actPolicy,
        eventPolicy: strat.eventPolicy,
        specialPolicy: strat.specialPolicy || 'accept',
        seedPrefix: strat.key,
      });
    } catch (e) {
      anyFailure = true;
      console.log(`${DEPTS[dept].name.padEnd(8)} 執行失敗:${e.message}`);
      continue;
    }
    allResults[strat.key][dept] = r;
    console.log(
      `${DEPTS[dept].name.padEnd(8)}` +
      `${pct(r.graduated, r.rounds).padStart(7)}  ` +
      `${(r.logoutRate * 100).toFixed(1).padStart(5)}%  ` +
      `${(r.infectRate * 100).toFixed(0).padStart(5)}%  ` +
      `${(r.mentorRate * 100).toFixed(0).padStart(5)}%  ` +
      `${r.killsAvg.toFixed(1).padStart(8)}  ` +
      `${String(r.killsMedian).padStart(6)}  ` +
      `${String(r.killsMax).padStart(4)}  ` +
      `${String(r.killsMin).padStart(4)}`,
    );
  }
}

/* 結局等級分佈(以均衡策略為代表) */
console.log(`\n【結局等級分佈】熟練策略`);
console.log('-'.repeat(72));
for (const dept of DEPT_KEYS) {
  const r = allResults.careful?.[dept];
  if (!r) continue;
  const parts = CONFIG.endingTiers
    .map((t) => {
      const n = r.tiers[t.name] || 0;
      return n > 0 ? `${t.name} ${pct(n, r.rounds)}` : null;
    })
    .filter(Boolean);
  console.log(`${DEPTS[dept].name}：${parts.join('｜')}`);
}

/* ---------- 驗收檢查 ---------- */

console.log(`\n【驗收檢查】`);
console.log('-'.repeat(72));

const checks = [];

/* 檢查一:四個科系在均衡策略下都要能畢業 */
for (const dept of DEPT_KEYS) {
  const r = allResults.careful?.[dept];
  checks.push({
    name: `${DEPTS[dept].name} 熟練玩法的畢業率高於七成`,
    pass: !!r && r.gradRate > 0.7,
    detail: r ? `畢業率 ${pct(r.graduated, r.rounds)}` : '無資料',
  });
}

/* 檢查二:極端衝量策略應該大量退學(證明張力存在) */
for (const dept of DEPT_KEYS) {
  const r = allResults.allSocial?.[dept];
  checks.push({
    name: `${DEPTS[dept].name} 極端衝量會被退學（核心張力有效）`,
    pass: !!r && r.gradRate < 0.5,
    detail: r ? `畢業率 ${pct(r.graduated, r.rounds)}` : '無資料',
  });
}

/* 檢查三:老學長要有實質影響力。
 * 門檻設為人斬數至少高出 15%,否則只是浮點數尾差,通過了也沒有意義。
 * 已知外文系與數學系不靠老學長也能養起技巧力(見開發成果文件 4.3 節),
 * 所以這裡的驗收標準是「至少一半的科系有實質差距」,而不是每個科系都要有。 */
{
  const MEANINGFUL = 0.15;
  const detail = [];
  let meaningful = 0;
  for (const dept of DEPT_KEYS) {
    const withM = allResults.careful?.[dept];
    const without = allResults.noMentor?.[dept];
    if (!withM || !without) continue;
    const lift = without.killsAvg > 0
      ? (withM.killsAvg - without.killsAvg) / without.killsAvg : 0;
    if (lift >= MEANINGFUL) meaningful++;
    detail.push(`${DEPTS[dept].name} ${(lift * 100).toFixed(0)}%`);
  }
  checks.push({
    name: `老學長至少對半數科系有實質影響（人斬數高出 ${MEANINGFUL * 100}% 以上）`,
    pass: meaningful >= Math.ceil(DEPT_KEYS.length / 2),
    detail: `達標 ${meaningful}/${DEPT_KEYS.length} 個科系｜提升幅度 ${detail.join('、')}`,
  });
}

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? '  通過' : '  未通過'}  ${c.name}（${c.detail}）`);
  if (!c.pass) failed++;
}

console.log('-'.repeat(72));
console.log(`共 ${checks.length} 項檢查，通過 ${checks.length - failed} 項，未通過 ${failed} 項。`);
if (anyFailure) console.log('注意:有批次執行失敗,請看上方訊息。');

process.exit(failed > 0 || anyFailure ? 1 : 0);
