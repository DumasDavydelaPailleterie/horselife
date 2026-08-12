/* 畫面渲染與互動 — 唯一會碰 DOM 的檔案
 * 邏輯全部來自 core/engine.js;這裡只負責顯示與收集玩家輸入。
 */

import { createGame } from '../core/engine.js';
import { CONFIG, PHASES, PHASE_NAMES, SEMESTER_NAMES, ABL } from '../data/config.js';
import { DEPTS, DEPT_KEYS } from '../data/depts.js';
import { randomSeed } from '../rng.js';
import { composeNamelist } from '../core/namelist.js';

const APP_VER = 'v0.2.0';
const $ = (id) => document.getElementById(id);

let game = null;
let seed = new URLSearchParams(location.search).get('seed') || randomSeed();
let chosenDept = 'ENG';
let lastRenderedLog = 0;
/* 「還去不了的地方」折疊區的開合狀態,記住玩家的偏好,不要每次重繪都收回去 */
let lockedOpen = false;
let curBlock = null;
let curBlockKey = '';

/* ================= 開場畫面 ================= */

function buildStart() {
  $('ver').textContent = APP_VER;
  $('seed-show').value = seed;

  const seg = $('seg-dept');
  seg.innerHTML = '';
  DEPT_KEYS.forEach((k) => {
    const b = document.createElement('button');
    b.dataset.v = k;
    b.textContent = DEPTS[k].name;
    if (k === chosenDept) b.className = 'on';
    b.onclick = () => {
      chosenDept = k;
      [...seg.children].forEach((c) => c.classList.toggle('on', c.dataset.v === k));
      showDeptNote();
    };
    seg.appendChild(b);
  });
  showDeptNote();

  $('seed-re').onclick = (e) => {
    e.preventDefault();
    seed = randomSeed();
    $('seed-show').value = seed;
  };
  $('seed-show').oninput = (e) => { seed = e.target.value.trim() || randomSeed(); };
  $('btn-start').onclick = start;
  $('btn-restart').onclick = () => { location.href = location.pathname; };

  /* 結果視窗的關閉方式:按繼續、點背景、或按 Esc。
   * 「繼續」按鈕每次開窗都會重建(結局畫面會換成別的按鈕),
   * 所以用事件委派綁在容器上,不要綁在按鈕本身。 */
  $('modal').onclick = (e) => {
    if (e.target.id === 'modal') closeModal();
    if (e.target.id === 'modal-ok') closeModal();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOpen()) closeModal();
    /* 視窗開著的時候,Enter 與空白鍵也當作「繼續」 */
    if ((e.key === 'Enter' || e.key === ' ') && modalOpen()) {
      e.preventDefault();
      closeModal();
    }
  });
}

function showDeptNote() {
  const d = DEPTS[chosenDept];
  const s = d.start;
  $('dept-note').innerHTML =
    `<div class="n1">${d.note}</div>`
    + `<div class="n2">入學能力　體力 ${s.sta}　學力 ${s.int}　肌力 ${s.str}　技巧力 ${s.skl}<br>`
    + `畢業門檻　學力 ${d.examInt[7]}　肌力 ${d.examStr[7]}</div>`;
}

function start() {
  const name = ($('in-name').value || '').trim() || '朱董';
  seed = ($('seed-show').value || '').trim() || randomSeed();
  /* 只覆寫 seed,其他參數原樣保留。
   * 先前是直接寫成 '?seed=xxx',會把網址上其他參數全部吃掉。 */
  const q = new URLSearchParams(location.search);
  q.set('seed', seed);
  history.replaceState(null, '', `?${q.toString()}`);

  game = createGame({ name, dept: chosenDept, seed });
  $('start').style.display = 'none';
  $('board').style.display = '';
  $('act').style.display = '';
  $('act-toggle').style.display = '';
  $('act-toggle').onclick = () => {
    const a = $('act');
    a.classList.toggle('collapsed');
    $('act-toggle').textContent = a.classList.contains('collapsed') ? '展 開' : '收 合';
  };
  lastRenderedLog = 0;
  refresh();
}

