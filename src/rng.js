/* 種子化隨機數產生器
 * 沿用 YaKyoLife 的演算法:字串雜湊初始化 + Mulberry32 類混合。
 * 同一顆種子必定產生完全相同的序列,這是「分享種子碼重現同一局」的基礎。
 */

export function createRng(seedStr) {
  let s = 1779033703;
  const str = String(seedStr);
  for (let i = 0; i < str.length; i++) {
    s = Math.imul(s ^ str.charCodeAt(i), 3432918353);
    s = (s << 13) | (s >>> 19);
  }

  /* 回傳 [0,1) 浮點數 */
  function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    /* 閉區間整數 [a,b] */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    /* 陣列隨機取一 */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /* p% 機率 */
    chance: (p) => next() * 100 < p,
    /* 原地洗牌(Fisher-Yates),回傳新陣列 */
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

/* 產生一個隨機種子碼(給「換一個」按鈕用,不需要可重現) */
export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
