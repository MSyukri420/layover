'use strict';
const RAD = Math.PI / 180;
const RENAME = {
  'Bosnia and Herz.': 'Bosnia and Herzegovina', 'Central African Rep.': 'Central African Republic',
  Congo: 'Republic of the Congo', 'Dem. Rep. Congo': 'DR Congo', 'Dominican Rep.': 'Dominican Republic',
  'Eq. Guinea': 'Equatorial Guinea', Macedonia: 'North Macedonia', 'S. Sudan': 'South Sudan',
  'Solomon Is.': 'Solomon Islands', 'United States of America': 'United States',
  eSwatini: 'Eswatini', "Côte d'Ivoire": 'Ivory Coast',
};
/* Drawn on the globe but not part of the game: territories and disputed areas. */
const NOT_PLAYED = new Set(['Antarctica', 'Falkland Is.', 'Fr. S. Antarctic Lands', 'Greenland', 'N. Cyprus',
  'New Caledonia', 'Puerto Rico', 'Somaliland', 'W. Sahara', 'Kosovo', 'Taiwan', 'Palestine']);

const unit = ([lon, lat]) => {
  const a = lon * RAD, b = lat * RAD;
  return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
};

let geoCache;
function geo() {
  if (geoCache) return geoCache;
  const [sx, sy] = GEO.transform.scale, [tx, ty] = GEO.transform.translate;
  const arcs = GEO.arcs.map(a => {
    let x = 0, y = 0;
    return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
  const ringOf = ids => {
    const out = [];
    for (const id of ids) {
      const a = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
      out.push(...(out.length ? a.slice(1) : a));
    }
    return out;
  };
  const shapes = GEO.objects.countries.geometries.map(g => {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    const rings = polys.flat().map(ringOf);
    const area = r => Math.abs(r.reduce((t, p, i) => {
      const q = r[(i + 1) % r.length];
      return t + p[0] * q[1] - q[0] * p[1];
    }, 0));
    const main = rings.reduce((a, b) => (area(b) > area(a) ? b : a));
    const sum = main.map(unit).reduce((t, v) => [t[0] + v[0], t[1] + v[1], t[2] + v[2]], [0, 0, 0]);
    const raw = g.properties.name;
    return {
      raw, name: RENAME[raw] || raw, rings,
      points: rings.flat().map(unit),
      lon: Math.atan2(sum[1], sum[0]) / RAD,
      lat: Math.atan2(sum[2], Math.hypot(sum[0], sum[1])) / RAD,
    };
  }).filter(c => c.raw !== 'Antarctica');
  const playable = shapes.filter(c => !NOT_PLAYED.has(c.raw)).sort((a, b) => a.name.localeCompare(b.name));
  return (geoCache = { shapes, playable, byName: new Map(playable.map(c => [c.name, c])) });
}

const keyOf = n => n.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const EARTH = 6371;

/* Gap between the two countries' nearest border points, so neighbours read as 0 km. */
function gapKm(a, b) {
  let best = -1;
  for (const p of a.points) {
    for (const q of b.points) {
      const d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      if (d > best) best = d;
    }
  }
  return Math.round(Math.acos(Math.min(1, best)) * EARTH);
}
function arrow(a, b) {
  const p = a.lat * RAD, q = b.lat * RAD, d = (b.lon - a.lon) * RAD;
  const deg = Math.atan2(Math.sin(d) * Math.cos(q), Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(d)) / RAD;
  return '↑↗→↘↓↙←↖'[Math.round(((deg + 360) % 360) / 45) % 8];
}
function heat(km) {
  const STOPS = [[0, [255, 59, 48]], [400, [255, 122, 47]], [1500, [255, 179, 71]], [4000, [127, 209, 199]], [9000, [74, 123, 216]], [20000, [63, 95, 168]]];
  for (let i = 1; i < STOPS.length; i++) {
    if (km <= STOPS[i][0]) {
      const [x0, c0] = STOPS[i - 1], [x1, c1] = STOPS[i], t = (km - x0) / (x1 - x0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',')})`;
    }
  }
  return 'rgb(63,95,168)';
}

function drawGlobe(g, size, view, colours) {
  const R = size / 2 * 0.97 * view.zoom, cx = size / 2, cy = size / 2;
  const p0 = view.lat * RAD, s0 = Math.sin(p0), c0 = Math.cos(p0);
  const project = ([lon, lat]) => {
    const l = (lon - view.lon) * RAD, p = lat * RAD, cp = Math.cos(p), sp = Math.sin(p);
    let x = cp * Math.sin(l), y = c0 * sp - s0 * cp * Math.cos(l);
    const z = s0 * sp + c0 * cp * Math.cos(l);
    if (z < 0) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; }
    return [cx + R * x, cy - R * y, z];
  };
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = '#1c1c1f';
  g.fill();
  g.clip();

  g.strokeStyle = 'rgba(200,200,205,.12)';
  g.lineWidth = 1;
  for (let lon = -180; lon < 180; lon += 30) {
    g.beginPath();
    let pen = false;
    for (let lat = -90; lat <= 90; lat += 6) {
      const [x, y, z] = project([lon, lat]);
      if (z < 0) { pen = false; continue; }
      if (pen) g.lineTo(x, y); else g.moveTo(x, y);
      pen = true;
    }
    g.stroke();
  }

  for (const c of geo().shapes) {
    g.beginPath();
    let any = false;
    for (const ring of c.rings) {
      const pts = ring.map(project);
      if (!pts.some(p => p[2] >= 0)) continue;
      any = true;
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    }
    if (!any) continue;
    g.fillStyle = colours[c.name] || '#4a4a4f';
    g.fill('evenodd');
    g.strokeStyle = 'rgba(22,22,23,.75)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.restore();
}

reg({
  id: 'globe', group: 'World quizzes', name: 'Mystery Country', blurb: 'Six guesses, follow the heat on a globe',
  help: [
    'Find the mystery country in six guesses. Each guess is painted on the globe by distance: blue is far, then pale, then orange, and red is very close.',
    'You also get the distance from border to border, so 0 km means it’s a neighbour, and an arrow pointing the way.',
    'Drag to spin the globe. Very small countries, such as Malta or Singapore, aren’t in this game.',
  ],
  run(ctx) {
    const { playable, byName } = geo();
    const s = ctx.saved || { target: deal('layover.deck.globe', playable).name, guesses: [] };
    const target = byName.get(s.target);
    const view = { lon: 10, lat: 20, zoom: 1 };
    const colours = {};

    const top = el('div', 'bar-top');
    const fit = el('div', 'fit globe-wrap');
    const cv = el('canvas', 'globe');
    const px = cv.width = cv.height = 720;
    const g = cv.getContext('2d');
    const plus = el('button', 'zoom plus', '+'), minus = el('button', 'zoom minus', '−');
    plus.setAttribute('aria-label', 'Zoom in');
    minus.setAttribute('aria-label', 'Zoom out');
    fit.append(cv, plus, minus);
    const list = el('div', 'chips guess-list');
    const sugg = el('div', 'sugg');
    ctx.root.append(top, fit, list, sugg);

    let queued = false;
    const redraw = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; drawGlobe(g, px, view, colours); });
    };
    function focus(c) {
      const from = { lon: view.lon, lat: view.lat };
      const dLon = ((c.lon - from.lon + 540) % 360) - 180;
      let frame = 0;
      const step = () => {
        if (!cv.isConnected) return;
        frame++;
        const t = frame / 24, e = t * t * (3 - 2 * t);
        view.lon = from.lon + dLon * e;
        view.lat = from.lat + (c.lat - from.lat) * e;
        drawGlobe(g, px, view, colours);
        if (frame < 24) setTimeout(step, 16);
      };
      step();
    }
    const zoom = f => { view.zoom = Math.min(8, Math.max(1, view.zoom * f)); redraw(); };
    plus.onclick = () => zoom(1.6);
    minus.onclick = () => zoom(1 / 1.6);

    let drag = null;
    cv.addEventListener('pointerdown', e => {
      drag = [e.clientX, e.clientY];
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = 0.35 / view.zoom;
      view.lon -= (e.clientX - drag[0]) * k;
      view.lat = Math.max(-85, Math.min(85, view.lat + (e.clientY - drag[1]) * k));
      drag = [e.clientX, e.clientY];
      redraw();
    });
    const endDrag = () => { drag = null; };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);

    function paintGuesses() {
      top.textContent = `${s.guesses.length} of 6 guesses`;
      const rows = s.guesses.map(n => {
        const c = byName.get(n), km = gapKm(c, target);
        colours[n] = heat(km);
        const line = el('span', 'chip guess', n === s.target ? `${n} ✓` : `${n} ${km.toLocaleString('en-US')} km ${arrow(c, target)}`);
        line.style.boxShadow = `inset 4px 0 0 ${colours[n]}`;
        return line;
      });
      list.replaceChildren(...rows.reverse());
    }

    function submit(name) {
      if (ctx.ended) return;
      if (s.guesses.includes(name)) return toast('Already guessed');
      s.guesses.push(name);
      ctx.save(s);
      t.clear();
      paintGuesses();
      const c = byName.get(name), won = name === s.target, out = won || s.guesses.length === 6;
      if (won) colours[name] = '#ffb347';
      else if (out) colours[s.target] = '#ffffff';
      focus(out ? target : c);
      if (out) {
        ctx.finish({
          won, guesses: won ? s.guesses.length : null, delay: 700,
          title: won ? `Found in ${s.guesses.length} of 6` : 'Out of guesses. It was', word: s.target,
        });
      }
    }

    const matches = cur => {
      const k = keyOf(cur);
      if (!k) return [];
      const names = playable.map(c => c.name);
      const starts = names.filter(n => keyOf(n).startsWith(k));
      return [...starts, ...names.filter(n => !starts.includes(n) && keyOf(n).includes(k))].slice(0, 12);
    };
    const t = typer(ctx, ctx.root, {
      max: 22,
      change(cur) {
        sugg.replaceChildren(...matches(cur).map(n => {
          const b = el('button', 'chip pick', n);
          b.type = 'button';
          b.onclick = () => submit(n);
          return b;
        }));
      },
      enter(cur) {
        const m = matches(cur);
        if (!m.length) return toast('No country matches that');
        const exact = m.find(n => keyOf(n) === keyOf(cur));
        if (!exact && m.length > 1) return toast('Tap a country below');
        submit(exact || m[0]);
      },
    });
    paintGuesses();
    drawGlobe(g, px, view, colours);
    if (s.guesses.length) focus(byName.get(s.guesses.at(-1)));
  },
});
