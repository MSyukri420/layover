'use strict';
const GROUP_LOGIC = 'Logic puzzles';
const newBtns = (parent, ...labels) => {
  const row = el('div', 'row-btns');
  const out = labels.map(t => { const b = el('button', 'btn', t); row.append(b); return b; });
  parent.append(row);
  return out;
};

/* Sudoku, 9x9 and 6x6 */
const peersCache = {};
function peers(n) {
  if (peersCache[n]) return peersCache[n];
  const [br, bc] = n === 9 ? [3, 3] : [2, 3];
  const out = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n, set = new Set();
    for (let k = 0; k < n; k++) { set.add(r * n + k); set.add(k * n + c); }
    const r0 = r - r % br, c0 = c - c % bc;
    for (let a = 0; a < br; a++) for (let b = 0; b < bc; b++) set.add((r0 + a) * n + c0 + b);
    set.delete(i);
    out.push([...set]);
  }
  return (peersCache[n] = out);
}
function solveCount(g, n, limit, random) {
  const P = peers(n);
  let best = -1, opts = null;
  for (let i = 0; i < g.length; i++) {
    if (g[i]) continue;
    const used = new Set(P[i].map(p => g[p]));
    const o = [];
    for (let v = 1; v <= n; v++) if (!used.has(v)) o.push(v);
    if (!o.length) return 0;
    if (!opts || o.length < opts.length) { best = i; opts = o; if (o.length === 1) break; }
  }
  if (best < 0) { solveCount.sol = g.slice(); return 1; }
  let c = 0;
  for (const v of random ? shuffle(opts) : opts) {
    g[best] = v;
    c += solveCount(g, n, limit - c, random);
    g[best] = 0;
    if (c >= limit) break;
  }
  return c;
}
function sudokuPuzzle(n) {
  solveCount(Array(n * n).fill(0), n, 1, true);
  const sol = solveCount.sol.slice();
  const g = sol.slice();
  const target = n === 9 ? 50 : 20;
  let removed = 0;
  for (const i of shuffle(g.map((_, k) => k))) {
    if (removed >= target) break;
    const v = g[i];
    g[i] = 0;
    if (solveCount(g.slice(), n, 2, false) === 1) removed++;
    else g[i] = v;
  }
  return { n, given: g.slice(), user: g, sol };
}
function sudokuMode(id, n, name, blurb) {
  reg({
    id, group: GROUP_LOGIC, name, blurb,
    help: [`Fill every row, column and box with 1 to ${n}, with no repeats. Tap a square, then tap a number. Clashes show in red.`],
    run(ctx) {
      const s = ctx.saved || sudokuPuzzle(n);
      const [br, bc] = n === 9 ? [3, 3] : [2, 3];
      let sel = -1;
      const { grid, cells } = makeGrid(ctx.root, n, (d, r, c) => {
        if ((c + 1) % bc === 0 && c < n - 1) d.classList.add('b-r');
        if ((r + 1) % br === 0 && r < n - 1) d.classList.add('b-b');
      });
      const flat = cells.flat();
      const pad = el('div', 'numpad');
      pad.style.setProperty('--n', n + 1);
      for (let v = 1; v <= n + 1; v++) {
        const b = el('button', 'key', v > n ? '⌫' : v);
        b.onclick = () => put(v > n ? 0 : v);
        pad.append(b);
      }
      ctx.root.append(pad);
      function paint() {
        const P = peers(n);
        flat.forEach((d, i) => {
          const v = s.user[i];
          d.textContent = v || '';
          d.classList.toggle('given', !!s.given[i]);
          d.classList.toggle('sel', i === sel);
          d.classList.toggle('peer', sel >= 0 && P[sel].includes(i));
          d.classList.toggle('bad', !!v && !s.given[i] && P[i].some(p => s.user[p] === v));
        });
      }
      function put(v) {
        if (ctx.ended || sel < 0 || s.given[sel]) return;
        s.user[sel] = v;
        ctx.save(s);
        paint();
        if (s.user.every((x, i) => x === s.sol[i])) ctx.finish({ won: true, title: 'Grid complete', word: 'Solved' });
      }
      grid.addEventListener('click', e => {
        const d = e.target.closest('.cell');
        if (d) { sel = +d.dataset.r * n + +d.dataset.c; paint(); }
      });
      ctx.keys = k => { if (/^[1-9]$/.test(k) && +k <= n) put(+k); else if (k === 'back') put(0); };
      paint();
    },
  });
}
sudokuMode('sudoku', 9, 'Sudoku', 'The classic 9×9 number grid');
sudokuMode('mini', 6, 'Mini Sudoku', 'A quick 6×6 number grid');

