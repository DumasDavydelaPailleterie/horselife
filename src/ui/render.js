/* 畫面渲染與互動 — 唯一會碰 DOM 的檔案
 * 邏輯全部來自 core/engine.js;這裡只負責顯示與收集玩家輸入。
 */

import { createGame } from '../core/engine.js';
import { CONFIG, PHASES, PHASE_NAMES, SEMESTER_NAMES, ABL } from '../data/config.js';
import { DEPTS, DEPT_KEYS } from '../data/depts.js';
import { randomSeed } from '../rng.js';
import { composeNamelist } from '../core/namelist.js';

const APP_VER = 'v0.1.0';
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
    `<b style="color:var(--chalk)">${d.note}</b><br>` +
    `起始 體力 ${s.sta}・學力 ${s.int}・肌力 ${s.str}・技巧力 ${s.skl}　｜　` +
    `畢業門檻 學力 ${d.examInt[7]}・肌力 ${d.examStr[7]}`;
}

function start() {
  const name = ($('in-name').value || '').trim() || '朱董';
  seed = ($('seed-show').value || '').trim() || randomSeed();
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);

  game = createGame({ name, dept: chosenDept, seed });
  $('start').style.display = 'none';
  $('board').style.display = '';
  $('act').style.display = '';
  $('act-toggle').style.display = '';
  $('act-toggle').onclick = () => {
    const a = $('act');
    a.classList.toggle('collapsed');
    $('act-toggle').textContent = a.classList.contains('collapsed') ? '⌃ 展開選項' : '⌄ 收合選項';
  };
  lastRenderedLog = 0;
  refresh();
}

/* ================= 記分板 ================= */

function board() {
  const i = game.info();
  const stdBadge = i.std
    ? `<small style="color:var(--bad);font-weight:700">${i.stdName}</small>`
    : (i.immune ? '<small style="color:var(--good);font-weight:700">免疫</small>' : '');
  $('bd-name').innerHTML = `${i.name}<small>${i.dept}</small>${stdBadge}`;
  $('bd-term').textContent = i.over ? '生涯結束' : `${i.semesterName}・${PHASE_NAMES[i.phase]}`;
  $('bd-age').textContent = i.age;
  $('bd-year').textContent = i.year;
  $('bd-ovr').textContent = i.ovr;
  $('bd-kills').textContent = i.kills;

  /* 能力條:紅色刻度標示本學期期末考門檻 */
  const rows = $('abrows');
  rows.innerHTML = '';
  for (const k of ['sta', 'int', 'str', 'skl']) {
    const v = i.ab[k], cap = i.pot[k];
    const pctW = Math.min(100, (v / Math.max(cap, 1)) * 100);
    let mark = '';
    if (i.exam && (k === 'int' || k === 'str')) {
      const need = k === 'int' ? i.exam.int : i.exam.str;
      const mp = Math.min(100, (need / Math.max(cap, 1)) * 100);
      const short = v < need;
      mark = `<em style="left:${mp}%;${short ? '' : 'background:#8fd08faa'}" title="期末門檻 ${need}"></em>`;
    }
    const short = i.exam && ((k === 'int' && v < i.exam.int) || (k === 'str' && v < i.exam.str));
    rows.insertAdjacentHTML('beforeend',
      `<div class="ab"><span class="nm">${ABL[k]}</span>` +
      `<span class="bar"><i style="width:${pctW}%"></i>${mark}</span>` +
      `<span class="val" ${short ? 'style="color:var(--bad)"' : ''}>${v}<s>/${cap}</s></span></div>`);
  }

  /* 階段燈 */
  const lamps = $('lamps');
  lamps.innerHTML = PHASES.map((p) =>
    `<span class="lamp ${p === i.phase && !i.over ? 'on' : ''}"><i></i>${PHASE_NAMES[p]}</span>`).join('');
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
  if (e.detail && e.detail.length) {
    html += `<div class="det">${e.detail.map((d) =>
      d.includes('→ 成功')
        ? `<span class="ok">${d}</span>` : d).join('<br>')}</div>`;
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
    case 'gameover': return renderEnding(p.ending);
    default: return renderConfirm('繼續', '繼續');
  }
}

