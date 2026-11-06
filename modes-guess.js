'use strict';
/* Every colour-clue mode runs on this one engine: lengths, multi-board, daily, speed, equations. */
function score(guess, answer) {
  const n = answer.length;
  const res = Array(n).fill('absent');
  const left = {};
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
  }
  return res;
}

const CLUE_HELP = [
  'After each guess the windows show how close you were.',
  'Orange: right letter, right spot. Blue ring: in the word, wrong spot. Dim: not in the word.',
  'Stuck? Tap the bulb once per round to reveal a letter you haven’t tried yet. It stays outlined on the keyboard.',
];

function guessGame(ctx, o) {
  const n = o.boards || 1, len = o.len, tries = o.tries;
  let s = ctx.saved && (!o.day || ctx.saved.day === o.day) ? ctx.saved : null;
  s = s || { day: o.day, answers: o.answers(), guesses: [] };
  let cur = '', busy = false, flipRow = -1, timeLeft = o.speed ? 180 : 0, solvedCount = 0;

  const top = el('div', 'bar-top');
  const clock = el('b'), tally = el('span');
  if (o.speed) { top.append(clock, tally); ctx.root.append(top); }

  const solvedAt = i => { const k = s.guesses.indexOf(s.answers[i]); return k < 0 ? Infinity : k; };
  const single = n === 1;
  const wrap = el('div', single ? 'fit' : 'scroll');
  const boards = el('div', single ? 'board' : 'minis');
  if (single) {
    const ratio = (len * 4) / (tries * 5);
    boards.style.setProperty('--ratio', ratio);
    boards.style.setProperty('--font', 0.52 / len);
    boards.style.gridTemplateRows = `repeat(${tries},1fr)`;
  } else boards.style.setProperty('--cols', n <= 2 ? 2 : n === 4 ? 2 : 4);
  wrap.append(boards);
  ctx.root.append(wrap);
  const liveLine = n >= 8 ? el('div', 'line') : null;
  if (liveLine) ctx.root.append(liveLine);

  const press = k => {
    if (busy || ctx.ended) return;
    if (k === 'enter') return submit();
    if (k === 'back') cur = cur.slice(0, -1);
    else if ((o.chars || /^[a-z]$/).test(k) && cur.length < len) cur += k;
    else return;
    render();
  };
  ctx.keys = press;
  const kb = keyboard(ctx.root, press, o.layout, o.layout ? 'num' : '');

  /* One clue per round: a character from an unsolved answer that no guess has used. */
  const clueText = c => {
    const shown = c.toUpperCase();
    if (n > 1) return `${shown} is in an unsolved word`;
    return `The ${o.layout ? 'sum' : 'word'} has ${shown}`;
  };
  function giveClue() {
    if (ctx.ended || busy) return;
    if (s.clue) return toast(clueText(s.clue));
    const tried = new Set(s.guesses.join(''));
    const unsolved = s.answers.filter((_, i) => solvedAt(i) === Infinity);
    const left = [...new Set(unsolved.join(''))].filter(c => !tried.has(c));
    if (!left.length) return toast('You’ve tried every letter in it');
    s.clue = pick(left);
    if (!o.speed) ctx.save(s);
    paintKeys();
    toast(clueText(s.clue));
  }
  ctx.clue = giveClue;
  $('clueBtn').hidden = false;

  function tileRow(guess, answer, typing, flip) {
    const row = el('div', 't-row');
    const text = guess ?? typing ?? '';
    const res = guess ? score(guess, answer) : null;
    for (let i = 0; i < len; i++) {
      const t = el('div', 'tile', text[i] ?? '');
      if (res) t.classList.add(res[i]);
      else if (text[i]) t.classList.add('filled');
      if (flip) { t.classList.add('flip'); t.style.animationDelay = i * 220 + 'ms'; }
      row.append(t);
    }
    return row;
  }

  function drawBoard(i) {
    const at = solvedAt(i), g = s.guesses, a = s.answers[i];
    const box = single ? boards : el('div', 'mini' + (at < Infinity ? ' solved' : ''));
    const rows = [];
    if (!single && n >= 8 && at < Infinity) rows.push(tileRow(a, a));
    else {
      const shown = Math.min(g.length, at + 1);
      for (let r = 0; r < shown; r++) rows.push(tileRow(g[r], a, null, r === flipRow && single));
      const open = at === Infinity && !ctx.ended;
      const total = n >= 4 ? shown + (open ? 1 : 0) : tries;
      for (let r = shown; r < total; r++) rows.push(tileRow(null, a, open && r === g.length ? cur : ''));
    }
    box.replaceChildren(...rows);
    return box;
  }

  function render() {
    if (single) drawBoard(0);
    else {
      const order = s.answers.map((_, i) => i);
      if (n >= 8) order.sort((x, y) => (solvedAt(x) < Infinity) - (solvedAt(y) < Infinity) || x - y);
      boards.replaceChildren(...order.map(drawBoard));
    }
    if (liveLine) liveLine.textContent = cur || ' ';
  }

  function paintKeys() {
    const rank = { absent: 1, present: 2, correct: 3 }, seen = {};
    s.answers.forEach((a, i) => {
      if (solvedAt(i) < Infinity && n > 1) return;
      for (const g of s.guesses) {
        score(g, a).forEach((c, j) => {
          if (!seen[g[j]] || rank[c] > rank[seen[g[j]]]) seen[g[j]] = c;
        });
      }
    });
    if (s.clue && !seen[s.clue]) seen[s.clue] = 'hint';
    kb.paint(seen);
    $('clueBtn').classList.toggle('used', !!s.clue);
  }

  function shake() {
    const row = single ? boards.children[s.guesses.length] : null;
    if (!row) return;
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
  }

  function submit() {
    if (cur.length < len) { toast('Not enough letters'); return shake(); }
    const bad = o.check ? o.check(cur) : (isWord(cur) ? null : 'Not in word list');
    if (bad) { toast(bad); return shake(); }

    s.guesses.push(cur);
    cur = '';
    flipRow = s.guesses.length - 1;
    render();
    flipRow = -1;
    const wait = single ? 4 * 220 + 520 : 0;
    const won = s.answers.every((_, i) => solvedAt(i) < Infinity);
    const out = won || s.guesses.length === tries;
    if (!o.speed) ctx.save(s);
    if (out && !o.speed) {
      const unsolved = s.answers.filter((_, i) => solvedAt(i) === Infinity);
      ctx.finish({
        won, guesses: won ? s.guesses.length : null, delay: wait + 300,
        keep: o.day ? s : null,
        title: won ? `Landed in ${s.guesses.length} of ${tries}` : `Diverted. The word${unsolved.length > 1 ? 's were' : ' was'}`,
        word: (won ? (n > 1 ? `${n} boards solved` : s.answers[0]) : unsolved.slice(0, 6).join(', ') + (unsolved.length > 6 ? ` +${unsolved.length - 6} more` : '')),
      });
    }
    busy = true;
    setTimeout(() => {
      busy = false;
      paintKeys();
      if (o.speed && out) nextSpeed(won);
    }, wait);
  }

  function nextSpeed(won) {
    if (won) { solvedCount++; timeLeft += 20; toast('+20 seconds'); }
    else { timeLeft -= 15; toast(`It was ${s.answers[0].toUpperCase()}. −15 seconds`); }
    s = { answers: o.answers(), guesses: [] };
    render();
    paintKeys();
    showClock();
  }

  function showClock() {
    const t = Math.max(0, timeLeft);
    clock.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    tally.textContent = `${solvedCount} solved`;
  }

  render();
  paintKeys();
  if (o.speed) {
    showClock();
    ctx.every(() => {
      timeLeft--;
      showClock();
      if (timeLeft <= 0) {
        ctx.finish({ won: solvedCount > 0, score: solvedCount, title: 'Time up. Words solved', word: String(solvedCount) });
      }
    }, 1000);
  }
  if (o.day && s.guesses.length && (s.guesses.includes(s.answers[0]) || s.guesses.length === tries)) {
    const won = s.guesses.includes(s.answers[0]);
    ctx.finish({ record: false, keep: s, won, delay: 0,
      title: won ? 'Done for today. New word tomorrow' : 'Today’s word was', word: s.answers[0] });
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const wordPicker = (id, n, count = 1) => () => {
  const out = [];
  while (out.length < count) {
    const w = deal(`layover.deck.${id}`, A[n]);
    if (!out.includes(w)) out.push(w);
  }
  return out;
};

const LETTER_NAMES = { 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight' };
for (const n of [5, 4, 6, 7, 8]) {
  reg({
    id: 'len' + n, group: 'Colour clues', name: LETTER_NAMES[n] + ' Letters',
    blurb: `Unlimited ${n}-letter words, 6 guesses`,
    help: [`Find the hidden ${n}-letter word in six guesses.`, ...CLUE_HELP, 'No daily limit. Finish one and the next is ready.'],
    run: ctx => guessGame(ctx, { len: n, tries: 6, answers: wordPicker('len' + n, n) }),
  });
}
reg({
  id: 'daily', group: 'Colour clues', name: 'Word of the Day', blurb: 'One new word per day, works offline',
  help: ['One word per calendar day, picked on your phone with no internet needed.', ...CLUE_HELP],
  run: ctx => {
    const day = today();
    guessGame(ctx, { len: 5, tries: 6, day, answers: () => [pick(A[5], seeded(day))] });
  },
});
reg({
  id: 'speed', group: 'Colour clues', name: 'Speed Run', scored: true, blurb: 'Solve as many as you can on the clock',
  help: ['You start with 3 minutes. Each solved word adds 20 seconds, and each missed word costs 15.', ...CLUE_HELP],
  run: ctx => guessGame(ctx, { len: 5, tries: 6, speed: true, answers: wordPicker('speed', 5) }),
});
for (const [n, tries] of [[2, 7], [4, 9], [8, 13], [16, 21], [32, 37]]) {
  reg({
    id: 'multi' + n, group: 'Many boards', name: `${n} Boards`, blurb: `${n} words at once, ${tries} guesses`,
    help: [`Every guess goes on all ${n} boards at once. Solve them all within ${tries} guesses.`, ...CLUE_HELP,
      'The keyboard only shows clues from boards you haven’t solved yet.'],
    run: ctx => guessGame(ctx, { len: 5, tries, boards: n, answers: wordPicker('multi', 5, n) }),
  });
}

/* Equation mode: same clues, digits instead of letters. */
function evalSide(expr) {
  const nums = expr.split(/[-+*/]/), ops = expr.replace(/[0-9]/g, '').split('');
  if (nums.some(x => x === '' || (x.length > 1 && x[0] === '0'))) return null;
  const vals = [+nums[0]], rest = [];
  for (let i = 0; i < ops.length; i++) {
    const v = +nums[i + 1];
    if (ops[i] === '*') vals[vals.length - 1] *= v;
    else if (ops[i] === '/') {
      if (v === 0) return null;
      vals[vals.length - 1] /= v;
    } else { rest.push(ops[i]); vals.push(v); }
  }
  return rest.reduce((t, op, i) => (op === '+' ? t + vals[i + 1] : t - vals[i + 1]), vals[0]);
}
function checkEquation(s) {
  const p = s.split('=');
  if (p.length !== 2 || !/^[0-9]+$/.test(p[1]) || !/[-+*/]/.test(p[0])) return 'Needs one sum and one =';
  const l = evalSide(p[0]);
  if (l === null || p[1].length > 1 && p[1][0] === '0') return 'That isn’t a valid sum';
  return l === +p[1] ? null : 'Both sides must match';
}
function newEquation() {
  const OPS = '+-*/';
  for (;;) {
    const parts = rint(2) ? 2 : 3;
    const max = parts === 3 ? 12 : 99; // three-number sums need small values to fit in 8 characters
    let e = String(1 + rint(max));
    for (let i = 1; i < parts; i++) e += pick(OPS) + (1 + rint(max));
    const v = evalSide(e);
    if (v === null || v < 0 || !Number.isInteger(v)) continue;
    const full = `${e}=${v}`;
    if (full.length === 8) return full;
  }
}
reg({
  id: 'equation', group: 'Colour clues', name: 'Equation', blurb: 'Crack the hidden 8-character sum',
  help: ['Find the hidden sum in six guesses, for example 12+35=47. Every guess must be a true sum.',
    'Orange: right spot. Blue ring: in the sum, wrong spot. Dim: not in the sum. * means times and / means divide, and they happen before + and -.',
    'Stuck? Tap the bulb once per round to reveal a character you haven’t tried yet.'],
  run: ctx => guessGame(ctx, {
    len: 8, tries: 6, chars: /^[0-9+\-*/=]$/, check: checkEquation,
    layout: ['12345', '67890', '+-*/=', '><'], answers: () => [newEquation()],
  }),
});