/* Minefield */
reg({
  id: 'mines', group: GROUP_LOGIC, name: 'Minefield', blurb: 'Clear the 9×9 board without a blast',
  help: ['Tap to open a square. Numbers count the mines touching that square. Switch to Flag to mark a mine. Your first tap is always safe.'],
  run(ctx) {
    const n = 9, count = 10;
    const s = ctx.saved || { mines: null, open: [], flags: [] };
    let flagMode = false;
    const top = el('div', 'bar-top');
    ctx.root.append(top);
    const { grid, cells } = makeGrid(ctx.root, n);
    const [modeBtn] = newBtns(ctx.root, 'Mode: Open');
    grid.classList.add('mines');
    const nbrs = i => {
      const r = Math.floor(i / n), c = i % n, out = [];
      for (let a = r - 1; a <= r + 1; a++) {
        for (let b = c - 1; b <= c + 1; b++) {
          if (a >= 0 && b >= 0 && a < n && b < n && a * n + b !== i) out.push(a * n + b);
        }
      }
      return out;
    };
    const nearby = i => nbrs(i).filter(x => s.mines.includes(x)).length;
    function paint(reveal) {
      top.textContent = `Mines left: ${count - s.flags.length}`;
      cells.flat().forEach((d, i) => {
        const open = s.open.includes(i), mine = reveal && s.mines && s.mines.includes(i);
        d.className = 'cell' + (open ? ' open' : '') + (mine ? ' mine' : '');
        d.textContent = mine ? '✹' : open ? (nearby(i) || '') : s.flags.includes(i) ? '⚑' : '';
      });
    }
    function open(i) {
      const stack = [i];
      while (stack.length) {
        const x = stack.pop();
        if (s.open.includes(x)) continue;
        s.open.push(x);
        s.flags = s.flags.filter(f => f !== x);
        if (!nearby(x)) stack.push(...nbrs(x));
      }
    }
    grid.addEventListener('click', e => {
      const d = e.target.closest('.cell');
      if (!d || ctx.ended) return;
      const i = +d.dataset.r * n + +d.dataset.c;
      if (s.open.includes(i)) return;
      if (flagMode) {
        s.flags = s.flags.includes(i) ? s.flags.filter(f => f !== i) : [...s.flags, i];
      } else {
        if (s.flags.includes(i)) return;
        if (!s.mines) {
          const safe = new Set([i, ...nbrs(i)]);
          s.mines = shuffle([...Array(n * n).keys()].filter(x => !safe.has(x))).slice(0, count);
        }
        if (s.mines.includes(i)) {
          paint(true);
          return ctx.finish({ won: false, title: 'Boom', word: 'You hit a mine', delay: 500 });
        }
        open(i);
      }
      ctx.save(s);
      paint();
      if (s.open.length === n * n - count) ctx.finish({ won: true, title: 'Board cleared', word: 'All safe' });
    });
    modeBtn.onclick = () => {
      flagMode = !flagMode;
      modeBtn.textContent = flagMode ? 'Mode: Flag' : 'Mode: Open';
      modeBtn.classList.toggle('on', flagMode);
    };
    paint();
  },
});

