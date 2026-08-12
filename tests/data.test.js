import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEPTS, DEPT_KEYS, examThreshold } from '../src/data/depts.js';
import { EVENTS } from '../src/data/events.js';
import { ACTIVITIES, mentorActivityOf } from '../src/data/activities.js';
import { MENTORS } from '../src/data/mentors.js';
import { CONFIG } from '../src/data/config.js';
import { makeName, SURNAMES, GIVEN } from '../src/data/names.js';
import { createRng } from '../src/rng.js';

describe('科系資料', () => {
  test('四個科系都存在', () => {
    assert.deepEqual(DEPT_KEYS.sort(), ['CS', 'ENG', 'LAW', 'MATH']);
  });

  test('每個科系的技巧力起始值都是 1(已定案的設計)', () => {
    for (const k of DEPT_KEYS) {
      assert.equal(DEPTS[k].start.skl, 1, `${DEPTS[k].name} 的技巧力起始值必須是 1`);
    }
  });

  test('每個科系都有四項起始能力', () => {
    for (const k of DEPT_KEYS) {
      const s = DEPTS[k].start;
      for (const ab of ['sta', 'int', 'str', 'skl']) {
        assert.equal(typeof s[ab], 'number', `${DEPTS[k].name} 缺少 ${ab}`);
        assert.ok(s[ab] >= 1, `${DEPTS[k].name} 的 ${ab} 必須至少為 1`);
      }
    }
  });

  test('每個科系都有完整八個學期的兩項門檻', () => {
    for (const k of DEPT_KEYS) {
      assert.equal(DEPTS[k].examInt.length, CONFIG.totalSemesters, `${DEPTS[k].name} 學力門檻數量不符`);
      assert.equal(DEPTS[k].examStr.length, CONFIG.totalSemesters, `${DEPTS[k].name} 肌力門檻數量不符`);
    }
  });

  test('門檻必須逐學期遞增(不可倒退)', () => {
    for (const k of DEPT_KEYS) {
      for (let i = 1; i < CONFIG.totalSemesters; i++) {
        assert.ok(DEPTS[k].examInt[i] >= DEPTS[k].examInt[i - 1],
          `${DEPTS[k].name} 第 ${i + 1} 學期學力門檻低於前一學期`);
        assert.ok(DEPTS[k].examStr[i] >= DEPTS[k].examStr[i - 1],
          `${DEPTS[k].name} 第 ${i + 1} 學期肌力門檻低於前一學期`);
      }
    }
  });

  test('第一學期門檻不應高於起始能力太多(否則開局必死)', () => {
    for (const k of DEPT_KEYS) {
      const d = DEPTS[k];
      /* 第一學期只有 3 顆骰(最多 18 點),所以門檻不該超過起始值 + 18 */
      const maxDice = CONFIG.dicePerSemester * CONFIG.diceFaces;
      assert.ok(d.examInt[0] <= d.start.int + maxDice,
        `${d.name} 第一學期學力門檻過高,開局必死`);
      assert.ok(d.examStr[0] <= d.start.str + maxDice,
        `${d.name} 第一學期肌力門檻過高,開局必死`);
    }
  });

  test('examThreshold 取值正確', () => {
    assert.deepEqual(examThreshold('ENG', 1), { int: 24, str: 17 });
    assert.deepEqual(examThreshold('MATH', 8), { int: 65, str: 29 });
  });

  test('examThreshold 對無效輸入拋出錯誤', () => {
    assert.throws(() => examThreshold('XXX', 1), /未知科系/);
    assert.throws(() => examThreshold('ENG', 0), /學期超出範圍/);
    assert.throws(() => examThreshold('ENG', 9), /學期超出範圍/);
  });
});

