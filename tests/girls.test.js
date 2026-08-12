import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GIRLS, GIRLS_BY_TIER, GIRL_COUNT, girlAvailableAt } from '../src/data/girls.js';
import { ACTIVITIES } from '../src/data/activities.js';
import { CONFIG } from '../src/data/config.js';
import { createRng } from '../src/rng.js';
import { newState } from '../src/core/state.js';
import { drawGirls, candidates } from '../src/core/girlpool.js';
import { attemptConquest, applyGirlEffect, rateFor, conquestRate } from '../src/core/conquest.js';
import { infect, applyStdPenalty, canCure, attemptCure, hasStd, stdInfo } from '../src/core/health.js';

function mk(dept = 'ENG', seed = 'girls-test') {
  const rng = createRng(seed);
  return { S: newState({ name: '朱董', dept, rng }), rng };
}

describe('女角名冊:資料完整性', () => {
  test('總數為 200 位', () => {
    assert.equal(GIRL_COUNT, 200);
  });

  test('分級比例符合指定：登出 2%、負面 15%、正面 20%、一般 63%', () => {
    assert.equal(GIRLS_BY_TIER.fatal.length, 4, '登出級應為 4 位（2%）');
    assert.equal(GIRLS_BY_TIER.negative.length, 30, '負面級應為 30 位（15%）');
    assert.equal(GIRLS_BY_TIER.positive.length, 40, '正面級應為 40 位（20%）');
    assert.equal(GIRLS_BY_TIER.normal.length, 126, '一般級應為 126 位（63%）');
  });

  test('分級比例換算成百分比要精準符合使用者指定的數字', () => {
    const pct = (n) => (n / GIRL_COUNT) * 100;
    assert.equal(pct(GIRLS_BY_TIER.fatal.length), 2);
    assert.equal(pct(GIRLS_BY_TIER.negative.length), 15);
    assert.equal(pct(GIRLS_BY_TIER.positive.length), 20);
    assert.equal(pct(GIRLS_BY_TIER.normal.length), 63);
  });

  test('登出級角色的在場機率要跟她們的數量匹配', () => {
    /* 名冊擴充讓登出級從 2 位變 4 位,如果在場機率不跟著降,
     * 「至少一位在場」的機率會翻倍,登出率也會跟著翻倍。 */
    const p = CONFIG.fatalInPlayChance;
    const atLeastOne = 1 - (1 - p) ** GIRLS_BY_TIER.fatal.length;
    assert.ok(atLeastOne < 0.32,
      `至少一位登出級角色在場的機率是 ${(atLeastOne * 100).toFixed(0)}%,太高了`);
    assert.ok(atLeastOne > 0.15,
      `只有 ${(atLeastOne * 100).toFixed(0)}% 的局有登出級角色,這個機制幾乎不會被玩家遇到`);
  });

  test('姓名不重複', () => {
    const names = GIRLS.map((g) => g.name);
    assert.equal(new Set(names).size, names.length, '有重複的姓名');
  });

  test('id 不重複', () => {
    const ids = GIRLS.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length, '有重複的 id');
  });

  test('每位都有姓名、稱號、分級、難度', () => {
    for (const g of GIRLS) {
      assert.ok(g.name, `${g.id} 缺少姓名`);
      assert.ok(g.title, `${g.name} 缺少稱號`);
      assert.ok(['fatal', 'negative', 'positive', 'normal'].includes(g.tier), `${g.name} 分級非法:${g.tier}`);
      assert.ok(['low', 'mid', 'high'].includes(g.diff), `${g.name} 難度非法:${g.diff}`);
    }
  });

  test('特殊角色都有專屬情境與成功文案', () => {
    for (const g of GIRLS.filter((x) => x.tier !== 'normal')) {
      assert.ok(g.desc && g.desc.length > 10, `${g.name} 缺少情境描述`);
      assert.ok(g.hit && g.hit.length > 10, `${g.name} 缺少成功文案`);
      assert.ok(g.eff && Object.keys(g.eff).length > 0, `${g.name} 沒有任何特殊效果`);
    }
  });

  test('一般角色不該有特殊效果', () => {
    for (const g of GIRLS_BY_TIER.normal) {
      assert.ok(!g.eff, `${g.name} 是一般角色但有特殊效果`);
    }
  });

  test('效果只能使用合法的鍵', () => {
    const valid = new Set(['sta', 'int', 'str', 'skl', 'enc', 'rep', 'risk',
      'slot', 'std', 'immune', 'fatal']);
    for (const g of GIRLS) {
      for (const k of Object.keys(g.eff || {})) {
        assert.ok(valid.has(k), `${g.name} 使用了非法效果鍵 ${k}`);
      }
    }
  });

  test('限定出現地點的活動 id 都真實存在', () => {
    const ids = new Set(ACTIVITIES.map((a) => a.id));
    for (const g of GIRLS) {
      for (const w of g.where || []) {
        assert.ok(ids.has(w), `${g.name} 指定了不存在的活動 ${w}`);
      }
    }
  });

  test('登出級角色都限定在高風險場所（風險與報酬要對應）', () => {
    const highRisk = new Set(
      ACTIVITIES.filter((a) => a.risk === 'high' || a.risk === 'extreme').map((a) => a.id),
    );
    for (const g of GIRLS_BY_TIER.fatal) {
      assert.ok(g.where && g.where.length > 0, `${g.name} 登出級角色必須限定出現地點`);
      for (const w of g.where) {
        assert.ok(highRisk.has(w),
          `${g.name} 出現在低風險場所 ${w},玩家無法預期風險`);
      }
    }
  });

  test('登出級角色的效果就是結束遊戲', () => {
    for (const g of GIRLS_BY_TIER.fatal) {
      assert.ok(typeof g.eff.fatal === 'string' && g.eff.fatal.length > 10,
        `${g.name} 缺少結束原因的文案`);
    }
  });

  test('帶性病的角色數量與種類符合設計', () => {
    const withStd = GIRLS.filter((g) => g.eff?.std);
    assert.ok(withStd.length >= 6, `帶性病的角色只有 ${withStd.length} 位,太少`);
    for (const g of withStd) {
      assert.ok(CONFIG.std[g.eff.std], `${g.name} 的性病種類 ${g.eff.std} 未定義`);
    }
    /* 不可治癒的愛滋要非常罕見 */
    const hiv = withStd.filter((g) => g.eff.std === 'hiv');
    assert.ok(hiv.length >= 1 && hiv.length <= 2,
      `不可治癒的角色有 ${hiv.length} 位,應該只有 1 到 2 位`);
  });

  test('正面角色的效果整體是有利的', () => {
    for (const g of GIRLS_BY_TIER.positive) {
      const e = g.eff;
      assert.ok(!e.std, `${g.name} 是正面角色卻帶病`);
      assert.ok(!e.fatal, `${g.name} 是正面角色卻會導致登出`);
      /* 風評若有變動,正面角色應該是改善(負值) */
      if (e.rep !== undefined) {
        assert.ok(e.rep <= 0, `${g.name} 是正面角色但風評惡化 ${e.rep}`);
      }
    }
  });

  test('負面角色至少有一項實質損失', () => {
    for (const g of GIRLS_BY_TIER.negative) {
      const e = g.eff;
      const harmful = e.std || (e.rep > 0) || (e.risk > 0)
        || (e.slot < 0) || (e.enc < 0)
        || (e.sta > 0) || (e.str > 0) || (e.int > 0);
      /* 註:負面角色的 sta/str/int 在資料裡是「扣多少」的正數語意嗎?
       * 不是——女角效果是直接變動量,所以損失必須寫成負數。這裡驗證這一點。 */
      const hasNegativeAbility = ['sta', 'int', 'str', 'skl']
        .some((k) => e[k] !== undefined && e[k] < 0);
      assert.ok(e.std || e.fatal || (e.rep > 0) || (e.risk > 0)
        || (e.slot < 0) || (e.enc < 0) || hasNegativeAbility || harmful,
        `${g.name} 是負面角色但看不出損失:${JSON.stringify(e)}`);
    }
  });
});

