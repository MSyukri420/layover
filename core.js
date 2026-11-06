'use strict';
/* Shared helpers and the mode runner. Each mode registers with reg() and draws into ctx.root. */
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const store = {
  get(k, fallback) {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
    catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* play continues unsaved */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
};
const rint = (n, r = Math.random) => Math.floor(r() * n);
const pick = (a, r = Math.random) => a[rint(a.length, r)];
function shuffle(a, r = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(i + 1, r);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Word lists: built on first use so the menu opens instantly. */
const sets = {};
function wordSet(n) {
  if (!sets[n]) {
    sets[n] = new Set(A[n] || []);
    const s = W[n] || '';
    for (let i = 0; i < s.length; i += n) sets[n].add(s.slice(i, i + n));
  }
  return sets[n];
}
const isWord = w => wordSet(w.length).has(w);
let longWords;
function allWords() {
  if (!longWords) { longWords = []; for (let n = 4; n <= 8; n++) longWords.push(...wordSet(n)); }
  return longWords;
}
let prefixes;
function prefixSet() {
  if (!prefixes) {
    prefixes = new Set();
    for (const w of allWords()) for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
  }
  return prefixes;
}

/* Deal through a shuffled deck so answers don't repeat until all are used. */
function deal(key, list) {
  let deck = store.get(key, []);
  if (!deck.length || deck.some(i => i >= list.length)) deck = shuffle(list.map((_, i) => i));
  const i = deck.pop();
  store.set(key, deck);
  return list[i];
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
}

const QWERTY = ['qwertyuiop', ' asdfghjkl ', '>zxcvbnm<'];
function keyboard(parent, press, layout = QWERTY, cls = '') {
  const kb = el('div', 'keyboard ' + cls);
  for (const line of layout) {
    const row = el('div', 'key-row');
    for (const ch of line) {
      if (ch === ' ') { row.append(el('span', 'spacer')); continue; }
      const b = el('button', 'key', ch === '>' ? 'Enter' : ch === '<' ? '⌫' : ch);
      b.type = 'button';
      b.dataset.key = ch === '>' ? 'enter' : ch === '<' ? 'back' : ch;
      if (ch === '>') b.classList.add('wide');
      if (ch === '<') { b.classList.add('wide', 'delete'); b.setAttribute('aria-label', 'Delete'); }
      row.append(b);
    }
    kb.append(row);
  }
  kb.addEventListener('click', e => {
    const b = e.target.closest('.key');
    if (b) press(b.dataset.key);
  });
  parent.append(kb);
  return {
    paint(map) {
      kb.querySelectorAll('.key').forEach(k => {
        k.classList.remove('correct', 'present', 'absent', 'hint');
        if (map[k.dataset.key]) k.classList.add(map[k.dataset.key]);
      });
    },
  };
}

/* A typed word line above a keyboard. */
function typer(ctx, parent, opts) {
  let cur = '';
  const line = el('div', 'line');
  parent.append(line);
  const paint = () => {
    line.textContent = cur || ' ';
    if (opts.change) opts.change(cur);
  };
  const press = k => {
    if (ctx.ended) return;
    if (k === 'enter') { if (cur) opts.enter(cur); return; }
    if (k === 'back') cur = cur.slice(0, -1);
    else if (/^[a-z]$/.test(k) && cur.length < opts.max) cur += k;
    else return;
    paint();
  };
  paint();
  ctx.keys = press;
  keyboard(parent, press);
  return { clear() { cur = ''; paint(); } };
}

/* A square grid of cells. */
function makeGrid(parent, n, draw) {
  const fit = el('div', 'fit');
  const grid = el('div', 'grid');
  grid.style.setProperty('--n', n);
  const cells = [];
  for (let r = 0; r < n; r++) {
    cells.push([]);
    for (let c = 0; c < n; c++) {
      const d = el('div', 'cell');
      d.dataset.r = r;
      d.dataset.c = c;
      if (draw) draw(d, r, c);
      cells[r].push(d);
      grid.append(d);
    }
  }
  fit.append(grid);
  parent.append(fit);
  return { grid, cells };
}

/* Tracks a finger across cells. elementFromPoint keeps working during touch capture. */
function dragCells(g, h) {
  let on = false;
  const at = e => {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const d = t && t.closest && t.closest('[data-r]');
    return d && g.contains(d) ? [+d.dataset.r, +d.dataset.c] : null;
  };
  g.addEventListener('pointerdown', e => {
    const p = at(e);
    if (!p) return;
    e.preventDefault();
    on = true;
    h.start(p[0], p[1]);
  });
  g.addEventListener('pointermove', e => {
    if (!on) return;
    const p = at(e);
    if (p) h.move(p[0], p[1]);
  });
  const stop = () => {
    if (on && h.end) h.end();
    on = false;
  };
  g.addEventListener('pointerup', stop);
  g.addEventListener('pointercancel', stop);
}

/* Mode registry and runner */
const Modes = new Map();
const reg = m => Modes.set(m.id, m);
let ctxNow = null;

const statKey = id => 'layover.stats.' + id;
const blankStats = () => ({ played: 0, won: 0, streak: 0, best: 0, top: 0, dist: {} });
const readStats = id => ({ ...blankStats(), ...store.get(statKey(id), {}) });

function record(id, o) {
  const s = readStats(id);
  s.played++;
  if (o.won) {
    s.won++;
    s.streak++;
    s.best = Math.max(s.best, s.streak);
    if (o.guesses) s.dist[o.guesses] = (s.dist[o.guesses] || 0) + 1;
  } else s.streak = 0;
  if (o.score != null) s.top = Math.max(s.top, o.score);
  store.set(statKey(id), s);
}

function leave() {
  if (!ctxNow) return;
  ctxNow.stop();
  $('toast').classList.remove('show');
  ctxNow = null;
}

function openMode(id, fresh) {
  leave();
  const m = Modes.get(id);
  const key = 'layover.game.' + id;
  const ctx = {
    id,
    root: $('view'),
    saved: fresh ? null : store.get(key, null),
    ended: false,
    keys: null,
    timers: [],
    save(s) { if (!ctx.ended) store.set(key, s); },
    every(fn, ms) { const t = setInterval(fn, ms); ctx.timers.push(t); return t; },
    stop() { ctx.timers.forEach(clearInterval); ctx.timers = []; ctx.keys = null; },
    finish(o) {
      if (ctx.ended) return;
      if (o.keep) store.set(key, o.keep); else store.del(key);
      ctx.ended = true;
      ctx.stop();
      if (o.record !== false) record(id, o);
      setTimeout(() => {
        if (ctxNow !== ctx) return;
        $('resultTitle').textContent = o.title;
        $('resultWord').textContent = o.word ?? '';
        $('nextBtn').hidden = !!o.keep;
        $('result').hidden = false;
      }, o.delay ?? 300);
    },
  };
  ctxNow = ctx;
  ctx.root.replaceChildren();
  $('result').hidden = true;
  $('home').hidden = true;
  $('screen').hidden = false;
  $('title').textContent = m.name;
  paintFav(id);
  $('clueBtn').hidden = true;
  $('clueBtn').classList.remove('used');
  m.run(ctx);
  if (!store.get('layover.seen.' + id, false)) {
    store.set('layover.seen.' + id, true);
    showHelp();
  }
}

function showHelp() {
  const m = ctxNow && [...Modes.values()].find(x => x.name === $('title').textContent);
  if (!m) return;
  $('helpTitle').textContent = m.name;
  $('helpBody').replaceChildren(...m.help.map(t => el('p', '', t)));
  $('helpDlg').showModal();
}

function showStats() {
  const m = [...Modes.values()].find(x => x.name === $('title').textContent);
  const s = readStats(m.id);
  $('statsTitle').textContent = m.name;
  const pct = s.played ? Math.round(s.won / s.played * 100) : 0;
  const cells = [[s.played, 'Played'], [pct + '%', 'Won'], [s.streak, 'Streak'],
    m.scored ? [s.top, 'Top score'] : [s.best, 'Best streak']];
  $('statRow').replaceChildren(...cells.map(([v, l]) => {
    const d = el('div');
    d.append(el('b', '', v), el('span', '', l));
    return d;
  }));
  const keys = Object.keys(s.dist).map(Number).sort((a, b) => a - b);
  const max = Math.max(1, ...Object.values(s.dist));
  $('dist').replaceChildren(...keys.map(k => {
    const row = el('div', 'bar-row');
    const bar = el('div', 'bar', s.dist[k]);
    bar.style.width = Math.max(8, s.dist[k] / max * 88) + '%';
    row.append(el('span', '', k), bar);
    return row;
  }));
  $('statsDlg').showModal();
}
