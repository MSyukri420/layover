'use strict';
/* Small chess rules engine: squares are 0 (a8) to 63 (h1). */
const FILES = 'abcdefgh';
const sqOf = s => (8 - +s[1]) * 8 + FILES.indexOf(s[0]);
const sqName = i => FILES[i % 8] + (8 - Math.floor(i / 8));
const isWhite = p => p !== '' && p === p.toUpperCase();
const mine = (p, t) => p !== '' && isWhite(p) === (t === 'w');
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function parseFen(f) {
  const [rows, t, c, e] = f.split(' ');
  const b = [];
  for (const ch of rows.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) b.push('');
    else b.push(ch);
  }
  return { b, t, c: c === '-' ? '' : c, e: e === '-' ? -1 : sqOf(e) };
}

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const LINE = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const onBoard = (r, c) => r >= 0 && c >= 0 && r < 8 && c < 8;

function attacked(b, i, byWhite) {
  const r = i >> 3, c = i & 7;
  const is = (x, y, want) => onBoard(x, y) && b[x * 8 + y] === (byWhite ? want.toUpperCase() : want);
  for (const [a, d] of KNIGHT) if (is(r + a, c + d, 'n')) return true;
  for (const [a, d] of [...DIAG, ...LINE]) if (is(r + a, c + d, 'k')) return true;
  const pr = byWhite ? r + 1 : r - 1;
  if (is(pr, c - 1, 'p') || is(pr, c + 1, 'p')) return true;
  for (const [dirs, slider] of [[DIAG, 'b'], [LINE, 'r']]) {
    for (const [a, d] of dirs) {
      for (let x = r + a, y = c + d; onBoard(x, y); x += a, y += d) {
        const p = b[x * 8 + y];
        if (!p) continue;
        if (isWhite(p) === byWhite && (p.toLowerCase() === slider || p.toLowerCase() === 'q')) return true;
        break;
      }
    }
  }
  return false;
}
const kingSq = (b, t) => b.indexOf(t === 'w' ? 'K' : 'k');
const inCheck = (pos, t) => attacked(pos.b, kingSq(pos.b, t), t !== 'w');

function pseudoMoves(pos) {
  const { b, t } = pos, out = [];
  const add = (from, to) => out.push({ from, to });
  b.forEach((p, i) => {
    if (!mine(p, t)) return;
    const r = i >> 3, c = i & 7, kind = p.toLowerCase();
    if (kind === 'p') {
      const dir = t === 'w' ? -1 : 1, home = t === 'w' ? 6 : 1;
      if (!b[(r + dir) * 8 + c]) {
        add(i, (r + dir) * 8 + c);
        if (r === home && !b[(r + 2 * dir) * 8 + c]) add(i, (r + 2 * dir) * 8 + c);
      }
      for (const d of [-1, 1]) {
        if (!onBoard(r + dir, c + d)) continue;
        const to = (r + dir) * 8 + c + d;
        if ((b[to] && !mine(b[to], t)) || to === pos.e) add(i, to);
      }
    } else if (kind === 'n' || kind === 'k') {
      for (const [a, d] of kind === 'n' ? KNIGHT : [...DIAG, ...LINE]) {
        if (onBoard(r + a, c + d) && !mine(b[(r + a) * 8 + c + d], t)) add(i, (r + a) * 8 + c + d);
      }
    } else {
      const dirs = kind === 'b' ? DIAG : kind === 'r' ? LINE : [...DIAG, ...LINE];
      for (const [a, d] of dirs) {
        for (let x = r + a, y = c + d; onBoard(x, y); x += a, y += d) {
          const to = x * 8 + y;
          if (mine(b[to], t)) break;
          add(i, to);
          if (b[to]) break;
        }
      }
    }
  });
  const foe = t !== 'w', home = t === 'w' ? 60 : 4;
  if (b[home] === (t === 'w' ? 'K' : 'k') && !attacked(b, home, foe)) {
    const [k, q] = t === 'w' ? ['K', 'Q'] : ['k', 'q'];
    if (pos.c.includes(k) && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, foe)) add(home, home + 2);
    if (pos.c.includes(q) && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, foe)) add(home, home - 2);
  }
  return out;
}

function applyMove(pos, m) {
  const b = pos.b.slice(), p = b[m.from], kind = p.toLowerCase();
  let e = -1;
  if (kind === 'p' && m.to === pos.e) b[(m.from & ~7) + (m.to & 7)] = '';
  if (kind === 'p' && Math.abs(m.to - m.from) === 16) e = (m.to + m.from) / 2;
  b[m.to] = p;
  b[m.from] = '';
  if (kind === 'p' && (m.to < 8 || m.to >= 56)) b[m.to] = isWhite(p) ? 'Q' : 'q';
  if (kind === 'k' && Math.abs(m.to - m.from) === 2) {
    const [rf, rt] = m.to > m.from ? [m.to + 1, m.to - 1] : [m.to - 2, m.to + 1];
    b[rt] = b[rf];
    b[rf] = '';
  }
  const drop = { 60: 'KQ', 4: 'kq', 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };
  let c = pos.c;
  for (const s of [m.from, m.to]) if (drop[s]) c = [...c].filter(x => !drop[s].includes(x)).join('');
  return { b, t: pos.t === 'w' ? 'b' : 'w', c, e };
}

const legalMoves = pos => pseudoMoves(pos).filter(m => !inCheck(applyMove(pos, m), pos.t));
const fromUci = u => ({ from: sqOf(u.slice(0, 2)), to: sqOf(u.slice(2, 4)) });
const moveText = (pos, m) => {
  const p = pos.b[m.from].toUpperCase();
  return (p === 'P' ? '' : p) + (pos.b[m.to] ? '×' : '') + sqName(m.to);
};
const isMate = pos => !legalMoves(pos).length && inCheck(pos, pos.t);

/* The reply when the player leaves the puzzle line: mates if it can, otherwise
   the best material trade one move ahead. Deliberately shallow. */
function bestReply(pos) {
  const moves = shuffle(legalMoves(pos));
  let best = moves[0], top = -Infinity;
  for (const m of moves) {
    const next = applyMove(pos, m);
    if (isMate(next)) return m;
    const gain = VALUE[pos.b[m.to].toLowerCase()] || 0;
    let loss = 0;
    for (const x of pseudoMoves(next)) {
      if (next.b[x.to]) loss = Math.max(loss, VALUE[next.b[x.to].toLowerCase()]);
    }
    if (gain - loss > top) { top = gain - loss; best = m; }
  }
  return best;
}