/* ================= 記分板 ================= */

function board() {
  const i = game.info();

  $('bd-name').textContent = i.name;
  $('bd-meta').textContent =
    `${i.dept}　${i.year} 年　${i.age} 歲　綜合 ${i.ovr}`;

  /* 狀態標記:健康狀況與風評,用文件上的註記樣式呈現 */
  const flags = [];
  if (i.std) flags.push(`<span class="flag bad">確診 ${i.stdName}</span>`);
  else if (i.immune) flags.push('<span class="flag good">已具免疫</span>');
  if (i.rep >= 24) flags.push('<span class="flag bad">風評不佳</span>');
  else if (i.rep >= 10) flags.push('<span class="flag note">已有風聲</span>');
  if (i.mentorFound) flags.push('<span class="flag note">已受指導</span>');
  $('bd-flags').innerHTML = flags.join('');

  $('bd-kills').textContent = i.kills;

  /* 八個學期的進度格:過去實心、當前紅框、未來留白 */
  const strip = $('semstrip');
  strip.innerHTML = SEMESTER_NAMES.map((n, idx) => {
    const num = idx + 1;
    let cls = '';
    if (i.over && !i.graduated && num === i.semester) cls = 'fail';
    else if (num < i.semester) cls = 'done';
    else if (num === i.semester && !i.over) cls = 'now';
    return `<span class="sem ${cls}">${n.replace('大', '')}</span>`;
  }).join('');

  /* 五個階段:當前那個標紅並加底線,比燈號好讀 */
  $('phaseline').innerHTML = PHASES.map((p) =>
    `<span class="ph ${p === i.phase && !i.over ? 'on' : ''}">${PHASE_NAMES[p]}</span>`).join('');

  /* 能力細線條。紅色三角刻度標示本學期期末門檻,達標轉綠 */
  const rows = $('abrows');
  rows.innerHTML = '';
  for (const k of ['sta', 'int', 'str', 'skl']) {
    const v = i.ab[k];
    const cap = i.pot[k];
    const w = Math.min(100, (v / Math.max(cap, 1)) * 100);

    let need = null;
    if (i.exam && k === 'int') need = i.exam.int;
    if (i.exam && k === 'str') need = i.exam.str;
    const short = need !== null && v < need;

    let tick = '';
    if (need !== null) {
      const tp = Math.min(100, (need / Math.max(cap, 1)) * 100);
      tick = `<span class="tick ${short ? '' : 'met'}" style="left:${tp}%" `
        + `title="本學期期末門檻 ${need}"></span>`;
    }

    rows.insertAdjacentHTML('beforeend',
      `<div class="ab ${short ? 'short' : ''}">`
      + `<span class="nm">${ABL[k]}</span>`
      + `<span class="track"><span class="fill" style="width:${w}%"></span>${tick}</span>`
      + `<span class="val">${v}<s>/${cap}</s></span></div>`);
  }
}

/* ================= 紀錄卡片 ================= */

const EFFECT_NAMES = {
  ...ABL, enc: '邂逅機會', rep: '校內風評', risk: '意外風險',
  slot: '社交場次', kill: '人斬',
};

function effectLine(applied) {
  if (!applied || applied.length === 0) return '';
  const parts = applied.map((a) => {
    const n = EFFECT_NAMES[a.key] || a.key;
    const v = a.actual !== undefined ? a.actual : a.amount;
    if (v === 0) return `${n} 沒有變化`;
    /* 風評與風險上升是壞事,顯示顏色要反過來 */
    const inverted = a.key === 'rep' || a.key === 'risk';
    const good = inverted ? v < 0 : v > 0;
    return `<span class="${good ? 'up' : 'dn'}">${n} ${v > 0 ? '+' : ''}${v}</span>`;
  });
  return `<div class="eff">${parts.join('　')}</div>`;
}

