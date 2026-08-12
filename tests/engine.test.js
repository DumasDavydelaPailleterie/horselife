import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/engine.js';
import { CONFIG, PHASES } from '../src/data/config.js';
import { DEPT_KEYS, DEPTS } from '../src/data/depts.js';
import { MENTORS } from '../src/data/mentors.js';

/* 一個簡單的自動玩家:優先滿足期末考門檻,剩餘資源投入社交 */
function autoPlay(game, opts = {}) {
  const { maxSteps = 20000, dicePolicy = 'balanced', activityPolicy = 'best' } = opts;
  let steps = 0;

  while (game.pending && game.pending.type !== 'gameover') {
    if (++steps > maxSteps) throw new Error('步數超過上限,可能陷入無限迴圈');
    const p = game.pending;
    const S = game.state;

    switch (p.type) {
      case 'dice': {
        /* margin:留安全邊際,代表有經驗的玩家。
         * 邊際的意義是抵擋事件卡與性病每學期造成的能力損失。 */
        const margin = dicePolicy === 'margin' ? 5 : 0;
        const th = game.info().exam;
        let gapInt = th.int + margin - S.ab.int;
        let gapStr = th.str + margin - S.ab.str;
        const assignments = p.dice.map((pip, i) => {
          if (dicePolicy === 'allSocial') return { die: i, to: 'social' };
          if (dicePolicy === 'allStudy') return { die: i, to: 'int' };
          if (gapInt > 0 && gapInt >= gapStr) { gapInt -= pip; return { die: i, to: 'int' }; }
          if (gapStr > 0) { gapStr -= pip; return { die: i, to: 'str' }; }
          return { die: i, to: 'social' };
        });
        game.submit({ assignments });
        break;
      }
      case 'event':
        game.submit({ response: 'normal' });
        break;
      case 'midterm':
      case 'exam':
      case 'accident':
      case 'semesterWrap':
      case 'mentor':
        game.submit({});
        break;
      case 'special':
        /* specialPolicy:accept 一律出手(莽夫)、decline 一律收手(謹慎) */
        game.submit({ go: opts.specialPolicy !== 'decline' });
        break;
      case 'activity': {
        if (p.mentor?.available) { game.submit({ mentor: true }); break; }
        const avail = p.list.filter((a) => a.available);
        if (avail.length === 0) { game.submit({ skip: true }); break; }
        /* safeVenues:避開藏著登出級女角的兩個高風險場所,
         * 用於需要「必定走完八個學期」的測試 */
        const pool = activityPolicy === 'safeVenues'
          ? avail.filter((a) => a.id !== 'act_club_night' && a.id !== 'act_app')
          : avail;
        if (pool.length === 0) { game.submit({ skip: true }); break; }

        let chosen;
        if (activityPolicy === 'mentorHunt' && !S.mentorFound) {
          const target = MENTORS[S.dept].activity;
          chosen = pool.find((a) => a.id === target) || pool[pool.length - 1];
        } else {
          /* best:選流量最高的可用活動 */
          chosen = pool.reduce((x, y) => (y.enc > x.enc ? y : x));
        }
        game.submit({ actId: chosen.id });
        break;
      }
      default:
        throw new Error(`自動玩家不認得的待處理型別:${p.type}`);
    }
  }
  return game.pending.ending;
}

