import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { newState, addAb, addSkl, ovr } from '../src/core/state.js';
import { runExam, midtermWarning } from '../src/core/exam.js';
import { conquestRate, attemptConquest } from '../src/core/conquest.js';
import { baseSlots, totalSlots, listActivities, runActivity } from '../src/core/activity.js';
import { scaleAbility, resolveCard, cardEligible, drawCard, applyEffects } from '../src/core/eventcard.js';
import { accidentChance, endOfSemesterDecay } from '../src/core/risk.js';
import { tierOf, makeEnding } from '../src/core/ending.js';
import { CONFIG } from '../src/data/config.js';
import { DEPTS, DEPT_KEYS } from '../src/data/depts.js';
import { EVENTS } from '../src/data/events.js';

function mk(dept = 'ENG', seed = 'test-seed') {
  const rng = createRng(seed);
  return { S: newState({ name: '測試員', dept, rng }), rng };
}

describe('遊戲狀態建立', () => {
  test('技巧力起始一律為 1,不受隨機浮動影響', () => {
    for (const k of DEPT_KEYS) {
      for (let i = 0; i < 30; i++) {
        const { S } = mk(k, `seed-${k}-${i}`);
        assert.equal(S.ab.skl, 1, `${DEPTS[k].name} 第 ${i} 次生成的技巧力不是 1`);
      }
    }
  });

  test('起始能力落在基準值加減浮動的範圍內', () => {
    for (const k of DEPT_KEYS) {
      for (let i = 0; i < 30; i++) {
        const { S } = mk(k, `jit-${k}-${i}`);
        for (const ab of ['sta', 'int', 'str']) {
          const base = DEPTS[k].start[ab];
          const j = CONFIG.startJitter;
          assert.ok(S.ab[ab] >= base - j && S.ab[ab] <= base + j,
            `${DEPTS[k].name} 的 ${ab} = ${S.ab[ab]},超出 ${base}±${j}`);
        }
      }
    }
  });

  test('潛力上限不低於起始能力', () => {
    for (const k of DEPT_KEYS) {
      for (let i = 0; i < 30; i++) {
        const { S } = mk(k, `pot-${k}-${i}`);
        for (const ab of ['sta', 'int', 'str', 'skl']) {
          assert.ok(S.pot[ab] >= S.ab[ab],
            `${DEPTS[k].name} 的 ${ab} 上限 ${S.pot[ab]} 低於起始 ${S.ab[ab]}`);
        }
      }
    }
  });

  test('初始狀態的計數器都是零', () => {
    const { S } = mk();
    assert.equal(S.kills, 0);
    assert.equal(S.rep, 0);
    assert.equal(S.risk, 0);
    assert.equal(S.semester, 1);
    assert.equal(S.mentorFound, false);
    assert.equal(S.over, false);
  });

  test('未知科系拋出錯誤', () => {
    const rng = createRng('x');
    assert.throws(() => newState({ name: 'a', dept: 'NOPE', rng }), /未知科系/);
  });
});

describe('能力值成長', () => {
  test('addAb 不會超過潛力上限', () => {
    const { S } = mk();
    S.pot.int = 40;
    S.ab.int = 38;
    const actual = addAb(S, 'int', 10);
    assert.equal(S.ab.int, 40, '應被上限擋住');
    assert.equal(actual, 2, '回傳的實際變動量應為 2');
  });

  test('addAb 扣減不會低於 1', () => {
    const { S } = mk();
    S.ab.sta = 3;
    addAb(S, 'sta', -10);
    assert.equal(S.ab.sta, 1);
  });

  test('addSkl 支援小數累積,滿 1 才進位', () => {
    const { S } = mk();
    S.pot.skl = 90;
    const start = S.ab.skl;
    addSkl(S, 0.5);
    assert.equal(S.ab.skl, start, '0.5 還不該進位');
    addSkl(S, 0.5);
    assert.equal(S.ab.skl, start + 1, '累積到 1 應該進位');
  });

  test('ovr 為四項能力的平均', () => {
    const { S } = mk();
    S.ab = { sta: 20, int: 30, str: 40, skl: 10 };
    assert.equal(ovr(S), 25);
  });
});

