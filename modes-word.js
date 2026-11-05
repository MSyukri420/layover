'use strict';
const GROUP_WORD = 'Word games';

/* Altitude: one letter at a time. */
reg({
  id: 'altitude', group: GROUP_WORD, name: 'Altitude', blurb: 'Guess letters before you run out of height',
  help: ['Guess the hidden word one letter at a time. Each wrong letter loses one bar of altitude. Lose all six and the round is over.'],
  run(ctx) {
    const s = ctx.saved || { word: deal('layover.deck.alt', [...A[6], ...A[7]]), tried: '' };
    const col = el('div', 'center-col');
    const gauge = el('div', 'gauge');
    const big = el('div', 'big');
    col.append(gauge, big);
    ctx.root.append(col);
    const press = k => {
      if (ctx.ended || !/^[a-z]$/.test(k) || s.tried.includes(k)) return;
      s.tried += k;
      ctx.save(s);
      paint();
      const lost = misses() >= 6, won = [...s.word].every(c => s.tried.includes(c));
      if (won || lost) ctx.finish({ won, title: won ? 'Safe landing' : 'Out of altitude. The word was', word: s.word });
    };
    ctx.keys = press;
    const kb = keyboard(ctx.root, press, ['qwertyuiop', ' asdfghjkl ', ' zxcvbnm ']);
    const misses = () => [...s.tried].filter(c => !s.word.includes(c)).length;
    function paint() {
      gauge.replaceChildren(...Array.from({ length: 6 }, (_, i) => el('i', i < 6 - misses() ? '' : 'off')));
      big.textContent = [...s.word].map(c => (s.tried.includes(c) ? c : '_')).join('');
      const map = {};
      for (const c of s.tried) map[c] = s.word.includes(c) ? 'correct' : 'absent';
      kb.paint(map);
    }
    paint();
  },
});

/* Word Ladder */
function ladderPuzzle() {
  const pool = A[4];
  const buckets = {};
  const masks = w => [...w].map((_, i) => w.slice(0, i) + '_' + w.slice(i + 1));
  for (const w of pool) for (const m of masks(w)) (buckets[m] = buckets[m] || []).push(w);
  for (;;) {
    const start = pick(pool);
    const dist = { [start]: 0 };
    const q = [start];
    while (q.length) {
      const w = q.shift();
      for (const m of masks(w)) {
        for (const x of buckets[m]) {
          if (dist[x] == null) { dist[x] = dist[w] + 1; q.push(x); }
        }
      }
    }
    const far = Object.keys(dist).filter(w => dist[w] >= 3 && dist[w] <= 6);
    if (far.length) { const end = pick(far); return { end, par: dist[end], chain: [start] }; }
  }
}
reg({
  id: 'ladder', group: GROUP_WORD, name: 'Word Ladder', blurb: 'Change one letter at a time to reach the goal',
  help: ['Turn the top word into the goal word. Each step changes exactly one letter and must be a real word. Undo takes back a step.'],
  run(ctx) {
    const s = ctx.saved || ladderPuzzle();
    const info = el('p', 'prompt');
    const scroll = el('div', 'scroll');
    const rungs = el('div', 'rungs');
    scroll.append(rungs);
    const btns = el('div', 'row-btns');
    const undo = el('button', 'btn', 'Undo');
    const skip = el('button', 'btn', 'Give up');
    btns.append(undo, skip);
    ctx.root.append(info, scroll, btns);
    function paint() {
      info.textContent = `Shortest route: ${s.par} steps. You: ${s.chain.length - 1}`;
      rungs.replaceChildren(...s.chain.map(w => el('div', 'rung', w)), el('div', 'rung gap', '↓'), el('div', 'rung goal', s.end));
      scroll.scrollTop = scroll.scrollHeight;
    }
    const t = typer(ctx, ctx.root, {
      max: 4,
      enter(w) {
        const last = s.chain.at(-1);
        if (w.length !== 4) return toast('Four letters');
        const diff = [...w].filter((c, i) => c !== last[i]).length;
        if (diff !== 1) return toast('Change exactly one letter');
        if (!isWord(w)) return toast('Not in word list');
        s.chain.push(w);
        t.clear();
        ctx.save(s);
        paint();
        if (w === s.end) {
          const steps = s.chain.length - 1;
          ctx.finish({ won: true, title: `Reached it in ${steps} steps`, word: steps === s.par ? 'Shortest route!' : `Shortest was ${s.par}` });
        }
      },
    });
    undo.onclick = () => { if (s.chain.length > 1 && !ctx.ended) { s.chain.pop(); ctx.save(s); paint(); } };
    skip.onclick = () => ctx.finish({ won: false, title: 'Goal word was', word: s.end, delay: 0 });
    paint();
  },
});