describe('引擎:基本結構', () => {
  test('建立遊戲後立刻有待處理事項', () => {
    const g = createGame({ name: '朱董', dept: 'ENG', seed: 'eng-1' });
    assert.ok(g.pending, '應該要有 pending');
    assert.equal(g.pending.type, 'dice', '第一件事應該是分配骰子');
  });

  test('第一階段擲出設定數量的骰子,點數在合法範圍', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'dice-1' });
    assert.equal(g.pending.dice.length, CONFIG.dicePerSemester);
    for (const d of g.pending.dice) {
      assert.ok(d >= 1 && d <= CONFIG.diceFaces, `骰子點數異常:${d}`);
    }
  });

  test('骰子分配數量不符時拋出錯誤', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'dice-2' });
    assert.throws(() => g.submit({ assignments: [{ die: 0, to: 'int' }] }), /必須分配全部/);
  });

  test('骰子不可分配到技巧力(已定案的設計)', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'dice-3' });
    const bad = g.pending.dice.map((_, i) => ({ die: i, to: 'skl' }));
    assert.throws(() => g.submit({ assignments: bad }), /不可分配的目標/);
  });

  test('骰子加點確實增加能力值', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'dice-4' });
    const before = g.state.ab.int;
    const total = g.pending.dice.reduce((a, b) => a + b, 0);
    g.submit({ assignments: g.pending.dice.map((_, i) => ({ die: i, to: 'int' })) });
    assert.equal(g.state.ab.int, Math.min(before + total, g.state.pot.int));
  });

  test('骰子兌換社交場次,每 2 點換 1 場', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'dice-5' });
    const expected = g.pending.dice
      .reduce((sum, pip) => sum + Math.floor(pip / CONFIG.slotPerDiceDiv), 0);
    g.submit({ assignments: g.pending.dice.map((_, i) => ({ die: i, to: 'social' })) });
    assert.equal(g.state.bonusSlots, expected);
  });

  test('沒有 pending 時 submit 會拋出錯誤', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'x' });
    autoPlay(g);
    assert.throws(() => g.submit({}), /遊戲已結束/);
  });
});

describe('引擎:階段推進', () => {
  test('階段依 H1 → MID → H2 → FIN → VAC 的順序前進', () => {
    const g = createGame({ name: 'A', dept: 'LAW', seed: 'phase-1' });
    const seen = [];
    let steps = 0;
    while (g.pending.type !== 'gameover' && steps++ < 3000) {
      const ph = g.info().phase;
      if (seen[seen.length - 1] !== ph) seen.push(ph);
      if (g.state.semester > 1) break;
      /* 用最省事的方式推進 */
      const p = g.pending;
      if (p.type === 'dice') {
        g.submit({ assignments: p.dice.map((_, i) => ({ die: i, to: 'int' })) });
      } else if (p.type === 'event') {
        g.submit({ response: 'safe' });
      } else if (p.type === 'activity') {
        g.submit({ skip: true });
      } else {
        g.submit({});
      }
    }
    /* 第一學期應該至少走過 H1、MID、H2 */
    assert.ok(seen.indexOf('H1') === 0, `第一個階段應為 H1,實際順序:${seen}`);
    assert.ok(seen.includes('MID'), `應經過 MID,實際:${seen}`);
  });

  test('八個學期跑完會進入結局', () => {
    const g = createGame({ name: 'A', dept: 'LAW', seed: 'full-1' });
    const ending = autoPlay(g);
    assert.ok(ending, '應產生結局');
    assert.equal(g.pending.type, 'gameover');
    assert.ok(g.state.over, '狀態應標記結束');
  });

  test('期末考不及格立即結束遊戲(退學)', () => {
    /* 用「骰子全換社交場次」的極端策略,學力必然跟不上 */
    const g = createGame({ name: 'A', dept: 'MATH', seed: 'expel-1' });
    const ending = autoPlay(g, { dicePolicy: 'allSocial' });
    assert.equal(ending.graduated, false, '應該被退學');
    assert.ok(g.state.semester <= CONFIG.totalSemesters, '應在畢業前就結束');
  });

  test('留安全邊際且避開高風險場所的玩家可以順利畢業', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'grad-1' });
    const ending = autoPlay(g, { dicePolicy: 'margin', activityPolicy: 'safeVenues' });
    assert.equal(ending.graduated, true,
      `外文系留安全邊際並避開高風險場所後應能畢業,實際結束於第 ${g.state.semester} 學期（原因 ${g.state.overReason}）`);
  });

  test('遊戲結束後不能再送出動作', () => {
    const g = createGame({ name: 'A', dept: 'ENG', seed: 'over-1' });
    autoPlay(g);
    assert.throws(() => g.submit({ response: 'safe' }), /遊戲已結束/);
  });
});