/* Picture Grid (nonogram) */
const lineClue = bits => bits.join('').split(/0+/).filter(Boolean).map(x => x.length);
function lineOptions(clue, n) {
  const out = [];
  const place = (i, pos, mask) => {
    if (i === clue.length) { out.push(mask); return; }
    const rest = clue.slice(i + 1).reduce((a, b) => a + b + 1, 0);
    for (let p = pos; p + clue[i] + rest <= n; p++) {
      place(i + 1, p + clue[i] + 1, mask | (((1 << clue[i]) - 1) << p));
    }
  };
  place(0, 0, 0);
  return out;
}
function lineSolvable(rows, cols, n) {
  const ro = rows.map(c => lineOptions(c, n)), co = cols.map(c => lineOptions(c, n));
  const on = Array(n).fill(0), off = Array(n).fill(0); // by row, bit = column
  const full = (1 << n) - 1;
  for (let changed = true; changed;) {
    changed = false;
    for (let r = 0; r < n; r++) {
      ro[r] = ro[r].filter(m => (m & on[r]) === on[r] && (m & off[r]) === 0);
      if (!ro[r].length) return false;
      const all = ro[r].reduce((a, b) => a & b, full), any = ro[r].reduce((a, b) => a | b, 0);
      const a2 = on[r] | all, b2 = off[r] | (full & ~any);
      if (a2 !== on[r] || b2 !== off[r]) { on[r] = a2; off[r] = b2; changed = true; }
    }
    for (let c = 0; c < n; c++) {
      let con = 0, coff = 0;
      for (let r = 0; r < n; r++) {
        if (on[r] >> c & 1) con |= 1 << r;
        if (off[r] >> c & 1) coff |= 1 << r;
      }
      co[c] = co[c].filter(m => (m & con) === con && (m & coff) === 0);
      if (!co[c].length) return false;
      const all = co[c].reduce((a, b) => a & b, full), any = co[c].reduce((a, b) => a | b, 0);
      for (let r = 0; r < n; r++) {
        if ((all >> r & 1) && !(on[r] >> c & 1)) { on[r] |= 1 << c; changed = true; }
        if (!(any >> r & 1) && !(off[r] >> c & 1)) { off[r] |= 1 << c; changed = true; }
      }
    }
  }
  return on.every((m, r) => (m | off[r]) === full);
}
function picturePuzzle() {
  const n = 10;
  let rows, cols;
  for (let i = 0; i < 400; i++) {
    const half = Array.from({ length: n }, () => Array.from({ length: n / 2 }, () => (Math.random() < 0.62 ? 1 : 0)));
    const g = half.map(r => [...r, ...r.slice().reverse()]);
    rows = g.map(lineClue);
    cols = g[0].map((_, c) => lineClue(g.map(r => r[c])));
    if (lineSolvable(rows, cols, n)) break;
  }
  return { n, rows, cols, marks: Array(n * n).fill(0) };
}
reg({
  id: 'picture', group: GROUP_LOGIC, name: 'Picture Grid', blurb: 'Fill squares from the number clues',
  help: ['Numbers show runs of filled squares in each row and column, in order, with at least one gap between runs. Tap or drag to fill. Switch to Mark to cross out squares you know are empty.'],
  run(ctx) {
    const s = ctx.saved || picturePuzzle(), n = s.n;
    const fit = el('div', 'fit');
    const nono = el('div', 'nono');
    nono.append(el('div'));
    s.cols.forEach(c => {
      const d = el('div', 'clue col');
      (c.length ? c : [0]).forEach(v => d.append(el('span', '', v)));
      nono.append(d);
    });
    const cells = [];
    for (let r = 0; r < n; r++) {
      const d = el('div', 'clue');
      (s.rows[r].length ? s.rows[r] : [0]).forEach(v => d.append(el('span', '', v)));
      nono.append(d);
      for (let c = 0; c < n; c++) {
        const x = el('div', 'cell');
        x.dataset.r = r;
        x.dataset.c = c;
        if (c === 4) x.classList.add('m-r');
        if (r === 4) x.classList.add('m-b');
        cells.push(x);
        nono.append(x);
      }
    }
    fit.append(nono);
    ctx.root.append(fit);
    let tool = 1, paintVal = 0;
    const [toolBtn] = newBtns(ctx.root, 'Tool: Fill');
    const paint = () => cells.forEach((d, i) => {
      d.classList.toggle('fill', s.marks[i] === 1);
      d.classList.toggle('x', s.marks[i] === 2);
      d.textContent = s.marks[i] === 2 ? '×' : '';
    });
    const done = () => {
      const bit = (r, c) => (s.marks[r * n + c] === 1 ? 1 : 0);
      const same = (a, b) => a.join() === b.join();
      for (let r = 0; r < n; r++) if (!same(lineClue(Array.from({ length: n }, (_, c) => bit(r, c))), s.rows[r])) return false;
      for (let c = 0; c < n; c++) if (!same(lineClue(Array.from({ length: n }, (_, r) => bit(r, c))), s.cols[c])) return false;
      return true;
    };
    dragCells(nono, {
      start(r, c) {
        if (ctx.ended) return;
        const i = r * n + c;
        paintVal = s.marks[i] === tool ? 0 : tool;
        s.marks[i] = paintVal;
        paint();
      },
      move(r, c) { if (!ctx.ended) { s.marks[r * n + c] = paintVal; paint(); } },
      end() {
        ctx.save(s);
        if (done()) ctx.finish({ won: true, title: 'Picture complete', word: 'Solved', delay: 500 });
      },
    });
    toolBtn.onclick = () => {
      tool = tool === 1 ? 2 : 1;
      toolBtn.textContent = tool === 1 ? 'Tool: Fill' : 'Tool: Mark';
      toolBtn.classList.toggle('on', tool === 2);
    };
    paint();
  },
});