describe('期末考判定', () => {
  test('兩項都達標則通過', () => {
    const { S } = mk('ENG');
    S.ab.int = 24; S.ab.str = 17;   /* 外文系第一學期門檻 */
    const r = runExam(S);
    assert.equal(r.passed, true);
    assert.equal(r.failed.length, 0);
  });

  test('學力差一點就不及格', () => {
    const { S } = mk('ENG');
    S.ab.int = 23; S.ab.str = 30;
    const r = runExam(S);
    assert.equal(r.passed, false);
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].key, 'int');
  });

  test('肌力差一點就不及格', () => {
    const { S } = mk('ENG');
    S.ab.int = 50; S.ab.str = 16;
    const r = runExam(S);
    assert.equal(r.passed, false);
    assert.equal(r.failed[0].key, 'str');
  });

  test('兩項都不及格則兩項都被列出', () => {
    const { S } = mk('ENG');
    S.ab.int = 1; S.ab.str = 1;
    const r = runExam(S);
    assert.equal(r.failed.length, 2);
  });

  test('四個科系八個學期的門檻都能正確取得', () => {
    for (const k of DEPT_KEYS) {
      for (let sem = 1; sem <= 8; sem++) {
        const { S } = mk(k);
        S.semester = sem;
        const r = runExam(S);
        assert.equal(r.threshold.int, DEPTS[k].examInt[sem - 1]);
        assert.equal(r.threshold.str, DEPTS[k].examStr[sem - 1]);
      }
    }
  });

  test('期中預警正確算出差距', () => {
    const { S } = mk('MATH');   /* 第一學期學力門檻 32、肌力 15 */
    S.ab.int = 30; S.ab.str = 15;
    const w = midtermWarning(S);
    assert.equal(w.safe, false);
    assert.equal(w.warnings.length, 1);
    assert.equal(w.warnings[0].key, 'int');
    assert.equal(w.warnings[0].gap, 2);
  });

  test('期中預警在都達標時回報安全', () => {
    const { S } = mk('MATH');
    S.ab.int = 40; S.ab.str = 20;
    assert.equal(midtermWarning(S).safe, true);
  });
});

describe('攻略判定', () => {
  test('成功率公式計算正確', () => {
    const { S } = mk();
    S.ab = { sta: 30, int: 50, str: 30, skl: 40 };
    S.rep = 0;
    /* 40*0.6 + 30*0.3 + 30*0.1 = 24 + 9 + 3 = 36;中難度 -15 → 21 */
    assert.equal(conquestRate(S, 'mid'), 21);
    /* 低難度 -5 → 31 */
    assert.equal(conquestRate(S, 'low'), 31);
    /* 高難度 -25 → 11 */
    assert.equal(conquestRate(S, 'high'), 11);
  });

  test('學力不影響攻略成功率(權重為 0)', () => {
    const { S } = mk();
    S.ab = { sta: 30, int: 10, str: 30, skl: 40 };
    const a = conquestRate(S, 'mid');
    S.ab.int = 99;
    assert.equal(conquestRate(S, 'mid'), a, '學力不該影響攻略');
  });

  test('風評每 8 點降低 1% 成功率', () => {
    const { S } = mk();
    S.ab = { sta: 30, int: 0, str: 30, skl: 40 };
    const base = conquestRate(S, 'mid');
    S.rep = 8;
    assert.equal(conquestRate(S, 'mid'), base - 1);
    S.rep = 16;
    assert.equal(conquestRate(S, 'mid'), base - 2);
    S.rep = 7;
    assert.equal(conquestRate(S, 'mid'), base, '未滿 8 點不應影響');
  });

  test('成功率有上下限保護', () => {
    const { S } = mk();
    S.ab = { sta: 1, int: 1, str: 1, skl: 1 };
    assert.ok(conquestRate(S, 'high') >= CONFIG.conquestRateMin);
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    assert.ok(conquestRate(S, 'low') <= CONFIG.conquestRateMax);
  });

  test('開局技巧力 1 的成功率極低(設計意圖:必須找到老學長)', () => {
    const { S } = mk('ENG');
    const rate = conquestRate(S, 'low');
    assert.ok(rate < 12, `開局成功率 ${rate}% 過高,失去老學長系統的意義`);
  });

  test('成功時人斬數與技巧力都增加', () => {
    const { S, rng } = mk();
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };   /* 確保成功 */
    S.pot.skl = 120;
    const before = S.ab.skl;
    const r = attemptConquest(S, { name: '甲', difficulty: 'low' }, rng);
    assert.equal(r.success, true);
    assert.equal(S.kills, 1);
    assert.ok(S.ab.skl > before, '技巧力應增加');
    assert.equal(S.rep, CONFIG.repPerConquest, '風評應累積');
  });

  test('同一位對象重複攻略不重複計數', () => {
    const { S, rng } = mk();
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    S.pot.skl = 200;
    attemptConquest(S, { name: '同一人', difficulty: 'low' }, rng);
    assert.equal(S.kills, 1);
    const r2 = attemptConquest(S, { name: '同一人', difficulty: 'low' }, rng);
    assert.equal(r2.counted, false);
    assert.equal(S.kills, 1, '人斬數不該重複增加');
  });

  test('失敗也給少量技巧力經驗(避免開局死鎖)', () => {
    const { S, rng } = mk();
    S.ab = { sta: 1, int: 1, str: 1, skl: 1 };   /* 成功率極低 */
    S.pot.skl = 90;
    let fails = 0;
    for (let i = 0; i < 20; i++) {
      const r = attemptConquest(S, { name: `對象${i}`, difficulty: 'high' }, rng);
      if (!r.success) fails++;
    }
    assert.ok(fails > 0, '應該有失敗案例');
    assert.ok(S.ab.skl > 1, `失敗累積後技巧力應成長,實際為 ${S.ab.skl}`);
  });

  test('攻略統計正確累加', () => {
    const { S, rng } = mk();
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    S.pot.skl = 200;
    for (let i = 0; i < 5; i++) {
      attemptConquest(S, { name: `人${i}`, difficulty: 'low' }, rng);
    }
    assert.equal(S.stats.attempts, 5, '嘗試次數應等於呼叫次數');
    /* 成功率有 90% 上限,所以即使能力滿點也不保證每次都成功 */
    assert.ok(S.stats.successes <= S.stats.attempts, '成功數不可超過嘗試數');
    assert.ok(S.stats.successes >= 3, `成功率上限 90% 下五次應至少成功三次,實際 ${S.stats.successes}`);
    assert.equal(S.kills, S.stats.successes, '人斬數應等於成功數(對象皆不重複)');
  });
});