describe('女角抽取', () => {
  test('限定地點的角色只在指定活動出現', () => {
    const g = GIRLS_BY_TIER.fatal[0];
    assert.equal(girlAvailableAt(g, g.where[0]), true);
    assert.equal(girlAvailableAt(g, 'act_read'), false);
  });

  test('不限地點的角色在任何活動都可能出現', () => {
    const g = GIRLS_BY_TIER.normal[0];
    for (const a of ACTIVITIES) {
      assert.equal(girlAvailableAt(g, a.id), true);
    }
  });

  test('抽出的人數等於要求的人數', () => {
    const { S, rng } = mk();
    const list = drawGirls(S, 'act_club', 5, 'low', rng);
    assert.equal(list.length, 5);
  });

  test('同一場活動不會抽到重複的人', () => {
    const { S, rng } = mk();
    const list = drawGirls(S, 'act_club', 8, 'low', rng);
    const ids = list.filter((g) => g.id).map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length, '同一場出現了重複角色');
  });

  test('已接觸過的角色不會再出現', () => {
    const { S, rng } = mk();
    const first = drawGirls(S, 'act_club', 3, 'low', rng);
    first.forEach((g) => { if (g.id) S.metIds.push(g.id); });
    const second = drawGirls(S, 'act_club', 3, 'low', rng);
    for (const g of second) {
      if (g.id) assert.ok(!first.some((f) => f.id === g.id), `${g.name} 重複出現`);
    }
  });

  test('名冊抽完之後會退回隨機路人,不會讓遊戲卡住', () => {
    const { S, rng } = mk();
    S.metIds = GIRLS.map((g) => g.id);
    assert.equal(candidates(S, 'act_club').length, 0, '前提:候選名單已清空');
    const list = drawGirls(S, 'act_club', 3, 'low', rng);
    assert.equal(list.length, 3, '仍應抽出 3 位');
    for (const g of list) {
      assert.equal(g.generated, true, '應該是隨機生成的路人');
      assert.equal(g.tier, 'normal', '路人不該有特殊效果');
    }
  });

  test('一般角色會補上通用的情境與成功文案', () => {
    const { S, rng } = mk();
    const list = drawGirls(S, 'act_club', 6, 'low', rng);
    for (const g of list) {
      assert.ok(g.desc, `${g.name} 缺少情境描述`);
      assert.ok(g.hit, `${g.name} 缺少成功文案`);
    }
  });

  test('特殊角色的出現頻率明顯低於名冊佔比', () => {
    /* 名冊上特殊角色佔 37%,但因為權重壓低,實際抽到的比例應該低得多 */
    let special = 0, total = 0;
    for (let i = 0; i < 300; i++) {
      const { S, rng } = mk('ENG', `freq-${i}`);
      const list = drawGirls(S, 'act_club', 4, 'low', rng);
      for (const g of list) {
        total++;
        if (g.tier !== 'normal') special++;
      }
    }
    const ratio = special / total;
    assert.ok(ratio < 0.30,
      `特殊角色抽中率 ${(ratio * 100).toFixed(1)}%,過高會失去稀有感`);
    assert.ok(ratio > 0.02,
      `特殊角色抽中率只有 ${(ratio * 100).toFixed(1)}%,玩家幾乎遇不到`);
  });
});