/* Balance (binary grid) */
function balanceOk(g, n, i) {
  const r = Math.floor(i / n), c = i % n, v = g[i];
  const row = Array.from({ length: n }, (_, k) => g[r * n + k]);
  const col = Array.from({ length: n }, (_, k) => g[k * n + c]);
  for (const line of [row, col]) {
    if (line.filter(x => x === v).length > n / 2) return false;
    for (let k = 0; k + 2 < n; k++) if (line[k] && line[k] === line[k + 1] && line[k] === line[k + 2]) return false;
  }
  return true;
}
function balanceCount(g, n, limit, random, i = 0) {
  while (i < g.length && g[i]) i++;
  if (i === g.length) { balanceCount.sol = g.slice(); return 1; }
  let c = 0;
  for (const v of random ? shuffle([1, 2]) : [1, 2]) {
    g[i] = v;
    if (balanceOk(g, n, i)) c += balanceCount(g, n, limit - c, random, i + 1);
    g[i] = 0;
    if (c >= limit) break;
  }
  return c;
}
function balancePuzzle() {
  const n = 6;
  balanceCount(Array(n * n).fill(0), n, 1, true);
  const sol = balanceCount.sol.slice(), g = sol.slice();
  for (const i of shuffle(g.map((_, k) => k))) {
    const v = g[i];
    g[i] = 0;
    if (balanceCount(g.slice(), n, 2, false) !== 1) g[i] = v;
  }
  return { n, given: g.slice(), user: g, sol };
}
reg({
  id: 'balance', group: GROUP_LOGIC, name: 'Balance', blurb: 'Even out suns and rings on a 6×6 grid',
  help: ['Fill every square with a sun or a ring. Each row and column needs three of each, and no three in a line may match. Tap to cycle a square.'],
  run(ctx) {
    const s = ctx.saved || balancePuzzle(), n = s.n;
    const { grid, cells } = makeGrid(ctx.root, n);
    const flat = cells.flat();
    const paint = () => flat.forEach((d, i) => {
      const v = s.user[i];
      d.className = 'cell' + (s.given[i] ? ' given' : '') + (v === 1 ? ' sun' : v === 2 ? ' moon' : '');
      d.replaceChildren(...(v ? [el('i')] : []));
    });
    grid.addEventListener('click', e => {
      const d = e.target.closest('.cell');
      if (!d || ctx.ended) return;
      const i = +d.dataset.r * n + +d.dataset.c;
      if (s.given[i]) return;
      s.user[i] = (s.user[i] + 1) % 3;
      ctx.save(s);
      paint();
      if (s.user.every((v, k) => v === s.sol[k])) ctx.finish({ won: true, title: 'Perfectly balanced', word: 'Solved' });
    });
    paint();
  },
});

