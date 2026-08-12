/* 打包腳本 — 把多檔案的 ES 模組專案打包成單一 HTML 檔案
 *
 * 用法:node sim/build.js
 * 產出:docs/index.html(完全自給自足,沒有任何外部檔案依賴)
 *
 * 為什麼要打包(有兩個理由,第二個是線上實際踩到的):
 *
 * 一、分享方便。單一檔案可以直接傳給別人,對方雙擊就能開
 *     (多檔案版用 file:// 協定開啟會被瀏覽器的模組安全限制擋掉)。
 *
 * 二、避免快取造成的新舊混雜。GitHub Pages 對每個檔案送出
 *     Cache-Control: max-age=600,十六個模組各自獨立快取,
 *     所以更新之後會有一段時間出現「舊的 conquest.js 配新的 engine.js」
 *     這種組合,瀏覽器會直接拋出 SyntaxError 變成白畫面。
 *     打包成單一檔案之後,玩家快取到的一定是完整的舊版(可以玩,只是舊),
 *     不可能是壞掉的混合體。
 *
 * 為什麼輸出到 docs 而不是 dist:
 *     GitHub Pages 的「Deploy from a branch」只能選根目錄或 /docs 兩種,
 *     不接受任意資料夾。根目錄要留給開發用的多檔案版本,所以用 docs。
 *
 * 做法:依相依順序把所有模組串接起來,移除 import 與 export 語法,
 *      再嵌入 index.html 的 <script> 位置。
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* 相依順序(被依賴的排前面)。手動指定而非自動解析,
 * 因為專案規模小、順序穩定,自動解析反而是多餘的複雜度。 */
const MODULES = [
  /* 純資料,不依賴任何東西 */
  'src/data/config.js',
  'src/rng.js',
  'src/data/depts.js',
  'src/data/activities.js',
  'src/data/names.js',
  'src/data/mentors.js',
  'src/data/events.js',
  'src/data/girls.js',
  /* 邏輯層,順序要照相依關係:
   * state 需要 girls、health 需要 state、conquest 需要 state 與 health、
   * girlpool 需要 girls 與 activities、activity 需要 conquest 與 girlpool */
  'src/core/state.js',
  'src/core/health.js',
  'src/core/conquest.js',
  'src/core/girlpool.js',
  'src/core/activity.js',
  'src/core/exam.js',
  'src/core/eventcard.js',
  'src/core/risk.js',
  'src/core/ending.js',
  'src/core/engine.js',
  /* 畫面層放最後 */
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

/* 保險:掃過 src/ 底下所有的 .js,確認每一支都在打包清單裡。
 *
 * 為什麼需要這個:新增模組時很容易忘記加進 MODULES,而打包本身不會報錯,
 * 要等到在瀏覽器打開才會看到「某個東西 is not defined」。
 * 曾經因為漏掉 girls.js、girlpool.js、health.js 而產出一個壞掉的檔案,
 * 所以改成打包時就直接擋下來。 */
async function assertAllModulesListed() {
  const listed = new Set(MODULES);
  const found = [];

  async function walk(dir) {
    for (const ent of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) await walk(rel);
      else if (ent.name.endsWith('.js')) found.push(rel);
    }
  }
  await walk('src');

  const missing = found.filter((f) => !listed.has(f));
  if (missing.length > 0) {
    throw new Error(
      `以下模組存在但沒有列進打包清單,產出的檔案會壞掉:\n  ${missing.join('\n  ')}\n`
      + '請把它們加進 sim/build.js 的 MODULES,並放在正確的相依順序上。',
    );
  }

  const ghost = MODULES.filter((m) => !found.includes(m));
  if (ghost.length > 0) {
    throw new Error(`打包清單裡有不存在的檔案:\n  ${ghost.join('\n  ')}`);
  }
}

async function main() {
  await assertAllModulesListed();
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

  await mkdir(join(ROOT, 'docs'), { recursive: true });
  const out = join(ROOT, 'docs', 'index.html');
  await writeFile(out, html, 'utf8');

  /* GitHub Pages 預設會用 Jekyll 處理檔案,這個空檔案是關掉它的標準做法。
   * 不關掉的話,開頭是底線的檔案或資料夾會被忽略。 */
  await writeFile(join(ROOT, 'docs', '.nojekyll'), '', 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`打包完成:docs/index.html（${kb} KB，共 ${MODULES.length} 個模組）`);
  console.log('這個檔案完全自給自足。GitHub Pages 請把來源資料夾設為 /docs。');
}

main().catch((e) => {
  console.error('打包失敗:', e.message);
  process.exit(1);
});
