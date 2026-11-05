'use strict';
/* Bookmarks: mode ids in the order they were added. Ids of removed modes are ignored. */
const FAV_KEY = 'layover.favourites';
const readFavs = () => store.get(FAV_KEY, []).filter(id => Modes.has(id));
const STAR_ON = '★︎', STAR_OFF = '☆︎';

function toggleFav(id) {
  const favs = readFavs();
  const adding = !favs.includes(id);
  store.set(FAV_KEY, adding ? [...favs, id] : favs.filter(x => x !== id));
  return adding;
}

function paintFav(id) {
  const on = readFavs().includes(id), b = $('favBtn');
  b.textContent = on ? STAR_ON : STAR_OFF;
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', on);
}

function renderHome() {
  const home = $('home'), top = home.scrollTop;
  const favs = readFavs();
  const card = m => {
    const wrap = el('div', 'card-wrap');
    const b = el('button', 'card');
    b.type = 'button';
    b.append(el('b', '', m.name), el('span', '', m.blurb));
    b.onclick = () => openMode(m.id);
    const on = favs.includes(m.id);
    const star = el('button', 'star' + (on ? ' on' : ''), on ? STAR_ON : STAR_OFF);
    star.type = 'button';
    star.setAttribute('aria-label', `Bookmark ${m.name}`);
    star.setAttribute('aria-pressed', on);
    star.onclick = () => { toggleFav(m.id); renderHome(); };
    wrap.append(b, star);
    return wrap;
  };
  const section = (name, list) => {
    const cards = el('div', 'cards');
    cards.append(...list.map(card));
    return [el('div', 'group', name), cards];
  };

  const brand = el('div', 'brand');
  brand.append(el('h1', '', 'Layover'), el('p', '', `${Modes.size} games. No internet needed.`));
  const parts = [brand];
  if (favs.length) parts.push(...section('Bookmarks', favs.map(id => Modes.get(id))));
  else parts.push(el('p', 'fav-hint', 'Tap a star to pin a game up here.'));
  const groups = {};
  for (const m of Modes.values()) (groups[m.group] = groups[m.group] || []).push(m);
  for (const [name, list] of Object.entries(groups)) parts.push(...section(name, list));
  parts.push(el('p', 'foot', 'Open once with internet, then it works in airplane mode.'));
  home.replaceChildren(...parts);
  home.scrollTop = top;
}

function goHome() {
  leave();
  $('screen').hidden = true;
  $('home').hidden = false;
  renderHome();
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || !ctxNow) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (ctxNow.ended && !$('result').hidden && !$('nextBtn').hidden) $('nextBtn').click();
    else if (ctxNow.keys) ctxNow.keys('enter');
    return;
  }
  if (!ctxNow.keys) return;
  if (e.key === 'Backspace') ctxNow.keys('back');
  else if (e.key.length === 1) ctxNow.keys(e.key.toLowerCase());
  else if (e.key.startsWith('Arrow')) { e.preventDefault(); ctxNow.keys(e.key.toLowerCase()); }
});

$('favBtn').addEventListener('click', () => {
  const id = ctxNow.id;
  toast(toggleFav(id) ? 'Bookmarked' : 'Bookmark removed');
  paintFav(id);
});
$('backBtn').addEventListener('click', goHome);
$('helpBtn').addEventListener('click', showHelp);
$('statsBtn').addEventListener('click', showStats);
$('nextBtn').addEventListener('click', () => {
  const m = [...Modes.values()].find(x => x.name === $('title').textContent);
  openMode(m.id, true);
});

renderHome();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