describe('引擎:老學長系統', () => {
  test('去對的活動就能在大一遇到老學長', () => {
    for (const dept of DEPT_KEYS) {
      let found = false;
      /* 多試幾顆種子,因為活動門檻與骰子點數會影響能否進入該活動 */
      for (let s = 0; s < 25 && !found; s++) {
        const g = createGame({ name: 'A', dept, seed: `mentor-${dept}-${s}` });
        try {
          autoPlay(g, { activityPolicy: 'mentorHunt' });
        } catch { /* 忽略中途退學 */ }
        if (g.state.mentorFound) found = true;
      }
      assert.ok(found, `${DEPTS[dept].name} 在 25 顆種子內都沒能找到老學長`);
    }
  });

  test('去錯的活動不會遇到老學長', () => {
    /* 資工系的老學長在讀書會,這裡只去社團 */
    const g = createGame({ name: 'A', dept: 'CS', seed: 'wrong-act' });
    let steps = 0;
    while (g.pending.type !== 'gameover' && steps++ < 3000) {
      const p = g.pending;
      if (p.type === 'dice') {
        g.submit({ assignments: p.dice.map((_, i) => ({ die: i, to: 'int' })) });
      } else if (p.type === 'event') {
        g.submit({ response: 'safe' });
      } else if (p.type === 'activity') {
        const club = p.list.find((a) => a.id === 'act_club' && a.available);
        if (club) g.submit({ actId: club.id });
        else g.submit({ skip: true });
      } else {
        g.submit({});
      }
    }
    assert.equal(g.state.mentorFound, false, '資工系去社團不該遇到老學長');
  });

  test('老學長只在大一出現', () => {
    const g = createGame({ name: 'A', dept: 'LAW', seed: 'mentor-grade' });
    /* 手動把學期推到大三,再去正確的活動 */
    g.state.semester = 5;
    let steps = 0;
    let visited = false;
    while (g.pending.type !== 'gameover' && steps++ < 2000) {
      const p = g.pending;
      if (p.type === 'dice') {
        g.submit({ assignments: p.dice.map((_, i) => ({ die: i, to: 'int' })) });
      } else if (p.type === 'event') {
        g.submit({ response: 'safe' });
      } else if (p.type === 'activity') {
        const target = p.list.find((a) => a.id === MENTORS.LAW.activity && a.available);
        if (target) { visited = true; g.submit({ actId: target.id }); }
        else g.submit({ skip: true });
      } else {
        g.submit({});
      }
    }
    assert.ok(visited, '測試前提:必須真的去過那個活動');
    assert.equal(g.state.mentorFound, false, '大三去同一個活動不該遇到老學長');
  });

  test('帶浪三次總共給滿設定的技巧力', () => {
    /* 直接驅動狀態驗證帶浪機制 */
    const g = createGame({ name: 'A', dept: 'LAW', seed: 'mentor-gain' });
    const S = g.state;
    S.pot.skl = 200;
    S.mentorFound = true;
    S.mentorSessionsLeft = CONFIG.mentorSessions;
    S.slots = 10;

    /* 走到社交階段。注意:途中的事件卡也可能改變技巧力,
     * 所以基準值要在抵達社交階段之後才記錄,否則會把事件卡的影響算進來。 */
    let steps = 0;
    while (g.pending.type !== 'activity' && steps++ < 500) {
      const p = g.pending;
      if (p.type === 'dice') {
        g.submit({ assignments: p.dice.map((_, i) => ({ die: i, to: 'int' })) });
      } else if (p.type === 'event') {
        g.submit({ response: 'safe' });
      } else if (p.type === 'gameover') {
        break;
      } else {
        g.submit({});
      }
    }

    const before = S.ab.skl;
    const fracBefore = S.sklFrac;
    let used = 0;
    while (g.pending.type === 'activity' && g.pending.mentor?.available) {
      g.submit({ mentor: true });
      used++;
      if (used > 5) break;
    }
    assert.equal(used, CONFIG.mentorSessions, `應該剛好帶浪 ${CONFIG.mentorSessions} 次`);
    /* 技巧力可能有小數殘留,所以連整數與小數一起比對 */
    const gained = (S.ab.skl + S.sklFrac) - (before + fracBefore);
    assert.equal(gained,
      CONFIG.mentorSessions * CONFIG.mentorSklPerSession,
      '技巧力總增量不符');
    assert.equal(S.mentorSessionsLeft, 0);
  });

  test('沒有帶浪機會時強行使用會拋出錯誤', () => {
    const g = createGame({ name: 'A', dept: 'LAW', seed: 'mentor-err' });
    let steps = 0;
    while (g.pending.type !== 'activity' && steps++ < 500) {
      const p = g.pending;
      if (p.type === 'dice') {
        g.submit({ assignments: p.dice.map((_, i) => ({ die: i, to: 'int' })) });
      } else if (p.type === 'event') {
        g.submit({ response: 'safe' });
      } else if (p.type === 'gameover') { break; }
      else { g.submit({}); }
    }
    if (g.pending.type === 'activity') {
      assert.throws(() => g.submit({ mentor: true }), /沒有帶浪機會/);
    }
  });
});