/* Unscramble */
reg({
  id: 'unscramble', group: GROUP_WORD, name: 'Unscramble', scored: true, blurb: 'Put jumbled letters back in order',
  help: ['Type the word hidden in the jumbled letters. Any real word using all the letters counts. Solve a streak: three misses ends the run.'],
  run(ctx) {
    const s = ctx.saved || { score: 0, lives: 3 };
    const fresh = () => {
      s.word = deal('layover.deck.scr', [...A[6], ...A[7]]);
      do { s.jumble = shuffle([...s.word]).join(''); } while (s.jumble === s.word);
      s.hint = 0;
    };
    if (!s.word) fresh();
    const top = el('div', 'bar-top');
    const col = el('div', 'center-col');
    const big = el('div', 'big');
    const hintLine = el('p', 'prompt');
    col.append(big, hintLine);
    const btns = el('div', 'row-btns');
    const hint = el('button', 'btn', 'Hint'), skip = el('button', 'btn', 'Skip (lose a life)');
    btns.append(hint, skip);
    ctx.root.append(top, col, btns);
    const paint = () => {
      top.textContent = `Solved ${s.score} · Lives ${s.lives}`;
      big.textContent = s.jumble;
      hintLine.textContent = s.hint ? `Starts with ${s.word.slice(0, s.hint).toUpperCase()}` : ' ';
      ctx.save(s);
    };
    const t = typer(ctx, ctx.root, {
      max: 7,
      enter(w) {
        if (w.length !== s.word.length || [...w].sort().join('') !== [...s.word].sort().join('')) return toast('Use all the letters');
        if (!isWord(w)) return toast('Not in word list');
        s.score++;
        toast('Correct');
        t.clear();
        fresh();
        paint();
      },
    });
    hint.onclick = () => { if (s.hint < s.word.length - 2) { s.hint++; paint(); } };
    skip.onclick = () => {
      if (ctx.ended) return;
      s.lives--;
      if (s.lives <= 0) return ctx.finish({ won: s.score > 0, score: s.score, title: `Solved ${s.score}. Last word was`, word: s.word, delay: 0 });
      toast(`It was ${s.word.toUpperCase()}`);
      t.clear();
      fresh();
      paint();
    };
    paint();
  },
});

/* Word Search */
function searchPuzzle() {
  const n = 9;
  for (;;) {
    const g = Array.from({ length: n }, () => Array(n).fill(''));
    const dirs = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
    const placed = [];
    for (const w of shuffle([...A[4], ...A[5], ...A[6], ...A[7]]).slice(0, 40)) {
      if (placed.length === 8) break;
      for (let tries = 0; tries < 60; tries++) {
        const [dr, dc] = pick(dirs), r = rint(n), c = rint(n);
        const cells = [...w].map((_, i) => [r + dr * i, c + dc * i]);
        if (!cells.every(([a, b]) => a >= 0 && b >= 0 && a < n && b < n)) continue;
        if (!cells.every(([a, b], i) => !g[a][b] || g[a][b] === w[i])) continue;
        cells.forEach(([a, b], i) => { g[a][b] = w[i]; });
        placed.push(w);
        break;
      }
    }
    if (placed.length < 8) continue;
    const abc = 'abcdefghijklmnoprstuvwy';
    return { n, g: g.map(row => row.map(ch => ch || pick(abc))), words: placed, found: [], hit: [] };
  }
}
reg({
  id: 'search', group: GROUP_WORD, name: 'Word Search', blurb: 'Drag to find eight hidden words',
  help: ['Words run in any straight line, including backwards and diagonally. Drag across a word to circle it.'],
  run(ctx) {
    const s = ctx.saved || searchPuzzle();
    const chips = el('div', 'chips found-list');
    ctx.root.append(chips);
    const { grid, cells } = makeGrid(ctx.root, s.n, (d, r, c) => { d.textContent = s.g[r][c].toUpperCase(); });
    let from = null, path = [];
    const paint = () => {
      chips.replaceChildren(...s.words.map(w => el('span', 'chip' + (s.found.includes(w) ? ' done' : ''), w)));
      cells.flat().forEach(d => d.classList.remove('hit', 'found'));
      s.hit.forEach(([r, c]) => cells[r][c].classList.add('found'));
      path.forEach(([r, c]) => cells[r][c].classList.add('hit'));
    };
    dragCells(grid, {
      start(r, c) { from = [r, c]; path = [[r, c]]; paint(); },
      move(r, c) {
        const dr = r - from[0], dc = c - from[1];
        if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return;
        const len = Math.max(Math.abs(dr), Math.abs(dc));
        path = Array.from({ length: len + 1 }, (_, i) => [from[0] + Math.sign(dr) * i, from[1] + Math.sign(dc) * i]);
        paint();
      },
      end() {
        const w = path.map(([r, c]) => s.g[r][c]).join('');
        const rev = [...w].reverse().join('');
        const hit = s.words.find(x => (x === w || x === rev) && !s.found.includes(x));
        if (hit) { s.found.push(hit); s.hit.push(...path); ctx.save(s); }
        path = [];
        paint();
        if (s.found.length === s.words.length) ctx.finish({ won: true, title: 'All words found', word: `${s.words.length} of ${s.words.length}` });
      },
    });
    paint();
  },
});