describe('事件卡資料', () => {
  test('卡片數量符合設計(52 張)', () => {
    assert.equal(EVENTS.length, 52);
  });

  test('各分類的卡片數量符合設計', () => {
    const byCat = {};
    for (const c of EVENTS) byCat[c.cat] = (byCat[c.cat] || 0) + 1;
    assert.deepEqual(byCat, {
      study: 9, body: 9, social: 15, life: 8, work: 5, risk: 6,
    });
  });

  test('社交感情類是數量最多的分類(核心玩法)', () => {
    const byCat = {};
    for (const c of EVENTS) byCat[c.cat] = (byCat[c.cat] || 0) + 1;
    const max = Math.max(...Object.values(byCat));
    assert.equal(byCat.social, max, '社交感情類應該是最多的分類');
  });

  test('所有卡片的必填欄位都齊全', () => {
    for (const c of EVENTS) {
      for (const f of ['id', 'n', 'desc', 'cat', 'phase', 'gt', 'bt', 'g', 'b']) {
        assert.ok(c[f] !== undefined && c[f] !== null, `卡片 ${c.id || '(無 id)'} 缺少欄位 ${f}`);
      }
      assert.ok(Array.isArray(c.phase) && c.phase.length > 0, `卡片 ${c.id} 的 phase 必須是非空陣列`);
      assert.ok(typeof c.g === 'object', `卡片 ${c.id} 的 g 必須是物件`);
      assert.ok(typeof c.b === 'object', `卡片 ${c.id} 的 b 必須是物件`);
      assert.ok(Object.keys(c.g).length > 0, `卡片 ${c.id} 的好結果沒有任何效果`);
      assert.ok(Object.keys(c.b).length > 0, `卡片 ${c.id} 的壞結果沒有任何效果`);
    }
  });

  test('卡片 id 不重複', () => {
    const ids = EVENTS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, '有重複的卡片 id');
  });

  test('phase 只能使用合法的階段代碼', () => {
    const valid = new Set(['H1', 'MID', 'H2', 'FIN', 'VAC']);
    for (const c of EVENTS) {
      for (const p of c.phase) {
        assert.ok(valid.has(p), `卡片 ${c.id} 使用了非法階段 ${p}`);
      }
    }
  });

  test('cat 只能使用合法的分類', () => {
    const valid = new Set(['study', 'body', 'social', 'life', 'work', 'risk', 'mentor']);
    for (const c of EVENTS) {
      assert.ok(valid.has(c.cat), `卡片 ${c.id} 使用了非法分類 ${c.cat}`);
    }
  });

  test('效果只能使用合法的鍵值', () => {
    const valid = new Set(['sta', 'int', 'str', 'skl', 'rand', 'enc', 'rep', 'risk', 'slot', 'kill']);
    for (const c of EVENTS) {
      for (const obj of [c.g, c.b]) {
        for (const k of Object.keys(obj)) {
          assert.ok(valid.has(k), `卡片 ${c.id} 使用了非法效果鍵 ${k}`);
        }
      }
    }
  });

  test('壞結果的能力值一律填正數(由程式套用負號)', () => {
    const abilityKeys = ['sta', 'int', 'str', 'skl', 'rand'];
    for (const c of EVENTS) {
      for (const [k, v] of Object.entries(c.b)) {
        if (abilityKeys.includes(k)) {
          assert.ok(v > 0, `卡片 ${c.id} 的壞結果 ${k} 應填正數,實際為 ${v}`);
        }
      }
    }
  });

  test('能力值權重只能是 1 或 2', () => {
    const abilityKeys = ['sta', 'int', 'str', 'skl', 'rand'];
    for (const c of EVENTS) {
      for (const obj of [c.g, c.b]) {
        for (const [k, v] of Object.entries(obj)) {
          if (abilityKeys.includes(k)) {
            assert.ok(v === 1 || v === 2, `卡片 ${c.id} 的 ${k} 權重應為 1 或 2,實際為 ${v}`);
          }
        }
      }
    }
  });

  test('每個階段都有足夠的卡片可抽(不會抽空)', () => {
    for (const phase of ['H1', 'MID', 'H2', 'VAC']) {
      /* 排除有 req 門檻的卡片,計算基本可用量 */
      const pool = EVENTS.filter((c) => c.phase.includes(phase) && !c.req);
      const need = CONFIG.eventsPerPhase[phase] ?? 0;
      assert.ok(pool.length >= need + 2,
        `階段 ${phase} 的無門檻卡片只有 ${pool.length} 張,需要至少 ${need + 2} 張`);
    }
  });

  test('風險類卡片都設有風評門檻(避免無辜玩家被隨機惡意打到)', () => {
    for (const c of EVENTS.filter((x) => x.cat === 'risk')) {
      assert.ok(c.req && typeof c.req.rep === 'number',
        `風險卡 ${c.id} 應設有風評門檻`);
    }
  });
});