function logTarget(entry) {
  const key = `${entry.semester}`;
  if (curBlockKey !== key) {
    /* 收合前一個學期區塊 */
    if (curBlock) curBlock.classList.add('collapsed');
    const block = document.createElement('div');
    block.className = 'yr-block';
    block.innerHTML =
      `<div class="yr-head">${entry.semesterName}　${SEMESTER_NAMES[entry.semester - 1] ? '' : ''}</div>` +
      `<div class="yr-body"></div>`;
    block.querySelector('.yr-head').onclick = () => block.classList.toggle('collapsed');
    $('log').appendChild(block);
    curBlock = block;
    curBlockKey = key;

    /* 只保留最近幾個區塊,釋放 DOM */
    const blocks = $('log').querySelectorAll('.yr-block');
    if (blocks.length > 4) blocks[0].remove();
  }
  return curBlock.querySelector('.yr-body');
}

/* 把一則紀錄做成卡片元素。紀錄區與結果視窗共用同一份呈現邏輯,
 * 這樣兩邊看到的內容永遠一致,不會有一邊漏顯示效果明細的情況。 */
function makeCard(e) {
  const card = document.createElement('div');
  card.className = `card ${e.kind || ''}`;
  let html = `<h4>${e.title}</h4><p>${e.text}</p>`;
  html += effectLine(e.applied);
  /* 對象清單改成左右對齊的表格列:左邊姓名、右邊成功率與結果,
   * 比一整行文字好掃視 */
  if (e.detail && e.detail.length) {
    html += `<div class="det">${e.detail.map((d) => {
      const ok = d.ok;
      return `<span class="row ${ok ? 'ok' : ''}">`
        + `<b>${d.name}</b>`
        + `<span>${d.rate}%　${ok ? '成立' : '未成立'}</span></span>`;
    }).join('')}</div>`;
  }
  card.innerHTML = html;
  return card;
}

function renderLog() {
  const log = game.state.log;
  for (let i = lastRenderedLog; i < log.length; i++) {
    const e = log[i];
    logTarget(e).appendChild(makeCard(e));
  }
  lastRenderedLog = log.length;
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}

/* ================= 結果視窗 =================
 * 社交活動階段的底部面板有多達十一個按鈕,會把紀錄區擠出畫面,
 * 玩家選完之後看不到結果。所以在那個階段的行動結果改用視窗跳出來。 */

let modalOnClose = null;

function showModal(title, entries, onClose) {
  const body = $('modal-body');
  body.innerHTML = '';
  entries.forEach((e) => body.appendChild(makeCard(e)));
  $('modal-head').textContent = title;

  /* 結局畫面會把視窗底部換成重玩按鈕,所以一般結果視窗每次都要還原成「繼續」 */
  const foot = $('modal-foot');
  foot.innerHTML = '';
  const ok = document.createElement('button');
  ok.className = 'btn main';
  ok.id = 'modal-ok';
  ok.textContent = '繼續';
  ok.onclick = closeModal;
  foot.appendChild(ok);

  modalOnClose = onClose || null;
  $('modal').classList.add('on');
  body.scrollTop = 0;
}

function closeModal() {
  $('modal').classList.remove('on');
  const fn = modalOnClose;
  modalOnClose = null;
  if (fn) fn();
}

function modalOpen() {
  return $('modal').classList.contains('on');
}

/* 送出動作,並把這次新增的紀錄用視窗呈現。
 * 用於社交活動階段的所有行動:參加活動、就醫、老學長帶浪、特殊角色出手或收手。 */
function submitWithModal(action, title) {
  const before = game.state.log.length;
  game.submit(action);
  const added = game.state.log.slice(before);

  board();
  renderLog();
  /* renderAction 在遊戲結束時會把結局填進視窗 */
  renderAction();

  const over = game.pending.type === 'gameover';

  if (added.length === 0) return;

  /* 如果這個行動剛好結束了遊戲,兩個視窗要串接而不是互相覆蓋:
   * 先看這次行動的結果(例如那位讓你登出的對象發生了什麼),
   * 按繼續之後才看生涯總結。
   * 先前這裡直接呼叫 showModal,會把 renderAction 填好的結局內容蓋掉,
   * 玩家永遠看不到總結。 */
  showModal(title, added, over ? () => showEndingModal(game.pending.ending) : null);
}