/* Word Chain */
reg({
  id: 'chain', group: GROUP_WORD, name: 'Word Chain', scored: true, blurb: 'Each word starts on the last letter',
  help: ['Type a word starting with the last letter of the one before. Three letters or more, no repeats. You start with 30 seconds, and each word adds 5.'],
  run(ctx) {
    let word = pick(A[5]), time = 30;
    const used = new Set([word]);
    const top = el('div', 'bar-top');
    const clock = el('b'), count = el('span');
    top.append(clock, count);
    const col = el('div', 'center-col');
    const big = el('div', 'big');
    const hint = el('p', 'prompt');
    col.append(big, hint);
    ctx.root.append(top, col);
    const paint = () => {
      clock.textContent = time + 's';
      count.textContent = `${used.size - 1} words`;
      big.textContent = word;
      hint.textContent = `Next word starts with ${word.at(-1).toUpperCase()}`;
    };
    const t = typer(ctx, ctx.root, {
      max: 8,
      enter(w) {
        if (w.length < 3) return toast('Three letters or more');
        if (w[0] !== word.at(-1)) return toast(`Must start with ${word.at(-1).toUpperCase()}`);
        if (used.has(w)) return toast('Already used');
        if (!isWord(w)) return toast('Not in word list');
        used.add(w);
        word = w;
        time += 5;
        t.clear();
        paint();
      },
    });
    paint();
    ctx.every(() => {
      time--;
      paint();
      if (time <= 0) {
        const n = used.size - 1;
        ctx.finish({ won: n > 0, score: n, title: 'Time up. Chain length', word: String(n) });
      }
    }, 1000);
  },
});

/* Shared progress UI for find-all-the-words modes. */
function wordHunt(ctx, parent, s, onDone) {
  const need = Math.ceil(s.words.length * 0.4);
  const info = el('div', 'bar-top');
  const bar = el('div', 'progress');
  const fill = el('i');
  bar.append(fill);
  const list = el('div', 'chips found-list');
  parent.append(info, bar, list);
  const paint = () => {
    const f = s.found.length;
    info.textContent = `${f} of ${s.words.length} words · ${f >= need ? 'Goal reached' : `goal ${need}`}`;
    fill.style.width = f / s.words.length * 100 + '%';
    list.replaceChildren(...s.found.slice().reverse().map(w => el('span', 'chip', w)));
  };
  paint();
  return {
    paint,
    finish() {
      const f = s.found.length;
      ctx.finish({ won: f >= need, score: f, title: `Found ${f} of ${s.words.length}`, word: f >= need ? 'Goal reached' : `Goal was ${need}`, delay: 0 });
    },
    add(w) {
      if (w.length < 4) return toast('Four letters or more');
      if (s.found.includes(w)) return toast('Already found');
      if (!s.words.includes(w)) return toast('Not a match');
      s.found.push(w);
      ctx.save(s);
      paint();
      toast(new Set(w).size === 7 ? 'All seven letters!' : 'Nice');
      if (s.found.length === s.words.length) this.finish();
    },
  };
}

