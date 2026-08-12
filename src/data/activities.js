/* 社交活動表 — 依規格草案 5.4 節
 * enc  = 單場接觸對象數(流量)
 * req  = 能力門檻(null 表示無門檻;examInt 表示需達當學期學力門檻)
 * diff = 對象平均難度 low / mid / high
 * risk = 風險係數 none / low / mid / high / extreme
 * mentorDept = 該活動是哪個系的老學長藏身處
 */

export const ACTIVITIES = [
  {
    id: 'act_read', name: '圖書館讀書會', enc: 1,
    req: { int: 'exam' }, diff: 'low', risk: 'none',
    mentorDept: 'CS',
    desc: '幾個人約在圖書館討論室,桌上攤著整疊講義。',
  },
  {
    id: 'act_club', name: '社團活動', enc: 2,
    req: null, diff: 'low', risk: 'low',
    mentorDept: 'LAW',
    desc: '社辦永遠有人在,永遠有人在吃東西。',
  },
  {
    id: 'act_mixer', name: '系上聯誼', enc: 3,
    req: null, diff: 'mid', risk: 'mid',
    mentorDept: 'MATH',
    desc: '兩個系包了一間熱炒店,桌上開始傳骰盅。',
  },
  {
    id: 'act_camp', name: '迎新宿營', enc: 4,
    req: { sta: 25 }, diff: 'mid', risk: 'mid',
    mentorDept: 'ENG',
    desc: '三天兩夜,睡袋、營火,還有永遠玩不完的團康。',
  },
  {
    id: 'act_gym', name: '健身房', enc: 2,
    req: { str: 30 }, diff: 'mid', risk: 'low',
    mentorDept: null,
    desc: '重訓區的鏡子前面永遠有人在找角度。',
  },
  {
    id: 'act_club_night', name: '夜店', enc: 5,
    req: { str: 35 }, diff: 'high', risk: 'high',
    mentorDept: null,
    desc: '門口的人上下看了你一眼,然後讓開。',
  },
  {
    id: 'act_app', name: '校外聯誠/交友軟體', enc: 5,
    req: { skl: 20 }, diff: 'high', risk: 'extreme',
    mentorDept: null,
    desc: '右滑到手指痠,通知一直在跳。',
  },
];

export const ACT_BY_ID = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

/* 該系老學長藏在哪個活動 */
export function mentorActivityOf(deptKey) {
  return ACTIVITIES.find((a) => a.mentorDept === deptKey) || null;
}

/* 判斷某活動在當前狀態下是否可參加。examInt 為當學期學力門檻 */
export function activityAvailable(act, ab, examInt) {
  if (!act.req) return true;
  for (const [k, v] of Object.entries(act.req)) {
    const need = v === 'exam' ? examInt : v;
    if ((ab[k] || 0) < need) return false;
  }
  return true;
}

/* 活動不可參加時的說明文字(給畫面顯示為何鎖住) */
export function activityLockReason(act, examInt) {
  if (!act.req) return '';
  const names = { sta: '體力', int: '學力', str: '肌力', skl: '技巧力' };
  return Object.entries(act.req)
    .map(([k, v]) => `${names[k]} ${v === 'exam' ? examInt : v}`)
    .join('、') + ' 以上';
}