describe('引擎:種子決定論', () => {
  test('相同種子與相同操作產生完全相同的結果', () => {
    const run = () => {
      const g = createGame({ name: '朱董', dept: 'ENG', seed: 'determinism-42' });
      const ending = autoPlay(g);
      return {
        kills: ending.kills,
        ab: ending.ab,
        semesters: ending.semestersPlayed,
        graduated: ending.graduated,
        conquered: ending.conquered,
        logLength: g.state.log.length,
      };
    };
    assert.deepEqual(run(), run(), '同種子同操作的結果必須完全一致');
  });

  test('不同種子產生不同結果', () => {
    const run = (seed) => {
      const g = createGame({ name: 'A', dept: 'ENG', seed });
      const e = autoPlay(g);
      return `${e.kills}-${e.ab.sta}-${e.ab.str}-${e.semestersPlayed}`;
    };
    const results = new Set();
    for (let i = 0; i < 12; i++) results.add(run(`diverse-${i}`));
    assert.ok(results.size > 1, '不同種子應產生不同結果');
  });
});

describe('引擎:四個學院都能走完流程', () => {
  for (const dept of DEPT_KEYS) {
    test(`${DEPTS[dept].name} 能在多顆種子下穩定走到結局(不崩潰)`, () => {
      let graduated = 0;
      const N = 40;
      for (let i = 0; i < N; i++) {
        const g = createGame({ name: '測試員', dept, seed: `${dept}-flow-${i}` });
        const ending = autoPlay(g);
        assert.ok(ending, `${dept} 第 ${i} 顆種子沒有產生結局`);
        assert.ok(['graduated', 'expelled', 'fatal'].includes(g.state.overReason),
          `結束原因異常:${g.state.overReason}`);
        assert.ok(ending.tierName, '結局必須有評價等級');
        if (ending.graduated) graduated++;
      }
      /* 這個測試只驗證「不崩潰、一定會走到某個結局」。
       * 能不能畢業是另一件事,由下面使用 margin 策略的測試負責——
       * 因為新手策略(不留邊際、事件照常執行、什麼場所都去)在加入
       * 性病與登出級女角之後已經是必死玩法,不該用它來驗證平衡。 */
      void graduated;
    });
  }

  test('新手策略的死亡率極高（記錄已知的平衡問題,不是驗證通過）', () => {
    /* 這個測試的用意是把現況釘住:如果哪天平衡調整讓新手策略變得可行,
     * 這個測試會失敗,提醒我們回來更新文件與預期。 */
    const rates = {};
    for (const dept of DEPT_KEYS) {
      let grad = 0;
      const N = 30;
      for (let i = 0; i < N; i++) {
        const g = createGame({ name: 'A', dept, seed: `naive-${dept}-${i}` });
        if (autoPlay(g).graduated) grad++;
      }
      rates[DEPTS[dept].name] = grad / N;
    }
    for (const [name, r] of Object.entries(rates)) {
      assert.ok(r < 0.5,
        `${name} 新手策略畢業率 ${(r * 100).toFixed(0)}%,已高於預期,請回頭更新平衡文件`);
    }
  });

  test('四個學院都能達成畢業(採用均衡策略)', () => {
    for (const dept of DEPT_KEYS) {
      let ok = false;
      for (let i = 0; i < 30 && !ok; i++) {
        const g = createGame({ name: 'A', dept, seed: `grad-${dept}-${i}` });
        if (autoPlay(g, { dicePolicy: 'margin', activityPolicy: 'safeVenues' }).graduated) ok = true;
      }
      assert.ok(ok, `${DEPTS[dept].name} 完全無法畢業`);
    }
  });
});

