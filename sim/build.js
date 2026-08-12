/* 打包腳本 — 把多檔案的 ES 模組專案打包成單一 HTML 檔案
 *
 * 用法:node sim/build.js
 * 產出:dist/index.html(完全自給自足,沒有任何外部檔案依賴)
 *
 * 為什麼要打包:
 *   開發時拆成多個模組是為了能寫單元測試(邏輯層可以在 Node.js 裡單獨呼叫)。
 *   但分享時單一檔案最方便——放到 GitHub Pages 只要一個檔案,
 *   而且使用者連本機雙擊開啟都能玩(ES 模組用 file:// 協定會被瀏覽器擋掉)。
 *
 * 做法:依相依順序把所有模組串接起來,移除 import 與 export 語法,
 *      再嵌入 index.html 的 <script> 位置。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* 相依順序(被依賴的排前面)。手動指定而非自動解析,
 * 因為專案規模小、順序穩定,自動解析反而是多餘的複雜度。 */
const MODULES = [
  'src/data/config.js',
  'src/rng.js',
  'src/data/depts.js',
  'src/data/activities.js',
  'src/data/names.js',
  'src/data/mentors.js',
  'src/data/events.js',
  'src/core/state.js',
  'src/core/exam.js',
  'src/core/conquest.js',
  'src/core/activity.js',
  'src/core/eventcard.js',
  'src/core/risk.js',
  'src/core/ending.js',
  'src/core/engine.js',
  'src/ui/render.js',
];

/* 移除模組語法 */
function stripModuleSyntax(src, path) {
  let s = src;

  /* 移除 import 陳述式(import 開頭到第一個分號為止) */
  s = s.replace(/^import[\s\S]*?;/gm, '');

  /* 移除 re-export(例如 export { clamp };) */
  s = s.replace(/^export\s*\{[^}]*\}\s*;?/gm, '');

  /* 移除宣告前的 export 關鍵字,保留宣告本身 */
  s = s.replace(/^export\s+(?=(const|let|var|function|async|class)\b)/gm, '');

  /* 不允許殘留任何模組語法,否則打包出來的檔案會壞掉 */
  const leftover = s.match(/^\s*(import|export)\b.*$/gm);
  if (leftover) {
    throw new Error(`${path} 仍有未處理的模組語法:\n${leftover.join('\n')}`);
  }
  return s.trim();
}

async function main() {
  const parts = [];
  for (const m of MODULES) {
    const src = await readFile(join(ROOT, m), 'utf8');
    parts.push(
      `/* ${'='.repeat(64)}\n   ${m}\n   ${'='.repeat(64)} */\n` +
      stripModuleSyntax(src, m),
    );
  }

  /* 包在 IIFE 裡,避免污染全域 */
  const bundle = `(function(){\n'use strict';\n\n${parts.join('\n\n')}\n})();`;

  let html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const tag = '<script type="module" src="./src/ui/render.js"></script>';
  if (!html.includes(tag)) {
    throw new Error(`index.html 裡找不到預期的 script 標籤:${tag}`);
  }
  html = html.replace(tag, `<script>\n${bundle}\n</script>`);

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  const out = join(ROOT, 'dist', 'index.html');
  await writeFile(out, html, 'utf8');

  /* GitHub Pages 預設會用 Jekyll 處理檔案,這個空檔案是關掉它的標準做法。
   * 不關掉的話,開頭是底線的檔案或資料夾會被忽略。 */
  await writeFile(join(ROOT, 'dist', '.nojekyll'), '', 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`打包完成:dist/index.html（${kb} KB，共 ${MODULES.length} 個模組）`);
  console.log('這個檔案完全自給自足,可以直接放到 GitHub Pages,也可以本機雙擊開啟。');
}

main().catch((e) => {
  console.error('打包失敗:', e.message);
  process.exit(1);
});