/* Rectangles (shikaku) */
function rectPuzzle() {
  const n = 6;
  const used = Array(n * n).fill(false);
  const clues = [];
  for (let i = 0; i < n * n; i++) {
    if (used[i]) continue;
    const r = Math.floor(i / n), c = i % n;
    const fits = [];
    for (let h = 1; h <= 4 && r + h <= n; h++) {
      for (let w = 1; w <= 4 && c + w <= n; w++) {
        if (h * w > 9) continue;
        let free = true;
        for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) if (used[(r + a) * n + c + b]) free = false;
        if (free) fits.push([h, w]);
      }
    }
    const big = fits.filter(([h, w]) => h * w >= 2);
    const [h, w] = pick(big.length ? big : fits);
    for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) used[(r + a) * n + c + b] = true;
    clues.push({ r: r + rint(h), c: c + rint(w), v: h * w });
  }
  return { n, clues, rects: [] };
}
reg({
  id: 'rects', group: GROUP_LOGIC, name: 'Rectangles', blurb: 'Split the grid into numbered boxes',
  help: ['Drag to draw rectangles until they cover the grid. Each rectangle holds exactly one number, and that number is its area. Tap a rectangle to remove it.'],
  run(ctx) {
    const s = ctx.saved || rectPuzzle(), n = s.n;
    const { grid, cells } = makeGrid(ctx.root, n);
    const HUES = [205, 35, 150, 280, 340, 90, 180, 15];
    let a = null, b = null;
    const inRect = (q, r, c) => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1;
    const box = () => ({ r0: Math.min(a[0], b[0]), r1: Math.max(a[0], b[0]), c0: Math.min(a[1], b[1]), c1: Math.max(a[1], b[1]) });
    function paint() {
      const live = a ? box() : null;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const d = cells[r][c];
          const clue = s.clues.find(q => q.r === r && q.c === c);
          d.textContent = clue ? clue.v : '';
          const i = s.rects.findIndex(q => inRect(q, r, c));
          const q = s.rects[i];
          d.classList.toggle('hit', !!live && inRect(live, r, c));
          d.style.background = '';
          d.style.boxShadow = '';
          if (q && !(live && inRect(live, r, c))) {
            d.style.background = `hsl(${HUES[i % HUES.length]} 45% 32%)`;
            const shadow = [];
            if (r === q.r0) shadow.push('inset 0 2px 0 #fff8');
            if (r === q.r1) shadow.push('inset 0 -2px 0 #fff8');
            if (c === q.c0) shadow.push('inset 2px 0 0 #fff8');
            if (c === q.c1) shadow.push('inset -2px 0 0 #fff8');
            d.style.boxShadow = shadow.join(',');
          }
        }
      }
    }
    const solved = () => {
      const area = s.rects.reduce((t, q) => t + (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1), 0);
      if (area !== n * n) return false;
      return s.rects.every(q => {
        const inside = s.clues.filter(k => inRect(q, k.r, k.c));
        return inside.length === 1 && inside[0].v === (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1);
      });
    };
    dragCells(grid, {
      start(r, c) { if (ctx.ended) return; a = [r, c]; b = [r, c]; paint(); },
      move(r, c) { if (a) { b = [r, c]; paint(); } },
      end() {
        if (!a) return;
        const q = box();
        const tapOnly = a[0] === b[0] && a[1] === b[1];
        const under = s.rects.findIndex(x => inRect(x, a[0], a[1]));
        a = null;
        if (tapOnly && under >= 0) s.rects.splice(under, 1);
        else {
          s.rects = s.rects.filter(x => x.r0 > q.r1 || x.r1 < q.r0 || x.c0 > q.c1 || x.c1 < q.c0);
          s.rects.push(q);
        }
        ctx.save(s);
        paint();
        if (solved()) ctx.finish({ won: true, title: 'Every box fits', word: 'Solved' });
      },
    });
    paint();
  },
});

