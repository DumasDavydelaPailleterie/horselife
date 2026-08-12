/* 歷任名單的組成規則
 *
 * 抽成純函式的理由:這條規則有兩種模式與一個門檻,如果寫在畫面程式裡,
 * 就只能靠人工在瀏覽器裡一種一種試,而且少量情境很難重現。
 * 抽出來之後可以直接寫測試把兩種模式都釘住。
 */

import { CONFIG } from '../data/config.js';

/* 回傳:
 *   mode      'full'   全部列出(含隨機路人)
 *             'merged' 只列名冊角色,路人併成一個數字
 *   named     要逐一列出的對象
 *   strangers 要被合併的路人數量(full 模式下為 0)
 */
export function composeNamelist(conquered, threshold = CONFIG.namelistFullBelow) {
  const list = conquered || [];

  if (list.length === 0) {
    return { mode: 'full', named: [], strangers: 0 };
  }

  /* 人數少的時候每一個都值得留名字,連路人也列出來 */
  if (list.length <= threshold) {
    return { mode: 'full', named: list.slice(), strangers: 0 };
  }

  const named = list.filter((c) => !c.generated);
  return { mode: 'merged', named, strangers: list.length - named.length };
}