describe('社交活動', () => {
  test('基礎場次依體力計算', () => {
    const { S } = mk();
    S.ab.sta = 24;
    assert.equal(baseSlots(S), CONFIG.baseSlotConst + 2);
    S.ab.sta = 60;
    assert.equal(baseSlots(S), CONFIG.baseSlotConst + 5);
  });

  test('總場次含骰子與事件卡的加成', () => {
    const { S } = mk();
    S.ab.sta = 24;
    S.bonusSlots = 3;
    assert.equal(totalSlots(S), baseSlots(S) + 3);
  });

  test('總場次不會是負數', () => {
    const { S } = mk();
    S.bonusSlots = -999;
    assert.equal(totalSlots(S), 0);
  });

  test('活動門檻正確過濾', () => {
    const { S } = mk('ENG');
    S.ab = { sta: 20, int: 20, str: 20, skl: 1 };
    const list = listActivities(S);
    const night = list.find((a) => a.id === 'act_club_night');
    assert.equal(night.available, false, '肌力不足應鎖住夜店');
    assert.ok(night.lockReason.includes('肌力'), '應說明鎖住原因');
    const club = list.find((a) => a.id === 'act_club');
    assert.equal(club.available, true, '無門檻活動應可參加');
  });

  test('肌力足夠時夜店解鎖', () => {
    const { S } = mk('ENG');
    S.ab = { sta: 40, int: 40, str: 40, skl: 1 };
    const list = listActivities(S);
    assert.equal(list.find((a) => a.id === 'act_club_night').available, true);
  });

  test('執行活動會生成對象並累積風險', () => {
    const { S, rng } = mk('ENG');
    S.ab = { sta: 40, int: 40, str: 40, skl: 30 };
    const r = runActivity(S, 'act_mixer', rng);   /* 聯誼 enc:3 risk:mid */
    /* 特殊角色不立即結算,會被分流到 specials 交給玩家決定,
     * 所以總接觸人數要把兩邊加起來 */
    assert.equal(r.results.length + r.specials.length, 3);
    assert.equal(S.risk, CONFIG.activityRiskValue.mid);
    assert.equal(S.stats.activitiesDone, 1);
  });

  test('特殊角色會被分流出來,不會在活動中直接結算', () => {
    const { S, rng } = mk('ENG');
    S.ab = { sta: 40, int: 40, str: 40, skl: 30 };
    let sawSpecial = false;
    for (let i = 0; i < 40 && !sawSpecial; i++) {
      const r = runActivity(S, 'act_mixer', rng);
      for (const x of r.results) {
        assert.equal(x.target.tier, 'normal', '立即結算的對象只能是一般角色');
      }
      for (const sp of r.specials) {
        assert.notEqual(sp.tier, 'normal', 'specials 裡只能是特殊角色');
        sawSpecial = true;
      }
    }
    assert.ok(sawSpecial, '40 場活動都沒遇到特殊角色,抽取權重可能有問題');
  });

  test('門檻不足時執行活動會拋出錯誤', () => {
    const { S, rng } = mk('ENG');
    S.ab = { sta: 20, int: 20, str: 20, skl: 1 };
    assert.throws(() => runActivity(S, 'act_club_night', rng), /門檻不足/);
  });

  test('邂逅加成會加到對象數上,且只生效一次', () => {
    const { S, rng } = mk('ENG');
    S.ab = { sta: 40, int: 40, str: 40, skl: 30 };
    S.encBonus = 2;
    const r1 = runActivity(S, 'act_club', rng);      /* enc:2 + 2 = 4 */
    assert.equal(r1.results.length + r1.specials.length, 4);
    const r2 = runActivity(S, 'act_club', rng);      /* 加成已用完 = 2 */
    assert.equal(r2.results.length + r2.specials.length, 2);
  });
});

