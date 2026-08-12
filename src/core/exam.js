/* 期末考與期中預警判定 */

import { examThreshold } from '../data/depts.js';

/* 期末考:學力與肌力都要達標,任一未達標即退學 */
export function runExam(S) {
  const th = examThreshold(S.dept, S.semester);
  const failInt = S.ab.int < th.int;
  const failStr = S.ab.str < th.str;
  const passed = !failInt && !failStr;

  const failed = [];
  if (failInt) failed.push({ key: 'int', name: '學力', have: S.ab.int, need: th.int });
  if (failStr) failed.push({ key: 'str', name: '肌力', have: S.ab.str, need: th.str });

  return { passed, threshold: th, failed };
}

/* 期中預警:計算距離本學期期末門檻還差多少 */
export function midtermWarning(S) {
  const th = examThreshold(S.dept, S.semester);
  const gapInt = th.int - S.ab.int;
  const gapStr = th.str - S.ab.str;
  const warnings = [];
  if (gapInt > 0) warnings.push({ key: 'int', name: '學力', gap: gapInt, need: th.int, have: S.ab.int });
  if (gapStr > 0) warnings.push({ key: 'str', name: '肌力', gap: gapStr, need: th.str, have: S.ab.str });
  return { threshold: th, warnings, safe: warnings.length === 0 };
}
