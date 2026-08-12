import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, clamp } from '../src/rng.js';

describe('種子化隨機數', () => {
  test('同一顆種子產生完全相同的序列', () => {
    const a = createRng('abc123');
    const b = createRng('abc123');
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    assert.deepEqual(seqA, seqB);
  });

  test('不同種子產生不同序列', () => {
    const a = createRng('seed-one');
    const b = createRng('seed-two');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    assert.notDeepEqual(seqA, seqB);
  });

  test('next() 落在 [0,1) 區間', () => {
    const r = createRng('range-test');
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      assert.ok(v >= 0 && v < 1, `超出範圍:${v}`);
    }
  });

  test('int(a,b) 為閉區間,且兩端都取得到', () => {
    const r = createRng('int-test');
    const seen = new Set();
    for (let i = 0; i < 3000; i++) {
      const v = r.int(1, 6);
      assert.ok(v >= 1 && v <= 6, `超出範圍:${v}`);
      assert.ok(Number.isInteger(v), '必須是整數');
      seen.add(v);
    }
    assert.equal(seen.size, 6, '1 到 6 每個值都應該出現過');
  });

  test('chance(0) 永不成立、chance(100) 永遠成立', () => {
    const r = createRng('chance-test');
    for (let i = 0; i < 500; i++) {
      assert.equal(r.chance(0), false);
      assert.equal(r.chance(100), true);
    }
  });

  test('chance(50) 的長期比例接近五成', () => {
    const r = createRng('chance-dist');
    let hit = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (r.chance(50)) hit++;
    const ratio = hit / N;
    assert.ok(ratio > 0.47 && ratio < 0.53, `比例偏差過大:${ratio}`);
  });

  test('pick 一定回傳陣列中的元素', () => {
    const r = createRng('pick-test');
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 500; i++) assert.ok(arr.includes(r.pick(arr)));
  });

  test('shuffle 不改變原陣列,且元素完全保留', () => {
    const r = createRng('shuffle-test');
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8], '原陣列不應被改動');
    assert.deepEqual(out.slice().sort((x, y) => x - y), src);
  });

  test('clamp 正確夾限', () => {
    assert.equal(clamp(5, 1, 10), 5);
    assert.equal(clamp(-3, 1, 10), 1);
    assert.equal(clamp(99, 1, 10), 10);
  });
});