/* ================= 操作區 ================= */

function actTitle(t) { return `<div class="title">${t}</div>`; }

function renderAction() {
  const p = game.pending;
  const act = $('act');
  act.innerHTML = '';

  if (!p) return;

  switch (p.type) {
    case 'dice': return renderDice(p);
    case 'event': return renderEvent(p);
    case 'activity': return renderActivity(p);
    case 'special': return renderSpecial(p);
    case 'midterm': return renderConfirm('期中考', '知道了，繼續');
    case 'exam': return renderConfirm('期末考', p.result.passed ? '過關，繼續' : '繼續');
    case 'accident': return renderConfirm('意外事件', '認了，繼續');
    case 'semesterWrap': return renderConfirm('本學期社交活動結束', '查看期末結果');
    case 'gameover': return renderEnding(p.ending);
    default: return renderConfirm('繼續', '繼續');
  }
}

function renderConfirm(title, label) {
  const act = $('act');
  act.innerHTML = actTitle(title);
  void 0;
  const b = document.createElement('button');
  b.className = 'btn main';
  b.textContent = label;
  b.onclick = () => { game.submit({}); refresh(); };
  act.appendChild(b);
}

/* ---------- 骰子分配 ---------- */

/* 點數在九宮格上的位置。用真正的骰子點陣而不是印數字,
 * 一眼就看得出幾點,也比數字更像骰子。 */
const PIP_LAYOUT = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function makePips(pip) {
  const frag = document.createDocumentFragment();
  (PIP_LAYOUT[pip] || [5]).forEach((cell) => {
    const dot = document.createElement('i');
    dot.className = `pc${cell}`;
    frag.appendChild(dot);
  });
  /* 螢幕閱讀器與純文字備援用的點數 */
  const txt = document.createElement('b');
  txt.textContent = pip;
  frag.appendChild(txt);
  return frag;
}

function renderDice(p) {
  const act = $('act');
  const dice = p.dice;
  const used = new Array(dice.length).fill(false);
  const assignments = [];
  let active = 0;

  function draw() {
    act.innerHTML = actTitle(
      `本 學 期 配 額　<b>${assignments.length} / ${dice.length}</b>`);
    const hint = document.createElement('div');
    hint.className = 'desc';
    hint.textContent = '先點一顆骰子，再選它要投到哪裡。';
    act.appendChild(hint);

    const row = document.createElement('div');
    row.id = 'dice';
    dice.forEach((pip, i) => {
      const d = document.createElement('div');
      d.className = `die${used[i] ? ' used' : ''}${i === active && !used[i] ? ' active' : ''}${pip === 6 ? ' six' : ''}`;
      d.appendChild(makePips(pip));
      d.setAttribute('aria-label', `${pip} 點`);
      if (!used[i]) d.onclick = () => { active = i; draw(); };
      row.appendChild(d);
    });
    act.appendChild(row);

    if (assignments.length === dice.length) {
      const go = document.createElement('button');
      go.className = 'btn main';
      go.textContent = '確定分配 ▸';
      go.onclick = () => { game.submit({ assignments }); refresh(); };
      act.appendChild(go);
      const undo = document.createElement('button');
      undo.className = 'btn';
      undo.textContent = '↺ 重新分配';
      undo.onclick = () => {
        assignments.length = 0;
        used.fill(false);
        active = 0;
        draw();
      };
      act.appendChild(undo);
      return;
    }

    const pip = dice[active];
    const info = game.info();
    const grid = document.createElement('div');
    grid.className = 'alloc';

    const opts = [
      { to: 'sta', label: `體力 +${pip}`, note: `目前 ${info.ab.sta}／上限 ${info.pot.sta}　場次來源` },
      { to: 'int', label: `學力 +${pip}`, note: `目前 ${info.ab.int}　期末需要 ${info.exam?.int ?? '—'}` },
      { to: 'str', label: `肌力 +${pip}`, note: `目前 ${info.ab.str}　期末需要 ${info.exam?.str ?? '—'}` },
      (() => {
        const gain = Math.floor(pip / CONFIG.slotPerDiceDiv);
        return {
          to: 'social',
          label: `社交場次 +${gain}`,
          note: gain === 0
            ? `${pip} 點換不到場次（每 ${CONFIG.slotPerDiceDiv} 點換 1 場）`
            : `每 ${CONFIG.slotPerDiceDiv} 點換 1 場`,
          disabled: gain === 0,
        };
      })(),
    ];

    opts.forEach((o) => {
      const b = document.createElement('button');
      b.className = `btn${o.to === 'social' ? ' stamp' : ''}`;
      b.innerHTML = `${o.label}<small>${o.note}</small>`;
      /* 一點的骰子換不到任何場次(除以二向下取整),
       * 這種情況要把選項鎖住,不能讓玩家點一個什麼都不會發生的按鈕 */
      if (o.disabled) b.disabled = true;
      b.onclick = () => {
        if (o.disabled) return;
        assignments.push({ die: active, to: o.to });
        used[active] = true;
        const next = used.findIndex((u) => !u);
        active = next === -1 ? active : next;
        draw();
      };
      grid.appendChild(b);
    });
    act.appendChild(grid);
  }

  draw();
}

