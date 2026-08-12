/* 遊戲狀態建立 */

import { CONFIG } from '../data/config.js';
import { DEPTS } from '../data/depts.js';
import { GIRLS_BY_TIER } from '../data/girls.js';
import { clamp } from '../rng.js';

/* 生成潛力天花板:體力/學力/肌力隨機打亂後依序給上限範圍;技巧力另計
 *
 * 重要:天賦分佈雖然隨機,但學力與肌力的上限必須保證能達到畢業門檻,
 * 否則玩家會在開局就注定畢不了業(例如數學系大四下需要學力 65,
 * 若學力上限抽到最低那一檔的 48,無論怎麼玩都不可能過關)。
 * 因此這裡對這兩項設一個地板值:最後一學期的門檻再加上緩衝。
 */
function makePotential(rng, dept) {
  const keys = rng.shuffle(['sta', 'int', 'str']);
  const pot = {};
  keys.forEach((k, i) => {
    const [lo, hi] = CONFIG.potRanges[i];
    pot[k] = rng.int(lo, hi);
  });
  pot.skl = rng.int(CONFIG.potSkl[0], CONFIG.potSkl[1]);

  /* 保證畢業可能性 */
  const last = CONFIG.totalSemesters - 1;
  const buf = CONFIG.potExamBuffer;
  pot.int = Math.max(pot.int, dept.examInt[last] + buf);
  pot.str = Math.max(pot.str, dept.examStr[last] + buf);

  return pot;
}

/* 開場時決定哪些登出級女角這一局不存在。
 * 這是讓「2% 名冊佔比」在實際遊玩中也感覺得到稀有的關鍵。 */
function rollExcluded(rng) {
  const out = [];
  for (const g of GIRLS_BY_TIER.fatal) {
    if (!rng.chance(CONFIG.fatalInPlayChance * 100)) out.push(g.id);
  }
  return out;
}

export function newState({ name, dept, rng }) {
  const d = DEPTS[dept];
  if (!d) throw new Error(`未知科系:${dept}`);

  /* 起始能力:基準值加上隨機浮動;技巧力固定 1(已定案,不浮動) */
  const ab = {};
  for (const k of ['sta', 'int', 'str']) {
    const j = rng.int(-CONFIG.startJitter, CONFIG.startJitter);
    ab[k] = Math.max(1, d.start[k] + j);
  }
  ab.skl = d.start.skl;   /* 一律為 1 */

  const pot = makePotential(rng, d);
  /* 保險:潛力上限不得低於起始值 */
  for (const k of Object.keys(ab)) pot[k] = Math.max(pot[k], ab[k]);

  return {
    name,
    dept,
    deptName: d.name,
    age: CONFIG.startAge,
    year: CONFIG.startYear,
    semester: 1,                /* 1 ~ 8 */
    phaseIndex: 0,              /* 對應 PHASES 陣列 */
    ab,
    pot,
    sklFrac: 0,                 /* 技巧力的小數累積(失敗給 0.5,滿 1 才進位) */

    kills: 0,                   /* 生涯人斬 */
    conquered: [],              /* 已攻略對象 {name,title,tier,semester} */
    metIds: [],                 /* 已接觸過的名冊角色 id(同一局不再出現) */
    /* 這一局不存在的女角(開場時抽掉的登出級角色)。
     * 見 config.fatalInPlayChance 的說明。 */
    excludedIds: rollExcluded(rng),
    rep: 0,                     /* 校內風評,越高越難攻略 */
    risk: 0,                    /* 當學期意外風險累積 */

    std: null,                  /* 目前感染的性病:null / 'syphilis' / 'hiv' */
    stdSemesters: 0,            /* 已帶病幾個學期 */
    stdCured: 0,                /* 治癒過幾次 */
    /* 跟校醫室的護理師交流過就永久免疫,之後不會再被任何女角感染 */
    immune: false,

    slots: 0,                   /* 當學期剩餘社交活動場次 */
    bonusSlots: 0,              /* 骰子兌換與事件卡給的額外場次 */
    encBonus: 0,                /* 事件卡給的額外邂逅對象數 */

    mentorFound: false,         /* 是否已找到老學長 */
    mentorSessionsLeft: 0,      /* 剩餘帶浪次數 */
    mentorDone: false,          /* 三次帶浪是否已用完 */

    usedEventIds: [],           /* 已觸發的一次性事件 */
    semesterEventIds: [],       /* 當學期已抽過的事件(避免同學期重複) */

    log: [],                    /* 敘事紀錄 */
    stats: {                    /* 統計:給結局與平衡分析用 */
      killsBySemester: [],
      attempts: 0,
      successes: 0,
      activitiesDone: 0,
      fatalGirl: null,          /* 導致登出的女角姓名 */
    },

    over: false,
    /* 'graduated' 畢業 / 'expelled' 退學 / 'fatal' 玩太大出事 */
    overReason: null,
    ending: null,
  };
}

/* 能力加值(受潛力上限限制),回傳實際變動量 */
export function addAb(S, key, delta) {
  const before = S.ab[key];
  const cap = S.pot[key];
  let next = before + delta;
  if (delta > 0) next = Math.min(next, cap);
  next = Math.max(1, next);
  S.ab[key] = next;
  return next - before;
}

/* 技巧力專用:支援小數累積(失敗嘗試給 0.5) */
export function addSkl(S, amount) {
  S.sklFrac += amount;
  const whole = Math.floor(S.sklFrac);
  if (whole > 0) {
    S.sklFrac -= whole;
    return addAb(S, 'skl', whole);
  }
  return 0;
}

/* 綜合值:給記分板顯示用 */
export function ovr(S) {
  const { sta, int: iq, str, skl } = S.ab;
  return Math.round((sta + iq + str + skl) / 4);
}

export { clamp };