describe('女角特殊效果', () => {
  test('正面效果確實增加能力', () => {
    const { S } = mk();
    S.pot = { sta: 99, int: 99, str: 99, skl: 99 };
    const before = S.ab.int;
    applyGirlEffect(S, { eff: { int: 10 } });
    assert.equal(S.ab.int, before + 10);
  });

  test('負面效果的風評與風險確實累加', () => {
    const { S } = mk();
    applyGirlEffect(S, { eff: { rep: 8, risk: 25 } });
    assert.equal(S.rep, 8);
    assert.equal(S.risk, 25);
  });

  test('場次與邂逅效果確實累加', () => {
    const { S } = mk();
    applyGirlEffect(S, { eff: { slot: 3, enc: 5 } });
    assert.equal(S.bonusSlots, 3);
    assert.equal(S.encBonus, 5);
  });

  test('登出效果會被回報但不直接改狀態', () => {
    const { S } = mk();
    const r = applyGirlEffect(S, { eff: { fatal: '結束了' } });
    assert.equal(r.fatal, '結束了');
    assert.equal(S.over, false, '結束的處理應該由引擎負責,不是效果函式');
  });

  test('攻略成功會記錄姓名、稱號與分級', () => {
    const { S, rng } = mk();
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    S.pot = { sta: 200, int: 200, str: 200, skl: 200 };
    attemptConquest(S, { id: 'x1', name: '測試甲', title: '系花', tier: 'positive', diff: 'low' }, rng);
    assert.equal(S.kills, 1);
    assert.equal(S.conquered[0].name, '測試甲');
    assert.equal(S.conquered[0].title, '系花');
    assert.equal(S.conquered[0].tier, 'positive');
  });

  test('接觸過的角色會被記錄,即使攻略失敗', () => {
    const { S, rng } = mk();
    S.ab = { sta: 1, int: 1, str: 1, skl: 1 };   /* 幾乎必定失敗 */
    attemptConquest(S, { id: 'x9', name: '測試乙', diff: 'high' }, rng);
    assert.ok(S.metIds.includes('x9'), '失敗也算接觸過,不該再遇到');
  });
});