/* ---------- 事件卡 ---------- */

function renderEvent(p) {
  const act = $('act');
  act.innerHTML = actTitle(`事 件 記 錄　${p.card.n}`);
  const d = document.createElement('p');
  d.className = 'desc';
  d.textContent = p.card.desc;
  act.appendChild(d);

  /* 顯示順序:全力一搏 → 照常執行 → 保守應對(與原型截圖一致) */
  const order = ['bold', 'normal', 'safe'];
  order.forEach((key) => {
    const o = p.options.find((x) => x.key === key);
    if (!o) return;
    const b = document.createElement('button');
    b.className = `btn${key === 'normal' ? ' main' : ''}${key === 'bold' ? ' warn' : ''}`;
    b.innerHTML = `${o.label}<small>成功率 ${o.rate}%｜加成／減益幅度 ±${o.mag}</small>`;
    b.onclick = () => { game.submit({ response: key }); refresh(); };
    act.appendChild(b);
  });
}

/* ---------- 社交活動 ---------- */

function renderActivity(p) {
  const act = $('act');
  const i = game.info();
  act.innerHTML = actTitle(
    `行 程 安 排　<b>剩餘 ${p.slotsLeft} 場</b>`
    + `　　風評 ${i.rep}　意外風險 ${i.accidentChance}%`);

  if (p.mentor?.available) {
    const b = document.createElement('button');
    b.className = 'btn stamp';
    b.innerHTML = `${p.mentor.session.n}<small>` +
      `技巧力 +${p.mentor.sklGain}｜消耗 ${p.mentor.cost} 場｜機會有限</small>`;
    b.onclick = () => submitWithModal({ mentor: true }, '老學長帶你出門');
    act.appendChild(b);
  }

  /* 帶病時的就醫選項 */
  if (p.cure?.available) {
    const b = document.createElement('button');
    b.className = 'btn warn';
    b.innerHTML = `就醫治療 ${p.cure.name}<small>` +
      `治癒率 ${p.cure.rate}%｜消耗 ${p.cure.cost} 場｜不治療每學期扣能力</small>`;
    b.onclick = () => submitWithModal({ cure: true }, '就醫結果');
    act.appendChild(b);
  } else if (p.cure?.incurable) {
    const note = document.createElement('div');
    note.style.cssText =
      'font-family:var(--num);font-size:11.5px;color:var(--fail);background:var(--stamp-soft);'
      + 'border:1px solid var(--fail);border-radius:2px;padding:6px 9px;margin-top:7px';
    note.textContent = `${p.cure.name}：無法治癒，每學期都會持續扣能力與風評。`;
    act.appendChild(note);
  }

  const DIFF_N = { low: '低', mid: '中', high: '高' };
  const RISK_N = { none: '無', low: '低', mid: '中', high: '高', extreme: '極高' };

  function venueButton(a) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.disabled = !a.available;
    b.innerHTML = `${a.name}<b>${a.enc} 人</b><small>` +
      (a.available
        ? `難度 ${DIFF_N[a.diff]}｜風險 ${RISK_N[a.risk]}`
        : a.lockReason) + `</small>`;
    if (a.available) {
      b.onclick = () => submitWithModal({ actId: a.id }, a.name);
    }
    return b;
  }

  /* 去得了的地點:兩欄排列 */
  const open = p.list.filter((a) => a.available);
  const locked = p.list.filter((a) => !a.available);

  const grid = document.createElement('div');
  grid.className = 'venues';
  open.forEach((a) => grid.appendChild(venueButton(a)));
  act.appendChild(grid);

  /* 去不了的地點:收進折疊區,預設收合。
   * 保留它們是因為那些門檻本身就是玩家的成長目標,看得到才知道要練什麼。 */
  if (locked.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'locked-wrap' + (lockedOpen ? ' open' : '');

    const head = document.createElement('div');
    head.className = 'locked-head';
    head.innerHTML = `<span>還去不了的地方（${locked.length}）</span>`;
    head.onclick = () => {
      lockedOpen = !lockedOpen;
      wrap.classList.toggle('open', lockedOpen);
    };
    wrap.appendChild(head);

    const lockedGrid = document.createElement('div');
    lockedGrid.className = 'venues';
    locked.forEach((a) => lockedGrid.appendChild(venueButton(a)));
    wrap.appendChild(lockedGrid);

    act.appendChild(wrap);
  }

  const skip = document.createElement('button');
  skip.className = 'btn warn';
  skip.innerHTML = '這學期不再出門<small>放棄剩餘場次，直接進入期末</small>';
  skip.onclick = () => { game.submit({ skip: true }); refresh(); };
  act.appendChild(skip);
}