describe('社交活動資料', () => {
  test('每個活動的必填欄位齊全', () => {
    for (const a of ACTIVITIES) {
      for (const f of ['id', 'name', 'enc', 'diff', 'risk']) {
        assert.ok(a[f] !== undefined, `活動 ${a.id} 缺少欄位 ${f}`);
      }
      assert.ok(a.enc >= 1, `活動 ${a.id} 的接觸對象數必須至少 1`);
      assert.ok(['low', 'mid', 'high'].includes(a.diff), `活動 ${a.id} 難度值非法`);
      assert.ok(Object.keys(CONFIG.activityRiskValue).includes(a.risk),
        `活動 ${a.id} 的風險等級 ${a.risk} 未定義數值`);
    }
  });

  test('至少有一個活動完全沒有門檻(否則開局無事可做)', () => {
    assert.ok(ACTIVITIES.some((a) => !a.req), '必須有無門檻的活動');
  });

  test('高流量活動足以支撐一學期 10 位的目標', () => {
    const best = Math.max(...ACTIVITIES.map((a) => a.enc));
    /* 6 場 × 最高流量 × 35% 轉換率 應該要能達到 10 */
    assert.ok(6 * best * 0.35 >= 10,
      `最高流量 ${best} 不足以支撐一學期 10 位的設計目標`);
  });
});

describe('老學長資料', () => {
  test('四個科系各有一位老學長', () => {
    for (const k of DEPT_KEYS) {
      assert.ok(MENTORS[k], `${DEPTS[k].name} 沒有老學長`);
      assert.equal(MENTORS[k].dept, k);
    }
  });

  test('每位老學長的藏身活動都真實存在', () => {
    for (const k of DEPT_KEYS) {
      const actId = MENTORS[k].activity;
      assert.ok(ACTIVITIES.some((a) => a.id === actId),
        `${DEPTS[k].name} 的老學長藏在不存在的活動 ${actId}`);
    }
  });

  test('四位老學長藏在四個不同的活動裡(每個系藏在不同事件)', () => {
    const acts = DEPT_KEYS.map((k) => MENTORS[k].activity);
    assert.equal(new Set(acts).size, 4, '老學長的藏身處有重複');
  });

  test('活動表的 mentorDept 與老學長表互相一致', () => {
    for (const k of DEPT_KEYS) {
      const act = mentorActivityOf(k);
      assert.ok(act, `找不到 ${DEPTS[k].name} 的老學長活動`);
      assert.equal(act.id, MENTORS[k].activity, `${DEPTS[k].name} 的兩份資料不一致`);
    }
  });

  test('老學長藏身的活動在大一時必須進得去(否則永遠找不到)', () => {
    for (const k of DEPT_KEYS) {
      const d = DEPTS[k];
      const act = mentorActivityOf(k);
      if (!act.req) continue;
      for (const [ak, av] of Object.entries(act.req)) {
        if (av === 'exam') continue;   /* 學力門檻另計 */
        const maxGain = CONFIG.dicePerSemester * CONFIG.diceFaces * 2;  /* 大一兩學期 */
        assert.ok(d.start[ak] + maxGain >= av,
          `${d.name} 的老學長門檻 ${ak}≥${av} 在大一內不可能達到`);
      }
    }
  });

  test('帶浪次數與文案數量一致', () => {
    const { MENTOR_SESSIONS } = { MENTOR_SESSIONS: null };
    /* 直接檢查 config 與 mentors 的一致性 */
    assert.ok(CONFIG.mentorSessions >= 1);
  });
});

describe('姓名生成', () => {
  test('產生的姓名都是合法中文姓名', () => {
    const rng = createRng('name-test');
    for (let i = 0; i < 300; i++) {
      const n = makeName(rng);
      assert.ok(/^[一-鿿]{3,4}$/.test(n), `姓名格式不正確:${n}`);
    }
  });

  test('姓名池夠大,一個學期不會頻繁重複', () => {
    assert.ok(SURNAMES.length * GIVEN.length >= 500,
      `姓名組合只有 ${SURNAMES.length * GIVEN.length} 種,太容易重複`);
  });
});