/* Letter Ring */
function ringPuzzle() {
  const seeds = allWords().filter(w => new Set(w).size === 7 && (w.length === 7 || w.length === 8));
  for (;;) {
    const letters = [...new Set(pick(seeds))];
    const center = pick(letters);
    const ok = new Set(letters);
    const words = allWords().filter(w => w.includes(center) && [...w].every(c => ok.has(c)));
    if (words.length >= 15 && words.length <= 90) {
      return { letters: shuffle(letters.filter(c => c !== center)), center, words, found: [] };
    }
  }
}
reg({
  id: 'ring', group: GROUP_WORD, name: 'Letter Ring', scored: true, blurb: 'Make words from seven letters',
  help: ['Make words of four letters or more. Letters can repeat, and every word must use the centre letter. Find 40% of the words to reach the goal, then keep going or tap Finish.'],
  run(ctx) {
    const s = ctx.saved || ringPuzzle();
    const hunt = wordHunt(ctx, ctx.root, s);
    let cur = '';
    const line = el('div', 'line');
    const fit = el('div', 'fit');
    const ring = el('div', 'ring');
    fit.append(ring);
    const btns = el('div', 'row-btns');
    const del = el('button', 'btn', 'Delete'), mix = el('button', 'btn', 'Shuffle');
    const go = el('button', 'btn on', 'Enter'), end = el('button', 'btn', 'Finish');
    btns.append(del, mix, go, end);
    ctx.root.append(line, fit, btns);
    const paintLine = () => { line.textContent = cur || ' '; };
    const press = k => {
      if (ctx.ended) return;
      if (k === 'enter') { if (cur) hunt.add(cur); cur = ''; }
      else if (k === 'back') cur = cur.slice(0, -1);
      else if ((s.letters.includes(k) || k === s.center) && cur.length < 8) cur += k;
      paintLine();
    };
    ctx.keys = press;
    function drawRing() {
      ring.replaceChildren();
      const center = el('button', 'center', s.center);
      center.onclick = () => press(s.center);
      ring.append(center);
      s.letters.forEach((c, i) => {
        const b = el('button', '', c);
        const a = i / 6 * Math.PI * 2 - Math.PI / 2;
        b.style.left = 35.5 + Math.cos(a) * 35 + '%';
        b.style.top = 35.5 + Math.sin(a) * 35 + '%';
        b.onclick = () => press(c);
        ring.append(b);
      });
    }
    del.onclick = () => press('back');
    go.onclick = () => press('enter');
    mix.onclick = () => { s.letters = shuffle(s.letters); drawRing(); };
    end.onclick = () => hunt.finish();
    drawRing();
    paintLine();
  },
});

/* Letter Trail */
function trailPuzzle() {
  const bag = 'eeeeeeeeaaaaaaiiiiioooootttttnnnnrrrrssssllllddduuuccmmppggbbhhffwyvk';
  const n = 4;
  const pre = prefixSet();
  for (;;) {
    const g = Array.from({ length: n }, () => Array.from({ length: n }, () => pick(bag)));
    const words = new Set();
    const seen = Array.from({ length: n }, () => Array(n).fill(false));
    const walk = (r, c, w) => {
      w += g[r][c];
      if (!pre.has(w)) return;
      if (w.length >= 4 && isWord(w)) words.add(w);
      if (w.length === 8) return;
      seen[r][c] = true;
      for (let a = r - 1; a <= r + 1; a++) {
        for (let b = c - 1; b <= c + 1; b++) {
          if (a >= 0 && b >= 0 && a < n && b < n && !seen[a][b]) walk(a, b, w);
        }
      }
      seen[r][c] = false;
    };
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) walk(r, c, '');
    if (words.size >= 15) return { n, g, words: [...words], found: [] };
  }
}
reg({
  id: 'trail', group: GROUP_WORD, name: 'Letter Trail', scored: true, blurb: 'Drag through touching letters to make words',
  help: ['Drag through touching letters, including diagonals, to spell words of four letters or more. Each letter can be used once per word. Find 40% to reach the goal.'],
  run(ctx) {
    const s = ctx.saved || trailPuzzle();
    const hunt = wordHunt(ctx, ctx.root, s);
    const line = el('div', 'line', ' ');
    ctx.root.append(line);
    const { grid, cells } = makeGrid(ctx.root, s.n, (d, r, c) => { d.textContent = s.g[r][c].toUpperCase(); });
    const end = el('button', 'btn', 'Finish');
    const btns = el('div', 'row-btns');
    btns.append(end);
    ctx.root.append(btns);
    let path = [];
    const word = () => path.map(([r, c]) => s.g[r][c]).join('');
    const paint = () => {
      cells.flat().forEach(d => d.classList.remove('hit'));
      path.forEach(([r, c]) => cells[r][c].classList.add('hit'));
      line.textContent = word() || ' ';
    };
    dragCells(grid, {
      start(r, c) { if (ctx.ended) return; path = [[r, c]]; paint(); },
      move(r, c) {
        if (!path.length) return;
        const [lr, lc] = path.at(-1);
        const i = path.findIndex(p => p[0] === r && p[1] === c);
        if (i === path.length - 2 && i >= 0) { path.pop(); paint(); return; }
        if (i >= 0 || Math.abs(r - lr) > 1 || Math.abs(c - lc) > 1 || path.length >= 8) return;
        path.push([r, c]);
        paint();
      },
      end() {
        if (path.length > 1) hunt.add(word());
        path = [];
        paint();
      },
    });
    end.onclick = () => hunt.finish();
  },
});