describe('事件卡結算', () => {
  test('效果縮放:權重 2 等於 mag、權重 1 等於 mag 的一半向上取整', () => {
    assert.equal(scaleAbility(2, 3), 3);
    assert.equal(scaleAbility(2, 2), 2);
    assert.equal(scaleAbility(2, 1), 1);
    assert.equal(scaleAbility(1, 3), 2);
    assert.equal(scaleAbility(1, 2), 1);
    assert.equal(scaleAbility(1, 1), 1);
  });

  test('好結果套用正值、壞結果套用負值', () => {
    const { S, rng } = mk();
    S.pot.int = 99;
    const before = S.ab.int;
    applyEffects(S, { int: 2 }, 2, 1, rng);
    assert.equal(S.ab.int, before + 2, '好結果應加值');
    applyEffects(S, { int: 2 }, 2, -1, rng);
    assert.equal(S.ab.int, before, '壞結果應扣值');
  });

  test('感情線鍵值不隨好壞結果翻轉正負號', () => {
    const { S, rng } = mk();
    S.rep = 10;
    applyEffects(S, { rep: 2 }, 2, -1, rng);   /* 壞結果的 rep:2 = 風評惡化 */
    assert.equal(S.rep, 12);
    applyEffects(S, { rep: -3 }, 2, 1, rng);   /* 好結果的 rep:-3 = 風評改善 */
    assert.equal(S.rep, 9);
  });

  test('風評不會low於零', () => {
    const { S, rng } = mk();
    S.rep = 1;
    applyEffects(S, { rep: -10 }, 2, 1, rng);
    assert.equal(S.rep, 0);
  });

  test('感情線鍵值不受 mag 縮放', () => {
    const { S, rng } = mk();
    applyEffects(S, { enc: 3 }, 1, 1, rng);
    assert.equal(S.encBonus, 3, 'mag 為 1 時 enc 仍應是 3');
  });

  test('kill 效果直接增加人斬數', () => {
    const { S, rng } = mk();
    applyEffects(S, { kill: 1 }, 2, 1, rng);
    assert.equal(S.kills, 1);
  });

  test('rand 效果只會落在體力/學力/肌力,不會給技巧力', () => {
    const { S, rng } = mk();
    S.pot = { sta: 99, int: 99, str: 99, skl: 99 };
    for (let i = 0; i < 50; i++) {
      const applied = applyEffects(S, { rand: 2 }, 2, 1, rng);
      assert.ok(['sta', 'int', 'str'].includes(applied[0].key),
        `rand 落到了 ${applied[0].key}`);
    }
  });

  test('resolveCard 回傳成功與失敗的對應文案', () => {
    const { S, rng } = mk();
    const card = EVENTS.find((c) => c.id === 'so01');
    const r = resolveCard(S, card, 'safe', rng);
    assert.ok(r.text === card.gt || r.text === card.bt);
    assert.equal(r.responseLabel, CONFIG.responses.safe.label);
  });

  test('未知應對方式拋出錯誤', () => {
    const { S, rng } = mk();
    const card = EVENTS[0];
    assert.throws(() => resolveCard(S, card, 'nope', rng), /未知應對方式/);
  });

  test('保守應對的長期成功率高於全力一搏', () => {
    const card = EVENTS.find((c) => c.id === 'so01');
    let safeWin = 0, boldWin = 0;
    for (let i = 0; i < 400; i++) {
      const a = mk('ENG', `sw-${i}`);
      if (resolveCard(a.S, card, 'safe', a.rng).success) safeWin++;
      const b = mk('ENG', `bw-${i}`);
      if (resolveCard(b.S, card, 'bold', b.rng).success) boldWin++;
    }
    assert.ok(safeWin > boldWin,
      `保守 ${safeWin} 應多於豪賭 ${boldWin}`);
  });

  test('卡片資格判定:階段不符則不可抽', () => {
    const { S } = mk();
    const card = EVENTS.find((c) => c.id === 'st03');   /* 只在 MID */
    assert.equal(cardEligible(card, S, 'MID'), true);
    assert.equal(cardEligible(card, S, 'H1'), false);
  });

  test('風險卡在風評不足時不進卡池', () => {
    const { S } = mk();
    S.rep = 0;
    const risky = EVENTS.find((c) => c.cat === 'risk' && c.phase.includes('H2'));
    assert.equal(cardEligible(risky, S, 'H2'), false, '風評不足不該出現');
    S.rep = 99;
    assert.equal(cardEligible(risky, S, 'H2'), true, '風評夠高應該出現');
  });

  test('同一學期不會重複抽到同一張卡', () => {
    const { S, rng } = mk();
    const drawn = new Set();
    for (let i = 0; i < 6; i++) {
      const c = drawCard(S, 'H1', rng);
      if (!c) break;
      assert.ok(!drawn.has(c.id), `重複抽到 ${c.id}`);
      drawn.add(c.id);
    }
  });
});