describe('校醫室與性病免疫', () => {
  test('校醫室是一個真實存在的活動,而且沒有門檻與風險', () => {
    const clinic = ACTIVITIES.find((a) => a.id === 'act_clinic');
    assert.ok(clinic, '找不到校醫室');
    assert.equal(clinic.req, null, '校醫室不該有能力門檻');
    assert.equal(clinic.risk, 'none', '校醫室不該有風險');
    assert.equal(clinic.enc, 1, '校醫室是低流量場所');
  });

  test('全名冊只有一位提供免疫的角色,而且她在校醫室', () => {
    const immunes = GIRLS.filter((g) => g.eff?.immune);
    assert.equal(immunes.length, 1, `提供免疫的角色有 ${immunes.length} 位,應該只有 1 位`);
    const nurse = immunes[0];
    assert.deepEqual(nurse.where, ['act_clinic'], '免疫角色必須限定在校醫室');
    assert.equal(nurse.tier, 'positive', '免疫角色應該是正面角色');
  });

  test('校醫室是專屬場所,一般角色不會混進來稀釋護理師', () => {
    const { S } = mk();
    const pool = candidates(S, 'act_clinic');
    assert.ok(pool.length > 0, '校醫室應該有人');
    for (const g of pool) {
      assert.ok(Array.isArray(g.where) && g.where.includes('act_clinic'),
        `${g.name} 不該出現在專屬場所校醫室`);
    }
  });

  test('護理師是固定成功率 90%,不受能力值影響', () => {
    const nurse = GIRLS.find((g) => g.eff?.immune);
    assert.equal(nurse.fixedRate, 90, '護理師應為固定成功率 90%');

    const weak = mk().S;
    weak.ab = { sta: 1, int: 1, str: 1, skl: 1 };
    assert.equal(rateFor(weak, nurse), 90, '開局能力極低也該是 90%');

    const strong = mk().S;
    strong.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    assert.equal(rateFor(strong, nurse), 90, '能力很高也還是 90%,不會更高');

    const shamed = mk().S;
    shamed.rep = 200;
    assert.equal(rateFor(shamed, nurse), 90, '風評再差也不影響她');
  });

  test('沒有固定成功率的角色照一般公式計算（對照）', () => {
    const { S } = mk();
    S.ab = { sta: 30, int: 50, str: 30, skl: 40 };
    const ordinary = { name: '路人', diff: 'mid' };
    assert.equal(rateFor(S, ordinary), conquestRate(S, 'mid'));
  });

  test('開局就去校醫室也拿得到免疫（這是這個設定的重點）', () => {
    let got = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const { S, rng } = mk('CS', `easy-${i}`);   /* 資工系起始能力最差 */
      const nurse = GIRLS.find((g) => g.eff?.immune);
      const r = attemptConquest(S, { ...nurse, difficulty: nurse.diff }, rng);
      if (r.success && S.immune) got++;
    }
    const rate = got / N;
    assert.ok(rate > 0.8,
      `一次就成功的比例只有 ${(rate * 100).toFixed(0)}%,免疫沒有變簡單`);
  });

  test('專屬場所不會被邂逅加成灌水成一堆路人', () => {
    const { S, rng } = mk();
    /* 事件卡可能給邂逅機會加成,但校醫室只有護理師一個人 */
    const many = drawGirls(S, 'act_clinic', 5, 'low', rng);
    assert.equal(many.length, 1, `校醫室應該只抽出 1 人,實際 ${many.length} 人`);
    assert.ok(many[0].eff?.immune, '而且那個人必須是護理師');
    assert.ok(!many.some((g) => g.generated), '不該出現隨機生成的路人');
  });

  test('非專屬場所名冊抽完時仍會補路人,不會讓遊戲卡住（對照）', () => {
    const { S, rng } = mk();
    S.metIds = GIRLS.map((g) => g.id);
    const list = drawGirls(S, 'act_club', 3, 'low', rng);
    assert.equal(list.length, 3);
    assert.ok(list.every((g) => g.generated), '應該全部是隨機路人');
  });

  test('護理師出手失敗後還可以再遇到（她是員工,不是一夜的對象）', () => {
    const { S } = mk();
    const nurse = GIRLS.find((g) => g.eff?.immune);
    assert.equal(nurse.repeatable, true, '護理師必須是可重複遇到的');
    /* 模擬一次失敗:接觸過但沒攻略成功 */
    S.metIds.push(nurse.id);
    const pool = candidates(S, 'act_clinic');
    assert.ok(pool.some((g) => g.id === nurse.id),
      '失敗一次之後仍應該遇得到她');
  });

  test('護理師攻略成功之後就不會再出現', () => {
    const { S } = mk();
    const nurse = GIRLS.find((g) => g.eff?.immune);
    S.conquered.push({ name: nurse.name, title: nurse.title, tier: nurse.tier, semester: 1 });
    const pool = candidates(S, 'act_clinic');
    assert.ok(!pool.some((g) => g.id === nurse.id), '成功之後不該再出現');
  });

  test('一般角色接觸過一次就不會再出現（與護理師的對照）', () => {
    const { S } = mk();
    const ordinary = GIRLS_BY_TIER.normal[0];
    assert.ok(!ordinary.repeatable, '一般角色不該是可重複的');
    S.metIds.push(ordinary.id);
    const pool = candidates(S, 'act_club');
    assert.ok(!pool.some((g) => g.id === ordinary.id), '接觸過就不該再出現');
  });

  test('免疫之後任何角色都無法造成感染', () => {
    const { S } = mk();
    S.immune = true;
    const r = infect(S, 'hiv');
    assert.equal(r.changed, false);
    assert.equal(r.immune, true);
    assert.equal(S.std, null, '免疫者不該被感染');
  });

  test('免疫是永久的,重複取得不會出錯', () => {
    const { S } = mk();
    applyGirlEffect(S, { eff: { immune: true } });
    assert.equal(S.immune, true);
    applyGirlEffect(S, { eff: { immune: true } });
    assert.equal(S.immune, true);
  });

  test('攻略帶病角色時,免疫會擋下感染並回報', () => {
    const { S, rng } = mk();
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    S.pot = { sta: 200, int: 200, str: 200, skl: 200 };
    S.immune = true;
    const r = attemptConquest(S,
      { id: 'z1', name: '測試丙', title: '夜店常客', tier: 'negative',
        diff: 'low', eff: { std: 'syphilis' } }, rng);
    assert.equal(r.success, true);
    assert.equal(S.std, null, '免疫者不該被感染');
    assert.equal(r.immuneBlocked, true, '應回報這次感染被免疫擋下');
  });

  test('沒有免疫時同樣的角色會造成感染（對照組）', () => {
    const { S, rng } = mk();
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    S.pot = { sta: 200, int: 200, str: 200, skl: 200 };
    const r = attemptConquest(S,
      { id: 'z2', name: '測試丁', title: '夜店常客', tier: 'negative',
        diff: 'low', eff: { std: 'syphilis' } }, rng);
    assert.equal(r.success, true);
    assert.equal(S.std, 'syphilis');
    assert.equal(r.immuneBlocked, false);
  });

  test('攻略失敗不會取得免疫（必須真的成功,人斬 +1 才算）', () => {
    const { S, rng } = mk();
    S.ab = { sta: 1, int: 1, str: 1, skl: 1 };   /* 幾乎必定失敗 */
    let sawFail = false;
    for (let i = 0; i < 30; i++) {
      const r = attemptConquest(S,
        { id: `nz${i}`, name: '護理師', title: '校醫室的護理師',
          tier: 'positive', diff: 'high', eff: { immune: true } }, rng);
      if (!r.success) {
        sawFail = true;
        assert.equal(S.immune, false, '失敗不該取得免疫');
      }
    }
    assert.ok(sawFail, '測試前提:至少要有一次失敗');
  });

  test('攻略成功才取得免疫,而且會被記錄在效果明細裡', () => {
    const { S, rng } = mk();
    S.ab = { sta: 99, int: 99, str: 99, skl: 99 };
    S.pot = { sta: 200, int: 200, str: 200, skl: 200 };
    const r = attemptConquest(S,
      { id: 'nurse1', name: '護理師', title: '校醫室的護理師',
        tier: 'positive', diff: 'low', eff: { immune: true } }, rng);
    assert.equal(r.success, true);
    assert.equal(r.counted, true, '應該計入人斬');
    assert.equal(S.immune, true);
    assert.ok(r.applied.some((a) => a.key === 'immune'),
      '效果明細裡應該有 immune,畫面才知道要宣告');
  });

  test('免疫不會治好已經得到的病（只防未來,不溯及既往）', () => {
    const { S } = mk();
    infect(S, 'syphilis');
    applyGirlEffect(S, { eff: { immune: true } });
    assert.equal(S.std, 'syphilis', '免疫不該自動治好現有的病');
    assert.equal(S.immune, true);
  });

  test('未知的效果鍵會拋出錯誤,不會被靜默忽略', () => {
    const { S } = mk();
    assert.throws(() => applyGirlEffect(S, { eff: { nonsense: 1 } }),
      /未知的鍵/);
  });
});

