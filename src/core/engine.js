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
import { rollAccident, endOfSemesterDecay, accidentChance } from './risk.js';
import { makeEnding } from './ending.js';
import { MENTORS, MENTOR_SESSIONS } from '../data/mentors.js';
import { examThreshold } from '../data/depts.js';

export function createGame({ name, dept, seed }) {
  const rng = createRng(seed);
  const S = newState({ name, dept, rng });

  /* 內部佇列:當前階段還要處理幾件事 */
  let queue = [];
  let pending = null;

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
      };
      return;
    }

    if (S.slots <= 0) { step(); return; }

    pending = {
      type: 'activity',
      list: listActivities(S),
      slotsLeft: S.slots,
      mentor: { available: false },
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

        const r = runActivity(S, action.actId, rng);
        S.slots--;

        /* 活動內容敘述 */
        const lines = r.results.map((x) =>
          `${x.target.name}（成功率 ${Math.round(x.rate)}%）${x.success ? '→ 成功' : '→ 沒有下文'}`);
        push(r.gained > 0 ? 'good' : 'info',
          `社交活動｜${r.activity.name}`,
          `接觸了 ${r.results.length} 位對象，成功 ${r.gained} 位。`,
          { detail: lines, gained: r.gained });

        /* 老學長發現判定(在活動之後,才有「活動中遇到他」的感覺) */
        const m = checkMentor(action.actId);

        if (S.slots > 0 || (m && S.mentorSessionsLeft > 0)) {
          openActivity();
        } else {
          step();
        }
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
    push(reason === 'graduated' ? 'gold' : 'bad',
      reason === 'graduated' ? '畢業' : '退學',
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
    over: S.over,
  });

  /* 啟動 */
  enterPhase();
  return game;
}