/* ---------- 特殊角色的出手決策 ---------- */

function renderSpecial(p) {
  const act = $('act');
  const g = p.girl;
  const diffN = { low: '低', mid: '中', high: '高' }[g.diff] || g.diff;

  act.innerHTML = actTitle(
    `個 案 附 件${p.remaining > 0 ? `　<b>本場尚有 ${p.remaining} 件</b>` : ''}`);

  const box = document.createElement('div');
  box.id = 'dossier';
  box.innerHTML =
    `<div class="dn">${g.name}<span class="dt">${g.title}</span></div>`
    + `<div class="dd">${g.desc}</div>`
    + `<div class="dm"><span>難度 ${diffN}</span><span>成功率 ${p.rate}%</span></div>`;
  act.appendChild(box);

  const go = document.createElement('button');
  go.className = 'btn stamp';
  go.innerHTML = `出手<small>成功率 ${p.rate}%｜後果視對象而定</small>`;
  go.onclick = () => submitWithModal({ go: true }, `${g.name}・${g.title}`);
  act.appendChild(go);

  const no = document.createElement('button');
  no.className = 'btn';
  no.innerHTML = '收手<small>不計入人斬，也不會有後果。她之後不再出現</small>';
  no.onclick = () => submitWithModal({ go: false }, `${g.name}・${g.title}`);
  act.appendChild(no);
}

/* ---------- 結局 ---------- */

/* 建立結局卡。會做兩份:一份放進紀錄區供之後回看,一份放進視窗立刻呈現。
 * 之所以要用視窗:結局卡高約 800px,而結局畫面的記分板加操作區佔掉六百多,
 * 可視區間只剩兩百出頭,等於要捲四次才讀得完最重要的一頁。 */