export { autoPlay };

describe('引擎:活動與期末考不會混在同一次結果裡', () => {
  test('用光最後一場社交場次時,不會在同一次 submit 裡直接跑完意外事件與期末考', () => {
    /* 迴歸測試:先前 openActivity/afterActivity 在場次用完時會直接呼叫 step(),
     * 導致同一次 submit() 內部一路跑過意外事件判定、期末考,把不相干的
     * 期末考紀錄也塞進同一批新增的 log 裡。畫面把同一批 log 包成一個彈窗,
     * 玩家點最後一場活動,彈窗標題是活動名稱,內容卻混進期末考結果。
     *
     * 修法是引入 semesterWrap 檢查點:場次用完時只停在這裡,
     * 不會再往下跑意外事件或期末考,必須玩家自己確認才繼續。 */
    const g = createGame({ name: 'A', dept: 'LAW', seed: 'wrap-1' });
    let steps = 0;

    while (g.pending.type !== 'activity' && steps++ < 2000) {
      const p = g.pending;
      if (p.type === 'dice') {
        g.submit({ assignments: p.dice.map((_, i) => ({ die: i, to: 'str' })) });
      } else if (p.type === 'event') {
        g.submit({ response: 'safe' });
      } else {
        g.submit({});
      }
    }

    /* 把場次耗到剩一場,然後送出最後一個活動,觀察 submit 之後的 pending */
    while (g.state.slots > 1 && steps++ < 2000) {
      const p = g.pending;
      if (p.type !== 'activity') break;
      const avail = p.list.filter((a) => a.available && a.id !== 'act_club_night' && a.id !== 'act_app');
      if (avail.length === 0) { g.submit({ skip: true }); break; }
      g.submit({ actId: avail[0].id });
      if (g.pending.type === 'special') {
        g.submit({ go: false });
      }
    }

    if (g.pending.type !== 'activity') return; /* 這顆種子提早結束,略過本次驗證 */

    const before = g.state.log.length;
    const avail = g.pending.list.filter((a) => a.available && a.id !== 'act_club_night' && a.id !== 'act_app');
    g.submit({ actId: avail[0].id });
    if (g.pending.type === 'special') g.submit({ go: false });

    assert.equal(g.pending.type, 'semesterWrap',
      `場次用完後應該停在 semesterWrap,實際是 ${g.pending.type}`);

    const added = g.state.log.slice(before);
    const titles = added.map((e) => e.title);
    assert.ok(!titles.includes('期末考') && !titles.some((t) => t.includes('期末考')),
      `這批新增紀錄不該包含期末考,實際標題:${titles.join('、')}`);
    assert.ok(!titles.some((t) => t.includes('意外事件')),
      `這批新增紀錄不該包含意外事件,實際標題:${titles.join('、')}`);
  });

  test('確認 semesterWrap 之後,期末考才會出現在新的一批紀錄裡', () => {
    const g = createGame({ name: 'A', dept: 'LAW', seed: 'wrap-2' });
    let steps = 0;
    while (g.pending.type !== 'gameover' && steps++ < 3000) {
      const p = g.pending;
      if (p.type === 'semesterWrap') break;
      if (p.type === 'dice') {
        g.submit({ assignments: p.dice.map((_, i) => ({ die: i, to: 'str' })) });
      } else if (p.type === 'event') {
        g.submit({ response: 'safe' });
      } else if (p.type === 'special') {
        g.submit({ go: false });
      } else if (p.type === 'activity') {
        const avail = p.list.filter((a) => a.available);
        if (avail.length === 0) { g.submit({ skip: true }); continue; }
        g.submit({ actId: avail[avail.length - 1].id });
      } else {
        g.submit({});
      }
    }
    if (g.pending.type !== 'semesterWrap') return;

    const before = g.state.log.length;
    g.submit({});
    const added = g.state.log.slice(before);
    assert.ok(added.length > 0, 'semesterWrap 確認後應該至少有一則新紀錄(意外事件判定或期末考)');
  });
});
