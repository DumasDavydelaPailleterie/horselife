/* 大種馬 — 平衡參數集中表
 * 所有可調數值都在這個檔案裡。調平衡只需要改這裡,不要改邏輯程式碼。
 */

export const CONFIG = {
  /* ---------- 基本設定 ---------- */
  startAge: 18,
  startYear: 2026,
  totalSemesters: 8,        /* 大一上 ~ 大四下 */

  /* ---------- 骰子與加點 ---------- */
  dicePerSemester: 3,       /* 每學期擲幾顆骰 */
  diceFaces: 6,             /* 骰子面數 */
  slotPerDiceDiv: 2,        /* 骰子兌換社交場次:點數 ÷ 此值(向下取整) */
  allocatableAbilities: ['sta', 'int', 'str'],  /* 技巧力不能用骰子加點 */

  /* ---------- 社交活動場次 ---------- */
  baseSlotConst: 2,         /* 基礎場次 = 此常數 + 體力 ÷ slotStaDiv */
  slotStaDiv: 12,

  /* ---------- 攻略成功率公式 ---------- */
  /* 成功率(%) = sta*w.sta + int*w.int + str*w.str + skl*w.skl - 難度修正 - 風評修正 */
  conquestWeights: { skl: 0.6, str: 0.3, sta: 0.1, int: 0 },
  difficultyPenalty: { low: 5, mid: 15, high: 25 },
  repPenaltyDiv: 8,         /* 風評修正 = 風評 ÷ 此值(向下取整) */
  conquestRateMin: 1,       /* 成功率下限(%) — 永遠留一線希望 */
  conquestRateMax: 90,      /* 成功率上限(%) */

  /* ---------- 技巧力成長 ---------- */
  sklOnSuccess: 2,
  sklOnFail: 0.5,
  sklSoftCap: 60,           /* 超過此值後成功獲得量減半 */
  mentorSessions: 3,        /* 老學長帶浪次數 */
  mentorSklPerSession: 10,  /* 每次帶浪的技巧力 */
  mentorSlotCost: 1,        /* 每次帶浪消耗的社交場次 */

  /* ---------- 風評與風險 ---------- */
  repPerConquest: 1,        /* 每次成功攻略累積的風評 */
  repDecayPerSemester: 1,   /* 每學期自然消退 */
  riskCapPercent: 60,       /* 意外事件觸發機率上限 */
  riskFromActivity: true,   /* 活動的風險係數是否累積 */
  activityRiskValue: { none: 0, low: 2, mid: 5, high: 10, extreme: 15 },

  /* ---------- 事件卡 ---------- */
  eventsPerPhase: { H1: 1, MID: 1, H2: 2, FIN: 0, VAC: 2 },
  /* 三段應對:成功率與幅度 */
  responses: {
    bold:   { label: '全力一搏', rate: 35, mag: 3 },
    normal: { label: '照常執行', rate: 50, mag: 2 },
    safe:   { label: '保守應對', rate: 70, mag: 1 },
  },
  /* 風險類事件卡進入卡池的門檻 */
  riskCardGate: { rep: 6 },

  /* ---------- 潛力上限 ---------- */
  /* 體力/學力/肌力:隨機打亂後依序給予上限範圍 */
  potRanges: [[68, 78], [58, 68], [48, 58]],
  potSkl: [75, 90],         /* 技巧力上限範圍 */
  /* 學力與肌力的上限地板 = 最後一學期門檻 + 此緩衝值。
   * 用途:避免天賦隨機到讓玩家開局就注定畢不了業(見 core/state.js 的說明)。 */
  potExamBuffer: 6,

  /* ---------- 起始值隨機浮動 ---------- */
  startJitter: 2,           /* 起始能力 ±此值(技巧力除外) */

  /* ---------- 結局判定 ---------- */
  endingTiers: [
    { min: 80, key: 'legend',  name: '傳說級種馬' },
    { min: 40, key: 'stud',    name: '大種馬' },
    { min: 16, key: 'player',  name: '情場浪子' },
    { min: 4,  key: 'rotate',  name: '快速輪換' },
    { min: 1,  key: 'normal',  name: '普通大學生' },
    { min: 0,  key: 'pure',    name: '純情一頁過客' },
  ],
};

/* 學期序號 → 中文名稱(1 ~ 8) */
export const SEMESTER_NAMES = [
  '大一上', '大一下', '大二上', '大二下',
  '大三上', '大三下', '大四上', '大四下',
];

/* 階段順序與名稱 */
export const PHASES = ['H1', 'MID', 'H2', 'FIN', 'VAC'];
export const PHASE_NAMES = {
  H1: '學期前半', MID: '期中考', H2: '學期後半', FIN: '期末考', VAC: '寒暑假',
};

/* 能力代碼 → 中文 */
export const ABL = { sta: '體力', int: '學力', str: '肌力', skl: '技巧力' };

/* 年級 = 向上取整(學期序號 ÷ 2) */
export const gradeOf = (sem) => Math.ceil(sem / 2);