function buildEndingCard(e) {
  const card = document.createElement('div');
  card.className = 'card gold';

  /* 歷任名單。
   *
   * 衝量玩法一局會接觸兩百多位對象,名冊用完之後補的都是隨機路人,
   * 如果全部列出來,有名有姓的角色會被路人淹沒(實測 49 人裡有 27 個路人)。
   * 所以人數多的時候只列出名冊上的角色,路人合併成一行。
   * 但人數少的時候(門檻見 config.namelistFullBelow)還是全部列出來——
   * 只斬到幾個人的玩家,每一個都值得留名字。 */
  const TIER_CLASS = { positive: 'g', negative: 'b', fatal: 'b' };
  const label = (c) => {
    const t = c.title ? `${c.name}<span class="x">（${c.title}）</span>` : c.name;
    const cls = TIER_CLASS[c.tier];
    return cls ? `<span class="${cls}">${t}</span>` : t;
  };

  const nl = composeNamelist(e.conquered);
  let names;
  if (nl.named.length === 0 && nl.strangers === 0) {
    names = '（一位都沒有）';
  } else {
    const parts = [];
    if (nl.named.length > 0) parts.push(nl.named.map(label).join('、'));
    if (nl.strangers > 0) {
      parts.push(`<span class="x">以及 ${nl.strangers} 位記不住名字的</span>`);
    }
    names = parts.join('，<br>');
  }

  const stdRow = e.std
    ? `<tr><td>健康狀況</td><td style="color:var(--fail)">${e.stdName}（帶病 ${e.stdSemesters} 學期）</td></tr>`
    : `<tr><td>健康狀況</td><td>${e.stdCured > 0 ? `曾感染，已治癒 ${e.stdCured} 次` : '沒有問題'}</td></tr>`;

  const fatalRow = e.fatalGirl
    ? `<tr><td>登出原因</td><td style="color:var(--fail)">${e.fatalGirl}</td></tr>` : '';

  card.innerHTML = `
    <div class="end-hero">
      <div class="tier">${e.headline}</div>
      <div class="num"><b>${e.kills}</b><span>生 涯 人 斬</span></div>
    </div>
    <p>${e.gradLine}</p>
    <table class="fin">
      <tr><th>項目</th><th>數值</th></tr>
      <tr><td>就讀學期</td><td>${e.semestersPlayed} / ${CONFIG.totalSemesters}</td></tr>
      <tr><td>體力</td><td>${e.ab.sta}</td></tr>
      <tr><td>學力</td><td>${e.ab.int}</td></tr>
      <tr><td>肌力</td><td>${e.ab.str}</td></tr>
      <tr><td>技巧力</td><td>${e.ab.skl}</td></tr>
      <tr><td>攻略嘗試</td><td>${e.stats.attempts} 次</td></tr>
      <tr><td>攻略成功率</td><td>${e.stats.successRate}%</td></tr>
      <tr><td>社交活動</td><td>${e.stats.activitiesDone} 場</td></tr>
      <tr><td>校內風評</td><td>${e.rep}</td></tr>
      <tr><td>老學長</td><td>${e.mentorFound ? '找到了' : '始終沒遇到'}</td></tr>
      ${stdRow}
      ${fatalRow}
    </table>
    <div class="namelist"><span class="h">名 單</span>${names}</div>
  `;
  return card;
}

function renderEnding(e) {
  const act = $('act');
  act.innerHTML = '';

  /* 一份留在紀錄區,一份放進視窗 */
  logTarget({ semester: game.state.semester, semesterName: '結局' })
    .appendChild(buildEndingCard(e));

  /* 底部操作區:關掉視窗之後還是要能重玩 */
  act.innerHTML = actTitle(`檔 案 編 號　<b>${game.seed}</b>`);
  act.appendChild(replayButton('main'));
  act.appendChild(sameSeedButton());

  showEndingModal(e);
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}

/* 結局用視窗全螢幕呈現,並把重玩按鈕直接放在視窗底部,
 * 玩家看完就能立刻再開一局,不用先關視窗再找按鈕。 */
