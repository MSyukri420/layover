'use strict';
/* Snake */
reg({
  id: 'snake', group: 'Arcade', name: 'Snake', scored: true, blurb: 'Eat, grow and avoid your tail',
  help: ['Swipe to steer. Eat the sun to grow. Hitting a wall or your own tail ends the run, and it speeds up as you score.'],
  run(ctx) {
    const n = 16;
    const top = el('div', 'bar-top', 'Score 0');
    const fit = el('div', 'fit');
    const cv = el('canvas');
    fit.append(cv);
    ctx.root.append(top, fit);
    const px = cv.width = cv.height = 640;
    const g = cv.getContext('2d'), u = px / n;
    let snake = [[8, 5], [8, 4], [8, 3]], dir = [0, 1], want = dir, sun, score = 0, timer;
    const place = () => {
      do { sun = [rint(n), rint(n)]; } while (snake.some(p => p[0] === sun[0] && p[1] === sun[1]));
    };
    function draw() {
      g.fillStyle = '#161617';
      g.fillRect(0, 0, px, px);
      g.fillStyle = '#ffb347';
      g.beginPath();
      g.arc((sun[1] + .5) * u, (sun[0] + .5) * u, u * .42, 0, 7);
      g.fill();
      snake.forEach(([r, c], i) => {
        g.fillStyle = i ? '#58c4ff' : '#f2f4fb';
        g.beginPath();
        g.roundRect(c * u + 2, r * u + 2, u - 4, u - 4, 8);
        g.fill();
      });
    }
    function step() {
      dir = want;
      const head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
      const eat = head[0] === sun[0] && head[1] === sun[1];
      const body = eat ? snake : snake.slice(0, -1);
      const dead = head[0] < 0 || head[1] < 0 || head[0] >= n || head[1] >= n || body.some(p => p[0] === head[0] && p[1] === head[1]);
      if (dead) return ctx.finish({ won: score > 0, score, title: 'Crashed. Final score', word: String(score) });
      snake = [head, ...body];
      if (eat) {
        score++;
        top.textContent = `Score ${score}`;
        place();
        clearInterval(timer);
        timer = ctx.every(step, Math.max(85, 170 - score * 5));
      }
      draw();
    }
    const steer = d => { if (d[0] + dir[0] || d[1] + dir[1]) want = d; };
    const ARROWS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
    ctx.keys = k => { if (ARROWS[k]) steer(ARROWS[k]); };
    let sx = 0, sy = 0;
    fit.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    fit.style.touchAction = 'none';
    fit.addEventListener('pointermove', e => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      steer(Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0]);
      sx = e.clientX;
      sy = e.clientY;
    });
    place();
    draw();
    timer = ctx.every(step, 170);
  },
});

/* World quizzes */
const flagOf = code => String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
function quiz(ctx, ask) {
  const rounds = shuffle(WORLD).slice(0, 10);
  let i = 0, right = 0;
  const top = el('div', 'bar-top');
  const col = el('div', 'center-col');
  const options = el('div', 'options');
  ctx.root.append(top, col, options);
  function next() {
    if (i === rounds.length) {
      return ctx.finish({ won: right >= 6, score: right, title: 'Final score', word: `${right} of ${rounds.length}`, delay: 0 });
    }
    const q = ask(rounds[i]);
    top.textContent = `Question ${i + 1} of ${rounds.length} · Score ${right}`;
    col.replaceChildren(...q.show());
    const wrong = shuffle(WORLD.filter(w => q.value(w) !== q.answer)).slice(0, 3).map(q.value);
    let locked = false;
    options.replaceChildren(...shuffle([q.answer, ...wrong]).map(text => {
      const b = el('button', 'option', text);
      b.onclick = () => {
        if (locked) return;
        locked = true;
        if (text === q.answer) { right++; b.classList.add('right'); }
        else {
          b.classList.add('wrong');
          [...options.children].find(x => x.textContent === q.answer).classList.add('right');
        }
        i++;
        setTimeout(() => { if (!ctx.ended) next(); }, 900);
      };
      return b;
    }));
  }
  next();
}
reg({
  id: 'capitals', group: 'World quizzes', name: 'Capitals', scored: true, blurb: 'Ten countries, name each capital',
  help: ['Pick the capital of each country. Ten questions per round, and six correct counts as a win.'],
  run: ctx => quiz(ctx, ([name, capital]) => ({
    answer: capital, value: w => w[1],
    show: () => [el('p', 'quiz-q', name)],
  })),
});
reg({
  id: 'flags', group: 'World quizzes', name: 'Flags', scored: true, blurb: 'Ten flags, name each country',
  help: ['Pick the country for each flag. Ten questions per round, and six correct counts as a win.'],
  run: ctx => quiz(ctx, ([name, , code]) => ({
    answer: name, value: w => w[0],
    show: () => [el('div', 'flag', flagOf(code))],
  })),
});