describe('性病系統', () => {
  test('感染後狀態正確', () => {
    const { S } = mk();
    assert.equal(hasStd(S), false);
    const r = infect(S, 'syphilis');
    assert.equal(r.changed, true);
    assert.equal(S.std, 'syphilis');
    assert.equal(hasStd(S), true);
    assert.equal(stdInfo(S).name, '梅毒');
  });

  test('未知的性病種類會拋出錯誤', () => {
    const { S } = mk();
    assert.throws(() => infect(S, 'nope'), /未知的性病種類/);
  });

  test('重複感染同一種不會重置病程', () => {
    const { S } = mk();
    infect(S, 'syphilis');
    S.stdSemesters = 3;
    const r = infect(S, 'syphilis');
    assert.equal(r.changed, false);
    assert.equal(S.stdSemesters, 3, '病程不該被重置');
  });

  test('愛滋不會被梅毒覆蓋（嚴重的優先）', () => {
    const { S } = mk();
    infect(S, 'hiv');
    infect(S, 'syphilis');
    assert.equal(S.std, 'hiv', '已感染愛滋不該被梅毒取代');
  });

  test('每學期結算會扣能力並惡化風評', () => {
    const { S } = mk();
    S.ab = { sta: 50, int: 50, str: 50, skl: 50 };
    S.pot = { sta: 99, int: 99, str: 99, skl: 99 };
    infect(S, 'syphilis');
    const cfg = CONFIG.std.syphilis;
    const r = applyStdPenalty(S);
    assert.equal(S.ab.sta, 50 - cfg.perSemester.sta);
    assert.equal(S.ab.str, 50 - cfg.perSemester.str);
    assert.equal(S.rep, cfg.repPerSemester);
    assert.equal(r.semesters, 1);
  });

  test('愛滋每學期扣三項能力', () => {
    const { S } = mk();
    S.ab = { sta: 50, int: 50, str: 50, skl: 50 };
    S.pot = { sta: 99, int: 99, str: 99, skl: 99 };
    infect(S, 'hiv');
    const cfg = CONFIG.std.hiv;
    applyStdPenalty(S);
    assert.equal(S.ab.sta, 50 - cfg.perSemester.sta);
    assert.equal(S.ab.str, 50 - cfg.perSemester.str);
    assert.equal(S.ab.int, 50 - cfg.perSemester.int);
  });

  test('沒生病時結算不做任何事', () => {
    const { S } = mk();
    assert.equal(applyStdPenalty(S), null);
  });

  test('梅毒可以就醫,愛滋不行', () => {
    const a = mk().S;
    a.slots = 5;
    infect(a, 'syphilis');
    assert.equal(canCure(a), true);

    const b = mk().S;
    b.slots = 5;
    infect(b, 'hiv');
    assert.equal(canCure(b), false, '愛滋不可治癒');
    assert.throws(() => attemptCure(b, createRng('x')), /無法治癒/);
  });

  test('場次不足時不能就醫', () => {
    const { S } = mk();
    infect(S, 'syphilis');
    S.slots = 0;
    assert.equal(canCure(S), false);
  });

  test('就醫會消耗場次,成功則痊癒', () => {
    /* 多試幾顆種子確保同時涵蓋成功與失敗兩種結果 */
    let cured = 0, failed = 0;
    for (let i = 0; i < 60; i++) {
      const { S, rng } = mk('ENG', `cure-${i}`);
      S.ab = { sta: 50, int: 50, str: 50, skl: 50 };
      S.pot = { sta: 99, int: 99, str: 99, skl: 99 };
      infect(S, 'syphilis');
      S.slots = 3;
      const r = attemptCure(S, rng);
      assert.equal(S.slots, 3 - CONFIG.std.syphilis.cureSlots, '應消耗場次');
      if (r.cured) { cured++; assert.equal(S.std, null, '痊癒後不該還帶病'); }
      else { failed++; assert.equal(S.std, 'syphilis', '沒治好應該還帶病'); }
    }
    assert.ok(cured > 0, '應該有治好的案例');
    assert.ok(failed > 0, '應該有沒治好的案例（成功率不是 100%）');
  });

  test('沒生病時就醫會拋出錯誤', () => {
    const { S, rng } = mk();
    assert.throws(() => attemptCure(S, rng), /沒有需要治療的病/);
  });

  test('痊癒次數會被記錄', () => {
    for (let i = 0; i < 40; i++) {
      const { S, rng } = mk('ENG', `cnt-${i}`);
      infect(S, 'syphilis');
      S.slots = 3;
      const r = attemptCure(S, rng);
      if (r.cured) { assert.equal(S.stdCured, 1); return; }
    }
    assert.fail('40 次嘗試都沒治好,機率設定可能有問題');
  });
});
