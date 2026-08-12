/* 學期流程狀態機
 *
 * 設計原則:引擎不碰 DOM、不使用回呼。它持有一個「當前待處理事項」(pending),
 * 外部(畫面或測試程式)讀取 pending、送出 submit(action),引擎推進到下一個 pending。
 * 這讓測試程式與真實畫面用完全相同的方式驅動遊戲。
 *
 * pending 的型別:
 *   { type:'dice',     dice:[n,n,n], assigned:[] }        玩家分配骰子
 *   { type:'event',    card, options:[...] }               玩家選擇應對方式
 *   { type:'midterm',  warning }                           期中預警,只需確認
 *   { type:'activity', list, slotsLeft, mentor? }           玩家選擇社交活動
 *   { type:'mentor',   session }                            老學長帶浪,只需確認
 *   { type:'exam',     result }                             期末考結果,只需確認
 *   { type:'accident', outcome }                            意外事件,只需確認
 *   { type:'gameover', ending }                             結束
 */

import { CONFIG, PHASES, SEMESTER_NAMES, gradeOf } from '../data/config.js';
import { createRng } from '../rng.js';
import { newState, addAb, addSkl, ovr } from './state.js';
import { runExam, midtermWarning } from './exam.js';
import { drawCard, resolveCard, eventsForPhase } from './eventcard.js';
import { listActivities, runActivity, totalSlots, baseSlots } from './activity.js';
import { rateFor, attemptConquest } from './conquest.js';
import { rollAccident, endOfSemesterDecay, accidentChance } from './risk.js';
import { makeEnding } from './ending.js';
import { applyStdPenalty, canCure, attemptCure, stdInfo, grantImmunity } from './health.js';
import { MENTORS, MENTOR_SESSIONS } from '../data/mentors.js';
import { examThreshold } from '../data/depts.js';