describe('風險與意外事件', () => {
  test('意外機率等於風險累積值,但有上限', () => {
    const { S } = mk();
    S.risk = 20;
    assert.equal(accidentChance(S), 20);
    S.risk = 999;
    assert.equal(accidentChance(S), CONFIG.riskCapPercent);
  });

  test('學期結算時風評消退、風險歸零', () => {
    const { S } = mk();
    S.rep = 10; S.risk = 30;
    endOfSemesterDecay(S);
    assert.equal(S.rep, 10 - CONFIG.repDecayPerSemester);
    assert.equal(S.risk, 0);
  });

  test('風評消退不會變成負數', () => {
    const { S } = mk();
    S.rep = 0;
    endOfSemesterDecay(S);
    assert.equal(S.rep, 0);
  });
});

describe('結局判定', () => {
  test('六個等級的邊界值都正確', () => {
    assert.equal(tierOf(0).key, 'pure');
    assert.equal(tierOf(1).key, 'normal');
    assert.equal(tierOf(3).key, 'normal');
    assert.equal(tierOf(4).key, 'rotate');
    assert.equal(tierOf(15).key, 'rotate');
    assert.equal(tierOf(16).key, 'player');
    assert.equal(tierOf(39).key, 'player');
    assert.equal(tierOf(40).key, 'stud');
    assert.equal(tierOf(79).key, 'stud');
    assert.equal(tierOf(80).key, 'legend');
    assert.equal(tierOf(999).key, 'legend');
  });

  test('使用者定義的三個層級都對應到正確等級', () => {
    /* 普通交往 1-3 位 */
    assert.equal(tierOf(2).name, '普通大學生');
    /* 快速輪換:每學期 1 位 = 8 位 */
    assert.equal(tierOf(8).name, '快速輪換');
    /* 種馬:每學期 10 位 = 80 位 */
    assert.equal(tierOf(80).name, '傳說級種馬');
  });

  test('畢業與退學產生不同的結局標題', () => {
    const { S } = mk();
    S.kills = 20;
    S.overReason = 'graduated';
    const a = makeEnding(S);
    assert.ok(a.headline.includes('順利畢業'));
    assert.equal(a.graduated, true);

    S.overReason = 'expelled';
    const b = makeEnding(S);
    assert.ok(b.headline.includes('中途退學'));
    assert.equal(b.graduated, false);
  });

  test('結局包含攻略成功率統計', () => {
    const { S } = mk();
    S.stats.attempts = 10;
    S.stats.successes = 3;
    S.overReason = 'graduated';
    assert.equal(makeEnding(S).stats.successRate, 30);
  });

  test('畢業時顯示的就讀學期數不會超過總學期數', () => {
    const { S } = mk();
    S.semester = CONFIG.totalSemesters + 1;   /* 引擎推到第 9 學期才判定畢業 */
    S.overReason = 'graduated';
    assert.equal(makeEnding(S).semestersPlayed, CONFIG.totalSemesters,
      '不該出現「9 / 8」這種顯示');
  });

  test('退學時顯示的學期數是實際被退學的那個學期', () => {
    const { S } = mk();
    S.semester = 3;
    S.overReason = 'expelled';
    const e = makeEnding(S);
    assert.equal(e.semestersPlayed, 3);
    assert.ok(e.gradLine.includes('3'), `文案應提到第 3 學期,實際:${e.gradLine}`);
  });

  test('沒有任何嘗試時成功率為零而不是除以零', () => {
    const { S } = mk();
    S.overReason = 'graduated';
    assert.equal(makeEnding(S).stats.successRate, 0);
  });
});