/* One Line */
function linePuzzle() {
  const n = 6;
  let path = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push([r, r % 2 ? n - 1 - c : c]);
  for (let i = 0; i < n * n * 30; i++) {
    if (rint(2)) path.reverse();
    const [hr, hc] = path.at(-1);
    const nb = pick([[hr + 1, hc], [hr - 1, hc], [hr, hc + 1], [hr, hc - 1]]);
    const k = path.findIndex(p => p[0] === nb[0] && p[1] === nb[1]);
    if (k >= 0 && k < path.length - 2) path = [...path.slice(0, k + 1), ...path.slice(k + 1).reverse()];
  }
  /* Start loose, then rule out each rival route with a wall or a new number until one route is left. */
  const id = ([r, c]) => r * n + c;
  const order = path.map(id);
  const pos = new Map(order.map((x, i) => [x, i]));
  const stopAt = [0, path.length - 1];
  for (let i = 8 + rint(5); i < path.length - 6; i += 9 + rint(6)) stopAt.push(i);
  const walls = new Set();
  const wallKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  for (;;) {
    stopAt.sort((a, b) => a - b);
    const sols = traceSolve(n, stopAt.map(i => order[i]), walls);
    const rival = sols.routes.find(r => r.join() !== order.join());
    if (!rival && !sols.gaveUp) break;
    const free = rival ? rival.slice(1).map((x, i) => [rival[i], x]).filter(([a, b]) => Math.abs(pos.get(a) - pos.get(b)) !== 1) : [];
    if (free.length && walls.size < 14) {
      const [a, b] = pick(free);
      walls.add(wallKey(a, b));
    } else {
      const spare = order.map((_, i) => i).filter(i => !stopAt.includes(i));
      stopAt.push(pick(spare));
    }
  }
  return {
    n, stops: stopAt.map(i => path[i]), trail: [],
    walls: [...walls].map(k => k.split('-').map(Number)),
  };
}
function traceSolve(n, stops, walls) {
  const N = n * n, last = stops.at(-1), stopIndex = new Map(stops.map((x, i) => [x, i]));
  const wallKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const adj = Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / n), c = i % n;
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n)
      .map(([a, b]) => a * n + b)
      .filter(x => !walls.has(wallKey(i, x)));
  });
  const used = Array(N).fill(false), route = [], routes = [];
  let nodes = 0, gaveUp = false;
  const reachable = from => {
    const seen = new Set([from]), q = [from];
    while (q.length) for (const x of adj[q.pop()]) if (!used[x] && !seen.has(x)) { seen.add(x); q.push(x); }
    return seen.size - 1;
  };
  const go = (cell, next) => {
    used[cell] = true;
    route.push(cell);
    if (route.length === N) {
      if (cell === last) routes.push(route.slice());
    } else if (++nodes > 200000) gaveUp = true;
    else if (reachable(cell) === N - route.length) {
      for (const x of shuffle(adj[cell])) {
        if (used[x] || routes.length >= 2 || gaveUp) continue;
        const k = stopIndex.get(x);
        if (k !== undefined && k !== next) continue;
        go(x, k === undefined ? next : next + 1);
      }
    }
    used[cell] = false;
    route.pop();
  };
  go(stops[0], 1);
  return { routes, gaveUp };
}
reg({
  id: 'trace', group: GROUP_LOGIC, name: 'Trace', blurb: 'One line through every square, around walls',
  help: ['Start at 1 and drag one line through every square, reaching the numbers in order and finishing on the highest. You can’t cross a wall, and only up, down, left and right moves count. Drag back along your line to undo. Every board has exactly one answer.'],
  run(ctx) {
    const s = ctx.saved || linePuzzle(), n = s.n;
    const { grid, cells } = makeGrid(ctx.root, n);
    s.stops.forEach(([r, c], i) => cells[r][c].append(el('span', 'dot', i + 1)));
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'path');
    svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
    const blocked = new Set();
    for (const [a, b] of s.walls) {
      blocked.add(`${a}-${b}`);
      const ra = Math.floor(a / n), ca = a % n, line = document.createElementNS(NS, 'line');
      const across = b === a + 1;
      const [x1, y1, x2, y2] = across ? [ca + 1, ra, ca + 1, ra + 1] : [ca, ra + 1, ca + 1, ra + 1];
      Object.entries({ x1, y1, x2, y2, stroke: '#f2f4fb', 'stroke-width': 0.09, 'stroke-linecap': 'round' })
        .forEach(([k, v]) => line.setAttribute(k, v));
      svg.append(line);
    }
    const walled = (a, b) => blocked.has(`${Math.min(a, b)}-${Math.max(a, b)}`);
    const poly = document.createElementNS(NS, 'polyline');
    Object.entries({ fill: 'none', stroke: '#58c4ff', 'stroke-width': 0.42, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
      .forEach(([k, v]) => poly.setAttribute(k, v));
    svg.append(poly);
    grid.append(svg);
    const paint = () => poly.setAttribute('points', s.trail.map(([r, c]) => `${c + .5},${r + .5}`).join(' '));
    const stopAt = (r, c) => s.stops.findIndex(p => p[0] === r && p[1] === c);
    const reached = () => s.trail.filter(p => stopAt(p[0], p[1]) >= 0).length;
    const pos = (r, c) => s.trail.findIndex(p => p[0] === r && p[1] === c);
    dragCells(grid, {
      start(r, c) {
        if (ctx.ended) return;
        const i = pos(r, c);
        if (i >= 0) s.trail.length = i + 1;
        else if (stopAt(r, c) === 0) s.trail = [[r, c]];
        paint();
      },
      move(r, c) {
        if (ctx.ended || !s.trail.length) return;
        const i = pos(r, c);
        if (i >= 0) { s.trail.length = i + 1; paint(); return; }
        const [lr, lc] = s.trail.at(-1);
        if (Math.abs(r - lr) + Math.abs(c - lc) !== 1 || walled(lr * n + lc, r * n + c)) return;
        const k = stopAt(r, c);
        if (k >= 0 && k !== reached()) return;
        s.trail.push([r, c]);
        paint();
      },
      end() {
        ctx.save(s);
        if (s.trail.length === n * n && reached() === s.stops.length) ctx.finish({ won: true, title: 'Every square covered', word: 'Solved' });
      },
    });
    paint();
  },
});

/* Crowns */
function crownCount(region, n, limit) {
  let found = 0;
  const cols = [], used = new Set();
  const go = r => {
    if (r === n) { found++; return; }
    for (let c = 0; c < n && found < limit; c++) {
      const reg = region[r * n + c];
      if (cols.includes(c) || used.has(reg) || (r && Math.abs(cols[r - 1] - c) <= 1)) continue;
      cols.push(c);
      used.add(reg);
      go(r + 1);
      cols.pop();
      used.delete(reg);
    }
  };
  go(0);
  return found;
}
function crownPuzzle() {
  const n = 8, t0 = Date.now();
  let region;
  do {
    let q;
    do { q = shuffle([...Array(n).keys()]); } while (q.some((c, r) => r && Math.abs(c - q[r - 1]) <= 1));
    region = Array(n * n).fill(-1);
    const front = [];
    q.forEach((c, r) => { region[r * n + c] = r; front.push(r * n + c); });
    while (front.length) {
      const k = rint(front.length), i = front[k];
      const r = Math.floor(i / n), c = i % n;
      const open = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]
        .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && region[a * n + b] < 0);
      if (!open.length) { front.splice(k, 1); continue; }
      const [a, b] = pick(open);
      region[a * n + b] = region[i];
      front.push(a * n + b);
    }
  } while (crownCount(region, n, 2) !== 1 && Date.now() - t0 < 1500);
  return { n, region, marks: Array(n * n).fill(0) };
}
reg({
  id: 'crowns', group: GROUP_LOGIC, name: 'Crowns', blurb: 'One crown per row, column and colour',
  help: ['Place one crown in every row, column and colour area. Crowns can’t touch, even diagonally. Tap once for ×, twice for a crown, three times to clear.'],
  run(ctx) {
    const s = ctx.saved || crownPuzzle(), n = s.n;
    const COLOURS = ['#3f7fc9', '#d9822b', '#2f9e6e', '#9b5fd0', '#d4557c', '#a3b836', '#2fb3b3', '#8d6e5a'];
    const { grid, cells } = makeGrid(ctx.root, n, (d, r, c) => {
      const here = s.region[r * n + c];
      d.style.background = COLOURS[here];
      d.style.color = '#161617';
      const edge = [];
      if (c < n - 1 && s.region[r * n + c + 1] !== here) edge.push('inset -2px 0 0 #161617');
      if (r < n - 1 && s.region[(r + 1) * n + c] !== here) edge.push('inset 0 -2px 0 #161617');
      d.style.boxShadow = edge.join(',');
    });
    const flat = cells.flat();
    const crowns = () => s.marks.flatMap((m, i) => (m === 2 ? [i] : []));
    const clash = (i, j) => {
      const r = Math.floor(i / n), c = i % n, a = Math.floor(j / n), b = j % n;
      return r === a || c === b || s.region[i] === s.region[j] || (Math.abs(r - a) <= 1 && Math.abs(c - b) <= 1);
    };
    const paint = () => {
      const list = crowns();
      flat.forEach((d, i) => {
        d.textContent = s.marks[i] === 2 ? '♛' : s.marks[i] === 1 ? '×' : '';
        d.classList.toggle('bad', s.marks[i] === 2 && list.some(j => j !== i && clash(i, j)));
      });
    };
    grid.addEventListener('click', e => {
      const d = e.target.closest('.cell');
      if (!d || ctx.ended) return;
      const i = +d.dataset.r * n + +d.dataset.c;
      s.marks[i] = (s.marks[i] + 1) % 3;
      ctx.save(s);
      paint();
      const list = crowns();
      if (list.length === n && list.every(a => list.every(b => a === b || !clash(a, b)))) {
        ctx.finish({ won: true, title: 'Crowns placed', word: 'Solved' });
      }
    });
    paint();
  },
});