function renderConfirm(title, label) {
  const act = $('act');
  act.innerHTML = actTitle(title);
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
      `分配訓練成果（${assignments.length}/${dice.length} 顆已分配）　點骰子選擇，再點下方去處`);

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
      {
        to: 'social',
        label: `社交場次 +${Math.floor(pip / CONFIG.slotPerDiceDiv)}`,
        note: `每 ${CONFIG.slotPerDiceDiv} 點換 1 場`,
      },
    ];

    opts.forEach((o) => {
      const b = document.createElement('button');
      b.className = `btn${o.to === 'social' ? ' gold' : ''}`;
      b.innerHTML = `${o.label}<small>${o.note}</small>`;
      b.onclick = () => {
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
  act.innerHTML = actTitle(`事件｜${p.card.n}　—　你要怎麼應對？`);
  const d = document.createElement('p');
  d.style.cssText = 'font-size:13px;color:var(--dim);margin-bottom:6px';
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
    `社交活動　剩餘場次 <span class="hl">${p.slotsLeft}</span>　` +
    `風評 ${i.rep}　意外風險 ${i.accidentChance}%`);

  if (p.mentor?.available) {
    const b = document.createElement('button');
    b.className = 'btn gold';
    b.innerHTML = `🍺 ${p.mentor.session.n}<small>` +
      `技巧力 +${p.mentor.sklGain}　消耗 ${p.mentor.cost} 場次　（機會有限）</small>`;
    b.onclick = () => submitWithModal({ mentor: true }, '老學長帶你出門');
    act.appendChild(b);
  }

  /* 帶病時的就醫選項 */
  if (p.cure?.available) {
    const b = document.createElement('button');
    b.className = 'btn warn';
    b.innerHTML = `🏥 就醫治療 ${p.cure.name}<small>` +
      `治癒率 ${p.cure.rate}%　消耗 ${p.cure.cost} 場次　不治療每學期都會扣能力</small>`;
    b.onclick = () => submitWithModal({ cure: true }, '就醫結果');
    act.appendChild(b);
  } else if (p.cure?.incurable) {
    const note = document.createElement('div');
    note.style.cssText =
      'font-size:12px;color:var(--bad);background:#2a1414;border:1px solid #6a3c3c;' +
      'border-radius:8px;padding:6px 10px;margin-top:6px';
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
    `這一位不太一樣　${p.remaining > 0 ? `（今晚還有 ${p.remaining} 位）` : ''}`);

  const box = document.createElement('div');
  box.style.cssText =
    'background:#0d2115;border:1px solid var(--edge);border-radius:8px;' +
    'padding:10px 12px;margin-bottom:4px';
  box.innerHTML =
    `<div style="font-weight:900;font-size:16px">${g.name}` +
    `<span style="color:var(--amber);font-size:13px;font-weight:700;margin-left:8px">${g.title}</span></div>` +
    `<div style="font-size:13px;color:var(--dim);margin-top:5px;line-height:1.7">${g.desc}</div>` +
    `<div style="font-family:var(--mono);font-size:12px;color:var(--chalk);margin-top:7px">` +
    `難度 ${diffN}　成功率 ${p.rate}%</div>`;
  act.appendChild(box);

  const go = document.createElement('button');
  go.className = 'btn main';
  go.innerHTML = `出手<small>成功率 ${p.rate}%　結果好壞看她是誰</small>`;
  go.onclick = () => submitWithModal({ go: true }, `${g.name}・${g.title}`);
  act.appendChild(go);

  const no = document.createElement('button');
  no.className = 'btn';
  no.innerHTML = '收手<small>不算人斬，但也不會有後果。她今晚之後不會再出現</small>';
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
  const TIER_COLOR = {
    positive: 'var(--good)', negative: 'var(--bad)', fatal: 'var(--bad)',
  };
  const label = (c) => {
    const t = c.title ? `${c.name}<span style="opacity:.6">（${c.title}）</span>` : c.name;
    const col = TIER_COLOR[c.tier];
    return col ? `<span style="color:${col};font-weight:700">${t}</span>` : t;
  };

  const nl = composeNamelist(e.conquered);
  let names;
  if (nl.named.length === 0 && nl.strangers === 0) {
    names = '（一位都沒有）';
  } else {
    const parts = [];
    if (nl.named.length > 0) parts.push(nl.named.map(label).join('、'));
    if (nl.strangers > 0) {
      parts.push(`<span style="color:var(--dim)">以及 ${nl.strangers} 位記不住名字的</span>`);
    }
    names = parts.join('，<br>');
  }

  const stdRow = e.std
    ? `<tr><td>健康狀況</td><td style="color:var(--bad)">${e.stdName}（帶病 ${e.stdSemesters} 學期）</td></tr>`
    : `<tr><td>健康狀況</td><td>${e.stdCured > 0 ? `曾感染，已治癒 ${e.stdCured} 次` : '沒有問題'}</td></tr>`;

  const fatalRow = e.fatalGirl
    ? `<tr><td>登出原因</td><td style="color:var(--bad)">${e.fatalGirl}</td></tr>` : '';

  card.innerHTML = `
    <div class="end-hero">
      <div class="tier">${e.headline}</div>
      <div class="kills">${e.kills}<small>生涯人斬</small></div>
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
    <div class="namelist"><b style="color:var(--chalk)">歷任名單</b><br>${names}</div>
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
  act.innerHTML = actTitle(`世界種子　${game.seed}`);
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
  $('modal-head').textContent = '生涯總結';

  const foot = $('modal-foot');
  foot.innerHTML = '';
  foot.appendChild(replayButton('main'));
  const close = document.createElement('button');
  close.className = 'btn';
  close.style.marginTop = '8px';
  close.textContent = '關閉，回頭看紀錄';
  close.onclick = closeModal;
  foot.appendChild(close);

  modalOnClose = null;
  $('modal').classList.add('on');
  box.scrollTop = 0;
}

function replayButton(cls) {
  const b = document.createElement('button');
  b.className = `btn ${cls || ''}`;
  b.textContent = '↺ 再玩一次（換一個種子）';
  b.onclick = () => { location.href = location.pathname; };
  return b;
}

function sameSeedButton() {
  const b = document.createElement('button');
  b.className = 'btn';
  b.innerHTML = `用同一顆種子重來<small>${game.seed}</small>`;
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
