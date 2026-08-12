/* 四個科系:起始能力與期末考門檻
 * 依規格草案 2.3 與 3.2 節。技巧力一律起始 1。
 */

export const DEPTS = {
  ENG: {
    key: 'ENG', name: '外文系',
    start: { sta: 24, int: 26, str: 18, skl: 1 },
    /* 八個學期的期末考門檻 */
    examInt: [24, 27, 30, 33, 36, 39, 42, 45],
    examStr: [17, 20, 23, 26, 28, 30, 32, 34],
    note: '均衡偏社交型,學業壓力最輕,但體格是弱項',
  },
  MATH: {
    key: 'MATH', name: '數學系',
    start: { sta: 18, int: 34, str: 16, skl: 1 },
    examInt: [32, 37, 42, 47, 52, 57, 61, 65],
    examStr: [15, 17, 19, 21, 23, 25, 27, 29],
    note: '學力最強,體力與肌力雙低,純靠腦袋活下去',
  },
  CS: {
    key: 'CS', name: '資工系',
    start: { sta: 16, int: 32, str: 14, skl: 1 },
    examInt: [30, 35, 40, 45, 50, 55, 59, 63],
    examStr: [13, 15, 17, 19, 21, 23, 25, 27],
    note: '學力次高但體格最差,起始總點數最低,是高難度路線',
  },
  LAW: {
    key: 'LAW', name: '法律系',
    start: { sta: 22, int: 30, str: 20, skl: 1 },
    examInt: [28, 32, 36, 40, 44, 48, 52, 56],
    examStr: [19, 22, 25, 28, 31, 34, 36, 38],
    note: '全能無弱點,起始總點數最高,是新手友善路線',
  },
};

export const DEPT_KEYS = Object.keys(DEPTS);

/* 取得某科系某學期的期末考門檻 */
export function examThreshold(deptKey, semester) {
  const d = DEPTS[deptKey];
  if (!d) throw new Error(`未知科系:${deptKey}`);
  const i = semester - 1;
  if (i < 0 || i >= d.examInt.length) throw new Error(`學期超出範圍:${semester}`);
  return { int: d.examInt[i], str: d.examStr[i] };
}