function showEndingModal(e) {
  const box = $('modal-body');
  box.innerHTML = '';
  box.appendChild(buildEndingCard(e));
  $('modal-head').textContent = '結 案 報 告';

  const foot = $('modal-foot');
  foot.innerHTML = '';
  foot.appendChild(replayButton('main'));
  const close = document.createElement('button');
  close.className = 'btn';
  close.style.marginTop = '8px';
  close.textContent = '關閉，回頭翻紀錄';
  close.onclick = closeModal;
  foot.appendChild(close);

  modalOnClose = null;
  $('modal').classList.add('on');
  box.scrollTop = 0;
}

function replayButton(cls) {
  const b = document.createElement('button');
  b.className = `btn ${cls || ''}`;
  b.textContent = '重新建檔（換一個編號）';
  b.onclick = () => { location.href = location.pathname; };
  return b;
}

function sameSeedButton() {
  const b = document.createElement('button');
  b.className = 'btn';
  b.innerHTML = `用同一個編號重來<small>${game.seed}</small>`;
  b.onclick = () => {
    location.href = `${location.pathname}?seed=${encodeURIComponent(game.seed)}`;
  };
  return b;
}

/* ================= 主更新 ================= */

function refresh() {
  board();
  renderLog();
  renderAction();
}

buildStart();

/* 給瀏覽器主機測試用:暴露最小介面 */
window.__game = () => game;

/* ================= 本機開發用的自動推進 =================
 * 用途:視覺檢查。截圖工具會在呼叫時重新載入頁面,所以「先用程式驅動、再截圖」
 * 這條路不可靠;改成讓頁面在載入時就自己走到指定畫面,導航完直接截圖。
 *
 * 只在 localhost 生效,線上永遠不會觸發。
 * 用法:?auto=activity|special|exam|end&dept=LAW&seed=xxx
 */
(function devAutoPlay() {
  const local = ['127.0.0.1', 'localhost', ''].includes(location.hostname);
  const q = new URLSearchParams(location.search);
  const target = q.get('auto');
  if (!local || !target) return;

  const dept = q.get('dept') || 'ENG';
  $('in-name').value = q.get('name') || '朱董';
  const btn = [...$('seg-dept').children].find((b) => b.dataset.v === dept);
  if (btn) btn.click();
  $('btn-start').click();

  const modal = () => $('modal').classList.contains('on');
  const btns = () => [...$('act').querySelectorAll('button:not(:disabled)')];
  const pick = (kw) => btns().find((b) => b.textContent.includes(kw));

  let steps = 0;
  while (steps++ < 4000) {
    const p = game.pending;
    if (p.type === 'gameover') break;
    if (target === 'activity' && p.type === 'activity') break;
    if (target === 'special' && p.type === 'special') break;
    if (target === 'exam' && p.type === 'exam') break;

    if (modal()) {
      const ok = $('modal-ok');
      if (ok) { ok.click(); continue; }
      break;
    }

    if (p.type === 'dice') {
      for (let d = 0; d < p.dice.length; d++) {
        const opts = [...$('act').querySelectorAll('.alloc button:not(:disabled)')];
        const info = game.info();
        const th = info.exam;
        let want = '社交場次';
        if (info.ab.str < th.str + 5) want = '肌力';
        else if (info.ab.int < th.int + 5) want = '學力';
        (opts.find((b) => b.textContent.includes(want)) || opts[0]).click();
      }
      pick('確定分配')?.click();
    } else if (p.type === 'event') {
      (pick('保守應對') || btns()[0]).click();
    } else if (p.type === 'special') {
      (pick('出手') || btns()[0]).click();
    } else if (p.type === 'activity') {
      const t = btns().filter((b) => b.textContent.includes('人')).pop() || pick('帶浪');
      (t || pick('不再出門')).click();
    } else {
      btns()[0]?.click();
    }
  }
  window.scrollTo(0, 0);
}());
