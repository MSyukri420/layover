'use strict';
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

reg({
  id: 'chess', group: 'Logic puzzles', name: 'Chess Clues', blurb: 'Find the winning moves in six attempts',
  help: [
    'Play the winning line, then tap Submit. Your opponent replies between your moves. Tap a piece then a square, or drag it.',
    'Orange: right piece, right square. Green: right piece, wrong square. Violet: right square, wrong piece. Dim: neither.',
    'A different checkmate also wins. You get six attempts. Pawns promote to queens.',
  ],
  run(ctx) {
    const s = ctx.saved || { line: deal('layover.deck.chess', CHESS), tries: [] };
    const [fen, uci] = s.line.split('|');
    const script = uci.split(' ');
    const base = applyMove(parseFen(fen), fromUci(script[0]));
    const solution = script.filter((_, i) => i % 2);
    const need = solution.length, flip = base.t === 'b';
    const at = (r, c) => (flip ? 63 - (r * 8 + c) : r * 8 + c);

    let pos = base, played = [], stack = [], sel = -1, targets = [], lastMove = null, grabbed = -1, over = -1;

    const info = el('p', 'prompt', `${base.t === 'w' ? 'White' : 'Black'} to move. Find ${need} moves.`);
    ctx.root.append(info);
    const { grid, cells } = makeGrid(ctx.root, 8, (d, r, c) => d.classList.add((r + c) % 2 ? 'dk' : 'lt'));
    grid.classList.add('chessboard');
    const log = el('div', 'move-log');
    ctx.root.append(log);
    const row = el('div', 'row-btns');
    const back = el('button', 'btn', 'Take back'), send = el('button', 'btn', 'Submit');
    row.append(back, send);
    ctx.root.append(row);

    const pill = (text, cls) => el('span', 'mv ' + cls, text);
    const finished = () => played.length === need || !legalMoves(pos).length;

    function paint() {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const i = at(r, c), p = pos.b[i], d = cells[r][c];
          d.classList.toggle('sel', i === sel);
          d.classList.toggle('tgt', targets.includes(i));
          d.classList.toggle('last', !!lastMove && (i === lastMove.from || i === lastMove.to));
          d.classList.toggle('wp', isWhite(p));
          d.classList.toggle('bp', !!p && !isWhite(p));
          d.textContent = p ? GLYPH[p.toLowerCase()] + '︎' : '';
        }
      }
      const rows = s.tries.map(t => {
        const line = el('div', 'mv-row');
        t.forEach(m => line.append(pill(m.text, m.grade)));
        return line;
      });
      if (!ctx.ended) {
        const live = el('div', 'mv-row');
        for (let i = 0; i < need; i++) live.append(pill(played[i]?.text ?? '·', 'open'));
        rows.push(live);
      }
      log.replaceChildren(...rows);
      log.scrollTop = log.scrollHeight;
      send.classList.toggle('on', !!played.length && finished());
    }

    function play(m) {
      const onLine = played.every((x, i) => uciOf(x.m) === solution[i].slice(0, 4));
      stack.push(pos);
      played.push({ m, text: moveText(pos, m) });
      pos = applyMove(pos, m);
      lastMove = m;
      sel = -1;
      targets = [];
      if (played.length < need && legalMoves(pos).length) {
        const stillOn = onLine && uciOf(m) === solution[played.length - 1].slice(0, 4);
        const reply = stillOn ? fromUci(script[played.length * 2]) : bestReply(pos);
        pos = applyMove(pos, reply);
        lastMove = reply;
      }
      paint();
    }
    const uciOf = m => sqName(m.from) + sqName(m.to);

    function pick(i) {
      if (ctx.ended || finished()) return;
      if (sel >= 0 && targets.includes(i)) {
        play(legalMoves(pos).find(m => m.from === sel && m.to === i));
        return;
      }
      sel = mine(pos.b[i], pos.t) ? i : -1;
      targets = sel < 0 ? [] : legalMoves(pos).filter(m => m.from === sel).map(m => m.to);
      paint();
    }

    function grade() {
      return played.map((x, i) => {
        const want = fromUci(solution[i]);
        const samePiece = x.m.from === want.from, sameSquare = x.m.to === want.to;
        const g = samePiece && sameSquare ? 'correct' : samePiece ? 'present' : sameSquare ? 'near' : 'absent';
        return { text: x.text, grade: g };
      });
    }

    function solutionText() {
      let p = base;
      return solution.map((u, i) => {
        const t = moveText(p, fromUci(u));
        p = applyMove(p, fromUci(u));
        if (script[(i + 1) * 2]) p = applyMove(p, fromUci(script[(i + 1) * 2]));
        return t;
      }).join(', ');
    }

    send.onclick = () => {
      if (ctx.ended) return;
      if (!played.length || !finished()) return toast(`Play all ${need} moves first`);
      const g = grade();
      const mated = isMate(pos);
      const won = mated || (g.length === need && g.every(m => m.grade === 'correct'));
      if (mated) g.forEach(m => { m.grade = 'correct'; });
      s.tries.push(g);
      ctx.save(s);
      const lost = !won && s.tries.length === 6;
      if (won || lost) {
        ctx.finish({
          won, guesses: won ? s.tries.length : null, delay: 400,
          title: won ? `Solved in ${s.tries.length} of 6` : 'Out of attempts. The line was',
          word: won ? 'Winning line found' : solutionText(),
        });
      }
      pos = won ? pos : base;
      played = won ? played : [];
      stack = [];
      lastMove = won ? lastMove : null;
      paint();
    };
    back.onclick = () => {
      if (ctx.ended || !stack.length) return;
      pos = stack.pop();
      played.pop();
      lastMove = null;
      sel = -1;
      targets = [];
      paint();
    };
    dragCells(grid, {
      start(r, c) { grabbed = over = at(r, c); pick(grabbed); },
      move(r, c) { over = at(r, c); },
      end() { if (sel >= 0 && over !== grabbed && targets.includes(over)) pick(over); },
    });
    paint();
  },
});