export function createGame({ name, dept, seed }) {
  const rng = createRng(seed);
  const S = newState({ name, dept, rng });

  /* 內部佇列:當前階段還要處理幾件事 */
  let queue = [];
  let pending = null;
  /* 一場活動裡遇到的特殊角色,等玩家逐一決定 */
  let specialQueue = [];
  let lastMentor = null;

  const game = {
    get state() { return S; },
    get pending() { return pending; },
    get seed() { return seed; },
    log: S.log,
  };

  /* ---------- 敘事紀錄 ---------- */
  function push(kind, title, text, extra = {}) {
    S.log.push({
      semester: S.semester,
      semesterName: SEMESTER_NAMES[S.semester - 1],
      phase: PHASES[S.phaseIndex],
      kind, title, text, ...extra,
    });
  }
  game.push = push;

  /* ---------- 階段內容建構 ---------- */

  function enterPhase() {
    const phase = PHASES[S.phaseIndex];
    queue = [];

    if (phase === 'H1') {
      /* 學期開始:重設當學期狀態 */
      S.semesterEventIds = [];
      S.bonusSlots = 0;
      S.encBonus = 0;
      push('info', `${SEMESTER_NAMES[S.semester - 1]} 開始`,
        `${S.year} 年，${S.deptName} ${S.name}，${gradeOf(S.semester)} 年級。`);
      queue.push({ kind: 'dice' });
      for (let i = 0; i < eventsForPhase('H1'); i++) queue.push({ kind: 'event' });
    } else if (phase === 'MID') {
      queue.push({ kind: 'midterm' });
      for (let i = 0; i < eventsForPhase('MID'); i++) queue.push({ kind: 'event' });
    } else if (phase === 'H2') {
      /* 社交活動期:場次用完為止 */
      S.slots = totalSlots(S);
      for (let i = 0; i < eventsForPhase('H2'); i++) queue.push({ kind: 'event' });
      queue.push({ kind: 'activityLoop' });
      queue.push({ kind: 'accident' });
    } else if (phase === 'FIN') {
      queue.push({ kind: 'exam' });
    } else if (phase === 'VAC') {
      for (let i = 0; i < eventsForPhase('VAC'); i++) queue.push({ kind: 'event' });
      queue.push({ kind: 'endSemester' });
    }

    step();
  }

  /* ---------- 佇列推進 ---------- */

  function step() {
    if (S.over) { pending = { type: 'gameover', ending: S.ending }; return; }

    if (queue.length === 0) {
      /* 本階段結束,進入下一階段 */
      S.phaseIndex++;
      if (S.phaseIndex >= PHASES.length) {
        S.phaseIndex = 0;
        S.semester++;
        S.age = CONFIG.startAge + Math.floor((S.semester - 1) / 2);
        S.year = CONFIG.startYear + Math.floor((S.semester - 1) / 2);
        if (S.semester > CONFIG.totalSemesters) {
          finish('graduated');
          return;
        }
      }
      enterPhase();
      return;
    }

    const item = queue.shift();

    switch (item.kind) {
      case 'dice': {
        const dice = [];
        for (let i = 0; i < CONFIG.dicePerSemester; i++) {
          dice.push(rng.int(1, CONFIG.diceFaces));
        }
        pending = { type: 'dice', dice, remaining: dice.slice(), assigned: [] };
        return;
      }
      case 'event': {
        const phase = PHASES[S.phaseIndex];
        const card = drawCard(S, phase, rng);
        if (!card) { step(); return; }     /* 卡池空了就跳過 */
        pending = {
          type: 'event',
          card,
          options: Object.entries(CONFIG.responses).map(([k, v]) => ({
            key: k, label: v.label, rate: v.rate, mag: v.mag,
          })),
        };
        return;
      }
      case 'midterm': {
        const w = midtermWarning(S);
        if (w.safe) {
          push('good', '期中考', '兩項門檻都已達標，這學期期末沒有懸念。');
        } else {
          const t = w.warnings
            .map((x) => `${x.name} 還差 ${x.gap} 點（目前 ${x.have}，期末需要 ${x.need}）`)
            .join('；');
          push('bad', '期中考警訊', `照這個進度期末會過不了：${t}。`);
        }
        pending = { type: 'midterm', warning: w };
        return;
      }
      case 'activityLoop': {
        openActivity();
        return;
      }
      case 'accident': {
        const r = rollAccident(S, rng);
        if (r.triggered) {
          push('bad', `意外事件：${r.outcome.card.n}`, r.outcome.text,
            { applied: r.outcome.applied, chance: r.chance });
          pending = { type: 'accident', outcome: r.outcome, chance: r.chance };
          return;
        }
        step();
        return;
      }
      case 'exam': {
        const result = runExam(S);
        if (result.passed) {
          push('good', '期末考', `學力 ${S.ab.int}／需要 ${result.threshold.int}，肌力 ${S.ab.str}／需要 ${result.threshold.str}。過了。`);
          pending = { type: 'exam', result };
        } else {
          const t = result.failed
            .map((f) => `${f.name} ${f.have}（需要 ${f.need}）`).join('、');
          push('bad', '期末考不及格', `${t}。你被二一了。`);
          finish('expelled');
        }
        return;
      }
      case 'endSemester': {
        S.stats.killsBySemester.push(
          S.kills - S.stats.killsBySemester.reduce((a, b) => a + b, 0),
        );
        endOfSemesterDecay(S);
        /* 帶病的話,每學期結算時扣能力與風評 */
        const p = applyStdPenalty(S);
        if (p) {
          push('bad', `病情｜${p.name}`,
            `已經帶著 ${p.name} 度過 ${p.semesters} 個學期，身體撐不住了。`,
            { applied: p.applied });
        }
        step();
        return;
      }
      default:
        step();
        return;
    }
  }

  /* ---------- 社交活動 ---------- */

  function openActivity() {
    /* 老學長帶浪優先提示(找到之後才會出現) */
    if (S.mentorFound && S.mentorSessionsLeft > 0 && S.slots >= CONFIG.mentorSlotCost) {
      const idx = CONFIG.mentorSessions - S.mentorSessionsLeft;
      pending = {
        type: 'activity',
        list: listActivities(S),
        slotsLeft: S.slots,
        mentor: {
          available: true,
          session: MENTOR_SESSIONS[idx],
          sklGain: CONFIG.mentorSklPerSession,
          cost: CONFIG.mentorSlotCost,
        },
        cure: cureOption(),
      };
      return;
    }

    if (S.slots <= 0) { step(); return; }

    pending = {
      type: 'activity',
      list: listActivities(S),
      slotsLeft: S.slots,
      mentor: { available: false },
      cure: cureOption(),
    };
  }

  /* 宣告取得性病免疫。狀態本身在 applyGirlEffect 已經設好了 */
  function announceImmunity(girl) {
    push('gold', '獲得免疫｜性病',
      `${girl.name} 把該講的都講清楚了，也把該給的都給你了。`
      + `\n從現在起，不論你去哪裡、遇到誰，都不會再被感染。`);
  }

  /* 特殊角色佇列:一場活動裡遇到的有稱號角色,逐一交給玩家決定 */
  function nextSpecial() {
    if (specialQueue.length === 0) { afterActivity(); return; }
    const girl = specialQueue.shift();
    pending = {
      type: 'special',
      /* 給畫面的資料刻意不含 tier 與 eff——玩家只能靠稱號與情境判斷,
       * 這正是這個機制的重點:資訊不完全下的風險決策 */
      girl: {
        name: girl.name, title: girl.title, desc: girl.desc, diff: girl.diff,
      },
      rate: Math.round(rateFor(S, girl)),
      remaining: specialQueue.length,
      /* 引擎自己結算時要用的完整資料 */
      girlFull: girl,
    };
  }

  /* 活動結束後的收尾:還有場次就繼續,沒有就進下一個階段 */
  function afterActivity() {
    if (S.slots > 0 || (lastMentor && S.mentorSessionsLeft > 0)) {
      lastMentor = null;
      openActivity();
    } else {
      lastMentor = null;
      step();
    }
  }

  /* 就醫選項:只有帶著可治癒的病、而且場次還夠的時候才出現 */
  function cureOption() {
    const info = stdInfo(S);
    if (!info) return { available: false };
    if (!info.curable) {
      return { available: false, incurable: true, name: info.name };
    }
    return {
      available: canCure(S),
      name: info.name,
      rate: info.cureRate,
      cost: info.cureSlots,
    };
  }

  /* ---------- 老學長發現判定 ---------- */

  function checkMentor(actId) {
    if (S.mentorFound) return null;
    if (gradeOf(S.semester) !== 1) return null;     /* 只在大一出現 */
    const m = MENTORS[S.dept];
    if (!m || m.activity !== actId) return null;

    S.mentorFound = true;
    S.mentorSessionsLeft = CONFIG.mentorSessions;
    push('gold', `隱藏角色：${m.name}`, `${m.desc}\n${m.result}`);
    return m;
  }

  /* ---------- 玩家動作 ---------- */

  game.submit = function submit(action) {
    if (!pending) throw new Error('目前沒有待處理事項');

    switch (pending.type) {
      case 'dice': {
        /* action: { assignments: [{die:index, to:'sta'|'int'|'str'|'social'}, ...] } */
        const { assignments } = action;
        if (!Array.isArray(assignments) || assignments.length !== pending.dice.length) {
          throw new Error(`必須分配全部 ${pending.dice.length} 顆骰`);
        }
        const parts = [];
        assignments.forEach((a) => {
          const pip = pending.dice[a.die];
          if (pip === undefined) throw new Error(`骰子索引無效:${a.die}`);
          if (a.to === 'social') {
            const gain = Math.floor(pip / CONFIG.slotPerDiceDiv);
            S.bonusSlots += gain;
            parts.push(`${pip} 點換社交場次 +${gain}`);
          } else if (CONFIG.allocatableAbilities.includes(a.to)) {
            const actual = addAb(S, a.to, pip);
            const names = { sta: '體力', int: '學力', str: '肌力' };
            parts.push(`${names[a.to]} +${actual}${actual < pip ? '（已達上限）' : ''}`);
          } else {
            throw new Error(`不可分配的目標:${a.to}`);
          }
        });
        push('info', '訓練成果', parts.join('，') + '。');
        step();
        return;
      }

      case 'event': {
        /* action: { response: 'bold'|'normal'|'safe' } */
        const res = resolveCard(S, pending.card, action.response, rng);
        push(res.success ? 'good' : 'bad',
          `事件卡｜${pending.card.n}（${res.responseLabel}）`,
          res.text, { applied: res.applied });
        step();
        return;
      }

      case 'midterm':
      case 'exam':
      case 'accident':
      case 'mentor': {
        /* 只需確認,沒有選項 */
        if (pending.type === 'mentor') {
          /* 帶浪結算已在 submit activity 時完成,這裡只是閱讀 */
        }
        step();
        return;
      }

      case 'activity': {
        /* action: { actId } 或 { mentor: true } 或 { skip: true } */
        if (action.skip) {
          S.slots = 0;
          step();
          return;
        }

        if (action.mentor) {
          if (!pending.mentor?.available) throw new Error('目前沒有帶浪機會');
          const idx = CONFIG.mentorSessions - S.mentorSessionsLeft;
          const session = MENTOR_SESSIONS[idx];
          S.slots -= CONFIG.mentorSlotCost;
          S.mentorSessionsLeft--;
          if (S.mentorSessionsLeft === 0) S.mentorDone = true;
          const actual = addSkl(S, CONFIG.mentorSklPerSession);
          push('gold', `老學長｜${session.n}`, session.text,
            { applied: [{ key: 'skl', amount: CONFIG.mentorSklPerSession, actual }] });
          openActivity();
          return;
        }

        if (action.cure) {
          const res = attemptCure(S, rng);
          if (res.cured) {
            push('good', `就醫｜${res.name}`,
              `療程結束，複檢結果是陰性。你把那張報告收進抽屜最裡面。`,
              { applied: res.applied });
          } else {
            push('bad', `就醫｜${res.name}`,
              `療程沒有奏效（成功率 ${res.rate}%），醫生要你下次再來一趟。`,
              { applied: res.applied });
          }
          openActivity();
          return;
        }

        const r = runActivity(S, action.actId, rng);
        S.slots--;

        /* 一般對象的批次結果。detail 給結構化資料,由畫面決定怎麼排 */
        if (r.results.length > 0) {
          const lines = r.results.map((x) => ({
            name: x.target.name,
            rate: Math.round(x.rate),
            ok: x.success,
          }));
          push(r.gained > 0 ? 'good' : 'info',
            `${r.activity.name}`,
            `接觸 ${r.results.length} 位，成立 ${r.gained} 位。`,
            { detail: lines, gained: r.gained });
        } else {
          push('info', `社交活動｜${r.activity.name}`, '這一場沒有遇到什麼普通的對象。');
        }

        /* 老學長發現判定(在活動之後,才有「活動中遇到他」的感覺) */
        lastMentor = checkMentor(action.actId);

        /* 有稱號的特殊角色排成佇列,交給玩家逐一決定 */
        specialQueue = r.specials.slice();
        if (specialQueue.length > 0) { nextSpecial(); return; }

        afterActivity();
        return;
      }

      case 'special': {
        /* action: { go: true } 出手 / { go: false } 收手 */
        const t = pending.girlFull;
        if (!action.go) {
          if (t.id && !S.metIds.includes(t.id)) S.metIds.push(t.id);
          push('info', `${t.name}｜${t.title}`,
            `${t.desc}\n你想了一下，決定今天先不要。`);
          nextSpecial();
          return;
        }

        const x = attemptConquest(S, t, rng);
        const kind = x.success
          ? (t.tier === 'positive' ? 'gold' : 'bad')
          : 'info';
        const body = x.success
          ? `${t.desc}\n${t.hit}`
          : `${t.desc}\n你出手了，但沒有成功（成功率 ${Math.round(x.rate)}%）。`;
        push(kind, `${t.name}｜${t.title}`, body, { applied: x.applied });

        if (x.std) {
          push('bad', `確診｜${x.std.info.name}`, x.std.info.desc);
        }
        if (x.immuneBlocked) {
          push('good', '沒事',
            '如果不是校醫室那位護理師當初講的那些，這次大概就中了。');
        }
        /* 免疫的取得條件是攻略成功(人斬 +1),收手與出手失敗都不算。
         * 效果本身已由 applyGirlEffect 套用,這裡只負責宣告。 */
        if (x.applied.some((a) => a.key === 'immune')) announceImmunity(t);

        /* 登出級女角:立刻結束,不再處理任何後續 */
        if (x.fatal) {
          S.fatalReason = x.fatal;
          finish('fatal');
          return;
        }

        nextSpecial();
        return;
      }

      case 'gameover':
        throw new Error('遊戲已結束');

      default:
        throw new Error(`未知的待處理型別:${pending.type}`);
    }
  };

  /* ---------- 結束 ---------- */

  function finish(reason) {
    S.over = true;
    S.overReason = reason;
    S.ending = makeEnding(S);
    /* fatal = 從大學生活登出(住院、被家裡帶回去關起來、學籍中斷) */
    const titles = { graduated: '畢業', expelled: '退學', fatal: '人生登出' };
    push(reason === 'graduated' ? 'gold' : 'bad',
      titles[reason] || '結束',
      `${S.ending.gradLine} 生涯人斬 ${S.kills} 人，評價：${S.ending.tierName}。`);
    pending = { type: 'gameover', ending: S.ending };
  }

  /* ---------- 對外輔助 ---------- */
  game.info = () => ({
    name: S.name, dept: S.deptName, age: S.age, year: S.year,
    semester: S.semester, semesterName: SEMESTER_NAMES[S.semester - 1] || '—',
    phase: PHASES[S.phaseIndex], grade: gradeOf(S.semester),
    ab: { ...S.ab }, pot: { ...S.pot }, ovr: ovr(S),
    kills: S.kills, rep: S.rep, risk: S.risk,
    slots: S.slots, baseSlots: baseSlots(S), bonusSlots: S.bonusSlots,
    exam: S.semester <= CONFIG.totalSemesters ? examThreshold(S.dept, S.semester) : null,
    accidentChance: accidentChance(S),
    mentorFound: S.mentorFound, mentorSessionsLeft: S.mentorSessionsLeft,
    std: S.std, stdName: S.std ? CONFIG.std[S.std].name : null,
    stdSemesters: S.stdSemesters || 0, immune: !!S.immune,
    over: S.over,
    /* 給頁首的學期進度格判斷「這一格是不是被退學的那一格」 */
    graduated: S.overReason === 'graduated',
  });

  /* 啟動 */
  enterPhase();
  return game;
}
