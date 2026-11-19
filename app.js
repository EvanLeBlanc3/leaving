/* =====================================================================
   LEAVING — how long until you have to bolt for the L
   Chicago CTA real-time PWA • iPhone-first • portrait-locked
   ===================================================================== */
'use strict';

const VERSION = '1.1.0';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LINES = {
  Red:  { name: 'Red',    c: '#C60C30', t: '#fff', pos: 'red'  },
  Blue: { name: 'Blue',   c: '#00A1DE', t: '#fff', pos: 'blue' },
  Brn:  { name: 'Brown',  c: '#62361B', t: '#fff', pos: 'brn'  },
  G:    { name: 'Green',  c: '#009B3A', t: '#fff', pos: 'g'    },
  Org:  { name: 'Orange', c: '#F9461C', t: '#fff', pos: 'org'  },
  P:    { name: 'Purple', c: '#522398', t: '#fff', pos: 'p'    },
  Pink: { name: 'Pink',   c: '#E27EA6', t: '#fff', pos: 'pink' },
  Y:    { name: 'Yellow', c: '#F9E300', t: '#111', pos: 'y'    }
};
const LINE_ORDER = Object.keys(LINES);
const POS_TO_RT = Object.fromEntries(LINE_ORDER.map(k => [LINES[k].pos, k]));
const L = rt => LINES[rt] || { name: rt || '?', c: '#41B6E6', t: '#04233A' };

const SPEEDS = {
  stroll: { label: 'Tourist', sub: 'admiring the Bean', mpm: 67 },
  walk:   { label: 'Commuter', sub: 'normal Chicagoan', mpm: 84 },
  hustle: { label: 'Late for Wrigley', sub: 'power walk', mpm: 107 }
};
const DOWNTOWN = { lat: 41.885737, lon: -87.630886, fake: true }; // Clark/Lake-ish
const TAGLINES = [
  'Chicago’s most punctual anxiety',
  'Stand clear of the closing doors, please',
  'Dibs on the forward-facing seat',
  'Because “the next one’s in 2 min” is a lie',
  'Powered by deep dish & real-time data',
  'Outrunning the Hawk since today'
];
const QUIPS = {
  go:   ['Plenty of time. Hydrate. Stretch. Be cool.', 'Stroll like you own a Lake Shore Drive condo.', 'You could tie your shoes twice. Don’t.', 'Calm as the lakefront at 6 a.m.'],
  soon: ['Shoes on. Keys. Ventra card. Go.', 'Brisk walk energy. Like it’s January.', 'Start moving with purpose, friend.', 'Wrap up that conversation. Politely.'],
  run:  ['RUN. Like the Bean is chasing you.', 'Sprint mode. (Please don’t hold the doors.)', 'Go go go! Pretend it’s the last Cubs W train.', 'Legs, don’t fail me now.'],
  gone: ['That one’s gone. Like a Bears lead.', 'Missed it. There’s always the next one.', 'It left without you. Rude.']
};
const FAV_ADD = ['★ Saved. It’s officially your stop now.', '★ Added. Dibs called.', '★ Favorited. Good taste, neighbor.'];

/* ------------------------------- storage -------------------------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const S = {
  settings: Object.assign({ server: '', apiKey: '', speed: 'walk', buffer: 1, defaultLead: 10, refresh: 10, chime: true }, store.get('lv_settings', {})),
  stations: [], byId: {},
  pos: null, posErr: null,
  // Favorites: ordered list of station ids, oldest first → each new favorite lands underneath the previous ones
  favs: [...new Set((store.get('lv_favs', []) || []).map(String))],
  alerts: store.get('lv_alerts', []).filter(a => !a.fired || Date.now() - a.createdAt < 6 * 3600e3),
  arr: {},
  tab: 'nearby', station: null, line: store.get('lv_line', 'Red'),
  query: '', showMore: false,
  positions: null, routes: null, svc: null, metaAt: 0,
  lastOk: 0, lastErr: null,
  sheet: null, vapid: null
};
const saveSettings = () => store.set('lv_settings', S.settings);
const saveAlerts = () => store.set('lv_alerts', S.alerts);
const saveFavs = () => store.set('lv_favs', S.favs);
const isFav = id => S.favs.includes(String(id));
const isSetup = () => !!(serverBase() || S.settings.apiKey.trim());
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/* --------------------------- rotation lock ------------------------------ */
function applyRotation() {
  const root = document.documentElement;
  root.classList.remove('rot-l', 'rot-r');
  const phone = Math.min(screen.width, screen.height) < 600;
  const land = window.innerWidth > window.innerHeight;
  if (!phone || !land) return;
  const ang = typeof window.orientation === 'number' ? window.orientation
    : (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : 90);
  root.classList.add(ang === 90 || ang === -270 ? 'rot-l' : 'rot-r');
}
window.addEventListener('resize', applyRotation);
window.addEventListener('orientationchange', () => setTimeout(applyRotation, 60));
if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});

/* -------------------------------- API ----------------------------------- */
function serverBase() { return (S.settings.server || '').trim().replace(/\/+$/, ''); }

async function getJSON(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { cache: 'no-store', ...opts, signal: ctl.signal });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    return await r.json();
  } finally { clearTimeout(t); }
}
const postJSON = (url, body) => getJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function ctaUrl(path, params = {}) {
  const base = serverBase();
  const qs = new URLSearchParams(params).toString();
  if (base) return `${base}${path}${qs ? '?' + qs : ''}`;
  const key = encodeURIComponent(S.settings.apiKey.trim());
  const T = 'https://lapi.transitchicago.com/api/1.0', A = 'https://www.transitchicago.com/api/1.0';
  switch (path) {
    case '/arrivals': return `${T}/ttarrivals.aspx?key=${key}&mapid=${params.mapid}&max=40&outputType=JSON`;
    case '/positions': return `${T}/ttpositions.aspx?key=${key}&rt=${params.rt}&outputType=JSON`;
    case '/follow': return `${T}/ttfollow.aspx?key=${key}&runnumber=${params.runnumber}&outputType=JSON`;
    case '/routes': return `${A}/routes.aspx?type=rail&outputType=JSON`;
    case '/service-alerts': return `${A}/alerts.aspx?activeonly=true&outputType=JSON&routeid=${params.routeid}`;
  }
  throw new Error('unknown path');
}

const T = s => Date.parse(s && s.length === 19 ? s + 'Z' : s); // CTA times are Chicago-local; we only diff them
function clock(s) {
  const m = /T(\d\d):(\d\d)/.exec(s || '');
  if (!m) return '';
  let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
function parseCTA(j) {
  const c = (j && j.ctatt) || {};
  if (c.errCd && String(c.errCd) !== '0') throw new Error(c.errNm || 'CTA error ' + c.errCd);
  return c;
}
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
function normEta(e, tmst, now) {
  return {
    rn: String(e.rn), rt: e.rt, staId: String(e.staId), stpId: String(e.stpId), staNm: e.staNm, stpDe: e.stpDe || '',
    destNm: e.destNm, trDr: e.trDr, at: now + (T(e.arrT) - T(tmst || e.prdt)), clock: clock(e.arrT),
    isApp: e.isApp === '1', isSch: e.isSch === '1', isDly: e.isDly === '1', isFlt: e.isFlt === '1'
  };
}

async function fetchArrivals(mapid) {
  try {
    const c = parseCTA(await getJSON(ctaUrl('/arrivals', { mapid })));
    const now = Date.now();
    S.arr[mapid] = { fetched: now, etas: arr(c.eta).map(e => normEta(e, c.tmst, now)).sort((a, b) => a.at - b.at) };
    S.lastOk = now; S.lastErr = null;
  } catch (e) {
    S.lastErr = e.name === 'AbortError' ? 'Timed out' : (e.message === 'Failed to fetch' || e.message === 'Load failed') ? 'Can’t reach server' : e.message;
    if (!S.arr[mapid]) S.arr[mapid] = { fetched: 0, etas: [], err: S.lastErr };
    else S.arr[mapid].err = S.lastErr;
  }
}

async function fetchLines() {
  const now = Date.now();
  const jobs = [];
  jobs.push(getJSON(ctaUrl('/positions', { rt: LINE_ORDER.map(k => LINES[k].pos).join(',') })).then(j => {
    const c = parseCTA(j); const t = Date.now(); const out = {};
    for (const r of arr(c.route)) {
      const rt = POS_TO_RT[String(r['@name'] || '').toLowerCase()];
      if (!rt) continue;
      out[rt] = arr(r.train).map(x => ({
        rn: String(x.rn), destNm: x.destNm, nextStaNm: x.nextStaNm, nextStaId: x.nextStaId, trDr: x.trDr,
        isApp: x.isApp === '1', isDly: x.isDly === '1', at: t + (T(x.arrT) - T(c.tmst || x.prdt))
      }));
    }
    S.positions = out; S.lastOk = t; S.lastErr = null;
  }).catch(e => { S.lastErr = e.message; }));
  if (now - S.metaAt > 60000) {
    S.metaAt = now;
    jobs.push(getJSON(ctaUrl('/routes')).then(j => { S.routes = arr((j.CTARoutes || {}).RouteInfo); }).catch(() => {}));
    jobs.push(getJSON(ctaUrl('/service-alerts', { routeid: LINE_ORDER.join(',') })).then(j => { S.svc = arr((j.CTAAlerts || {}).Alert); }).catch(() => {}));
  }
  await Promise.all(jobs);
}

/* ------------------------------ stations -------------------------------- */
const truthy = v => v === true || v === 'true' || v === 1 || v === '1';
function buildStations(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const id = String(r.map_id || '');
    let lat, lon; const loc = r.location;
    if (loc) {
      if (loc.latitude) { lat = +loc.latitude; lon = +loc.longitude; }
      else if (loc.coordinates) { lon = +loc.coordinates[0]; lat = +loc.coordinates[1]; }
    }
    if (!id || !lat || !lon) continue;
    let s = m.get(id);
    if (!s) { s = { mapid: id, name: r.station_name, desc: r.station_descriptive_name || r.station_name, lat, lon, lines: new Set(), ada: false }; m.set(id, s); }
    if (truthy(r.red)) s.lines.add('Red');
    if (truthy(r.blue)) s.lines.add('Blue');
    if (truthy(r.g)) s.lines.add('G');
    if (truthy(r.brn)) s.lines.add('Brn');
    if (truthy(r.p) || truthy(r.pexp)) s.lines.add('P');
    if (truthy(r.y)) s.lines.add('Y');
    if (truthy(r.pnk)) s.lines.add('Pink');
    if (truthy(r.o)) s.lines.add('Org');
    if (truthy(r.ada)) s.ada = true;
  }
  return [...m.values()].map(s => ({ ...s, lines: LINE_ORDER.filter(l => s.lines.has(l)) }));
}
function buildStations2(rows) { // fallback dataset
  const names = { Red: /red/i, Blue: /blue/i, Brn: /brown/i, G: /green/i, Org: /orange/i, P: /purple/i, Pink: /pink/i, Y: /yellow/i };
  return (rows || []).map(r => {
    const g = r.the_geom && r.the_geom.coordinates;
    if (!g || !r.station_id) return null;
    const lines = LINE_ORDER.filter(k => names[k].test(r.lines || ''));
    return { mapid: String(r.station_id), name: r.longname, desc: r.longname, lat: +g[1], lon: +g[0], lines, ada: truthy(r.ada) };
  }).filter(Boolean);
}
function setStations(list) {
  S.stations = list;
  S.byId = Object.fromEntries(list.map(s => [s.mapid, s]));
}
async function loadStations(force) {
  const cached = store.get('lv_stations', null);
  if (cached && cached.list && cached.list.length > 100) {
    setStations(cached.list);
    if (!force && Date.now() - cached.ts < 7 * 864e5) return;
  }
  const tries = [];
  if (serverBase()) tries.push([serverBase() + '/stations', buildStations]);
  tries.push(['https://data.cityofchicago.org/resource/8pix-ypme.json?$limit=1000', buildStations]);
  tries.push(['https://data.cityofchicago.org/resource/3tzw-cg4m.json?$limit=500', buildStations2]);
  for (const [u, fn] of tries) {
    try {
      const list = fn(await getJSON(u));
      if (list.length > 100) { setStations(list); store.set('lv_stations', { ts: Date.now(), list }); return; }
    } catch {}
  }
}

/* ------------------------------ geo + walk ------------------------------ */
function dist(a, b) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const origin = () => S.pos || DOWNTOWN;
function nearest(n) {
  if (!S.stations.length) return [];
  const o = origin();
  return S.stations.map(s => ({ s, d: dist(o, s) })).sort((a, b) => a.d - b.d).slice(0, n).map(x => x.s);
}
function walkInfo(st) {
  if (!S.pos || S.pos.fake || !st || st.lat == null) return null;
  const d = dist(S.pos, st);
  const walkMin = (d * 1.25) / SPEEDS[S.settings.speed].mpm; // 1.25 = city grid detour factor
  const total = walkMin + Number(S.settings.buffer || 0);
  if (walkMin > 60) return { d, walkMin, far: true };
  return { d, walkMin, total, ms: total * 60000 };
}
function fmtDist(m) {
  const mi = m / 1609.34;
  if (mi < 0.1) return `${Math.max(50, Math.round(m * 3.281 / 50) * 50)} ft`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

let geoWatch = null;
function startGeo() {
  if (!('geolocation' in navigator)) { S.posErr = 'unavailable'; S.pos = DOWNTOWN; return; }
  if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch);
  let lastRender = 0;
  geoWatch = navigator.geolocation.watchPosition(p => {
    const first = !S.pos || S.pos.fake;
    S.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, ts: Date.now() };
    S.posErr = null;
    if (first) { updateDynamic(); refreshNow(); }
    else if (Date.now() - lastRender > 15000) { lastRender = Date.now(); updateDynamic(); }
  }, err => {
    S.posErr = err.code === 1 ? 'denied' : 'unavailable';
    if (!S.pos) { S.pos = DOWNTOWN; updateDynamic(); refreshNow(); }
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}

/* ------------------------------ time helpers ---------------------------- */
function minsHTML(at, app) {
  const s = (at - Date.now()) / 1000;
  if (s <= 30 || (app && s < 90)) return 'Due';
  return `${Math.max(1, Math.round(s / 60))}<small>min</small>`;
}
function leaveState(leaveAt) {
  const secs = (leaveAt - Date.now()) / 1000;
  if (secs > 300) return { secs, cls: 'go', label: `Leave in ${Math.floor(secs / 60)} min` };
  if (secs > 60) return { secs, cls: 'soon', label: `Leave in ${Math.floor(secs / 60)} min` };
  if (secs > 0) return { secs, cls: 'run', label: 'Leave now' };
  if (secs > -60) return { secs, cls: 'run', label: 'Run!' };
  return { secs, cls: 'gone', label: 'Missed it' };
}
const mmss = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const pick = (list, seed) => list[Math.abs([...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % list.length];

/* ------------------------------ UI bits --------------------------------- */
const bullet = rt => { const l = L(rt); return `<span class="bullet" style="background:${l.c};color:${l.t}">${esc(l.name)}</span>`; };
const lineBars = lines => `<div class="linebars">${(lines.length ? lines : ['x']).map(k => `<i style="background:${L(k).c}"></i>`).join('')}</div>`;
const favBtn = id => `<button class="fav ${isFav(id) ? 'on' : ''}" data-fav="${id}" aria-label="${isFav(id) ? 'Remove favorite' : 'Add favorite'}">${isFav(id) ? '★' : '☆'}</button>`;
let toastT;
function toast(msg, ms = 3800) {
  const t = $('#toast'); t.innerHTML = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

/* CTA-ish door chime (ding-dong) */
let actx = null;
function unlockAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {} }
function chime() {
  if (!S.settings.chime || !actx) return;
  const now = actx.currentTime;
  [[784, 0], [622, 0.42]].forEach(([f, t]) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + t);
    g.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.9);
    o.connect(g).connect(actx.destination); o.start(now + t); o.stop(now + t + 1);
  });
}

/* Skyline with a tiny L train scooting along the tracks */
function skylineSVG() {
  const W = 390, H = 40, f = '#06101E';
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const parts = [];
  let x = 0;
  while (x < W) {
    const w = 7 + rnd() * 12, h = 8 + rnd() * 16;
    parts.push(`<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${f}"/>`);
    for (let i = 0; i < 3; i++) if (rnd() > .55) parts.push(`<rect x="${(x + 2 + rnd() * (w - 4)).toFixed(1)}" y="${(H - h + 3 + rnd() * (h - 6)).toFixed(1)}" width="1.2" height="1.2" fill="#FFD15C" opacity=".5"/>`);
    x += w + 1;
  }
  parts.push(`<rect x="118" y="${H - 28}" width="20" height="28" fill="${f}"/><rect x="121" y="${H - 34}" width="14" height="6" fill="${f}"/><rect x="124" y="${H - 37}" width="8" height="3" fill="${f}"/><rect x="125" y="${H - 40}" width="1" height="3" fill="${f}"/><rect x="130" y="${H - 40}" width="1" height="3" fill="${f}"/>`);
  parts.push(`<rect x="160" y="${H - 29}" width="12" height="29" fill="${f}"/>`);
  parts.push(`<rect x="204" y="${H - 26}" width="11" height="26" fill="${f}"/><rect x="206" y="${H - 31}" width="7" height="5" fill="${f}"/><rect x="207.5" y="${H - 34}" width="4" height="3" fill="${f}"/><rect x="209.2" y="${H - 40}" width=".7" height="6" fill="${f}"/>`);
  parts.push(`<polygon points="262,${H} 280,${H} 277,${H - 30} 265,${H - 30}" fill="${f}"/><rect x="267" y="${H - 38}" width="1" height="8" fill="${f}"/><rect x="274" y="${H - 38}" width="1" height="8" fill="${f}"/><circle cx="267.5" cy="${H - 38}" r=".8" fill="#E4002B"/><circle cx="274.5" cy="${H - 38}" r=".8" fill="#E4002B"/>`);
  const train = `<g><rect x="0" y="${H - 7}" width="12" height="4.5" rx="1" fill="#C9D3DE"/><rect x="13" y="${H - 7}" width="12" height="4.5" rx="1" fill="#C9D3DE"/><rect x="26" y="${H - 7}" width="12" height="4.5" rx="1" fill="#C9D3DE"/><rect x="0" y="${H - 4}" width="38" height=".8" fill="#C60C30"/>${[2, 6, 15, 19, 28, 32].map(wx => `<rect x="${wx}" y="${H - 6.2}" width="2.4" height="1.4" fill="#FFE9A8"/>`).join('')}<animateTransform attributeName="transform" type="translate" from="-45 0" to="${W + 10} 0" dur="16s" repeatCount="indefinite"/></g>`;
  const girders = Array.from({ length: 40 }, (_, i) => `<rect x="${i * 10}" y="${H - 2.4}" width="1" height="2.4" fill="#2B4060"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">${parts.join('')}<rect x="0" y="${H - 2.6}" width="${W}" height="1" fill="#2B4060"/>${girders}${train}</svg>`;
}

/* =============================== RENDER ================================= */
function render() {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  const v = $('#view');
  if (S.station) v.innerHTML = stationShell();
  else if (S.tab === 'nearby') v.innerHTML = nearbyShell();
  else if (S.tab === 'lines') v.innerHTML = linesShell();
  else if (S.tab === 'alerts') v.innerHTML = `<div id="alertsDyn"></div>`;
  else v.innerHTML = settingsHTML();
  const q = $('#q');
  if (q) q.addEventListener('input', () => { S.query = q.value; fillNearby(); });
  updateDynamic();
}
function updateDynamic() {
  if (S.station) fillStation();
  else if (S.tab === 'nearby') fillNearby();
  else if (S.tab === 'lines') fillLines();
  else if (S.tab === 'alerts') fillAlerts();
  if (S.sheet && S.sheet.type === 'train') refreshTrainSheetData();
  updateBadge();
  tick();
}

function liveHTML() { return `<span class="live" data-live></span>`; }

/* ------------------------------- Nearby --------------------------------- */
function nearbyShell() {
  return `<div class="search"><span>🔎</span><input id="q" type="search" placeholder="Search any L station…" value="${esc(S.query)}" autocomplete="off"></div><div id="nearbyDyn"></div>`;
}
function setupCard() {
  return `<div class="card" style="padding:16px"><div style="font-weight:800;font-size:16px;margin-bottom:6px">🛠️ One quick setup</div>
    <div class="muted small" style="line-height:1.5;margin-bottom:12px">Leaving needs its tiny server (holds your CTA key + sends push alerts). Pop the server URL into Settings and the trains will start talking.</div>
    <button class="btn" data-tab="settings">Open Settings</button></div>`;
}
function fillNearby() {
  const el = $('#nearbyDyn'); if (!el) return;
  if (!S.stations.length) { el.innerHTML = `<div class="section-title">Loading stations…</div><div class="skeleton"></div><div class="skeleton"></div>`; return; }
  const q = S.query.trim().toLowerCase();
  if (q) {
    const o = origin();
    const hits = S.stations.filter(s => (s.name + ' ' + s.desc).toLowerCase().includes(q))
      .map(s => ({ s, d: dist(o, s) })).sort((a, b) => a.d - b.d).slice(0, 30);
    el.innerHTML = `<div class="section-title">${hits.length} station${hits.length === 1 ? '' : 's'}<span class="grow"></span><span style="letter-spacing:0;text-transform:none;font-weight:600">Tap ☆ to save</span></div>` + (hits.length ? `<div class="card">${hits.map(({ s, d }) =>
      `<div class="trow"><button class="info" style="text-align:left" data-open="${s.mapid}"><div class="dest">${esc(s.name)}</div><div class="meta">${s.lines.map(bullet).join('')}${s.ada ? ' ♿' : ''}${S.pos && !S.pos.fake ? ` · ${fmtDist(d)}` : ''}</div></button>${favBtn(s.mapid)}</div>`).join('')}</div>`
      : `<div class="empty"><div class="e">🤔</div>No L station by that name. Did you mean “Clark/Lake”? (Everyone means Clark/Lake.)</div>`);
    return;
  }
  let h = '';
  if (!isSetup()) h += setupCard();
  if (!S.pos) h += `<div class="note">📡 Finding you… (Chicago is big.)</div>`;
  else if (S.pos.fake) h += `<div class="note warn">📍 Location is ${S.posErr === 'denied' ? 'off' : 'unavailable'} — pretending you’re standing at Clark/Lake. <button data-act="geo" style="color:var(--sky);font-weight:800">Try again</button></div>`;

  const nearAll = nearest(S.showMore ? 8 : 4);
  h += heroHTML(nearAll);

  // ★ Favorites — every saved station, in the order you added them (newest at the bottom)
  const favs = S.favs.map(id => S.byId[id]).filter(Boolean);
  if (favs.length) {
    h += `<div class="section-title favt">★ My stations (${favs.length})<span class="grow"></span>${isSetup() ? liveHTML() : ''}</div>`;
    h += favs.map(stationCard).join('');
  }

  const near = nearAll.filter(s => !isFav(s.mapid));
  h += `<div class="section-title">Nearest stations<span class="grow"></span>${!favs.length && isSetup() ? liveHTML() : ''}</div>`;
  h += near.map(stationCard).join('') || `<div class="note">All your closest stations are already favorites. Overachiever.</div>`;
  if (!favs.length) h += `<div class="note">Tip: tap the ☆ on any station to pin it up top. Pin as many as you like — they stack in the order you add them.</div>`;
  h += `<button class="btn ghost" data-act="more">${S.showMore ? 'Show fewer' : 'Show more stations'}</button>`;
  el.innerHTML = h;
}

function heroHTML(near) {
  if (!isSetup() || !near.length) return '';
  let best = null;
  for (const st of near.slice(0, 4)) {
    const d = S.arr[st.mapid]; if (!d) continue;
    const w = walkInfo(st);
    for (const e of d.etas) {
      const leaveAt = w && w.ms != null ? e.at - w.ms : e.at;
      if (leaveAt < Date.now() - 20000) continue;
      if (!best || leaveAt < best.leaveAt) best = { e, st, w, leaveAt };
    }
  }
  if (!best) {
    const loading = near.some(s => !S.arr[s.mapid]);
    return `<div class="hero"><div class="kicker">Next train you can catch</div><div class="big" style="font-size:30px;margin:10px 0">${loading ? 'Checking…' : 'Nothing yet'}</div><div class="quip">${loading ? 'Asking the CTA nicely.' : 'No predictions nearby right now. The L might be napping.'}</div></div>`;
  }
  const { e, st, w } = best;
  const walking = w && w.ms != null;
  return `<div class="hero" id="hero" data-target="${best.leaveAt}" data-walk="${walking ? 1 : 0}" data-rn="${e.rn}" data-open="${st.mapid}">
    <div class="kicker">${walking ? 'You need to leave in' : 'Next train arrives in'}</div>
    <div class="big"><span id="heroBig">--:--</span></div>
    <div class="what">${bullet(e.rt)} to ${esc(e.destNm)} · ${esc(st.name)}</div>
    <div class="quip" id="heroQuip">${walking ? `~${Math.round(w.walkMin)} min walk (${fmtDist(w.d)}) + ${S.settings.buffer} min buffer · train at ${e.clock}` : `Arrives ${e.clock}`}</div>
    <div class="bar"><i id="heroBar" style="width:100%"></i></div></div>`;
}

function groupByDir(etas) {
  const g = new Map();
  for (const e of etas) {
    const k = e.stpDe || ('To ' + e.destNm);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(e);
  }
  return [...g.entries()];
}
function stationCard(st) {
  const w = walkInfo(st);
  const d = S.arr[st.mapid];
  let body = '';
  if (!isSetup()) body = '';
  else if (!d) body = `<div class="dirgroup"><div class="skeleton" style="height:52px;margin:0"></div></div>`;
  else {
    const etas = d.etas.filter(e => e.at > Date.now() - 30000);
    if (!etas.length) body = `<div class="dirgroup muted small">${d.err ? '⚠️ ' + esc(d.err) : 'No predictions right now. 😴'}</div>`;
    else body = groupByDir(etas).map(([k, list]) => `<div class="dirgroup"><h4>${esc(k)}</h4><div class="chips">${list.slice(0, 4).map(e => chipHTML(e, st, w)).join('')}</div></div>`).join('');
  }
  return `<div class="card ${isFav(st.mapid) ? 'isfav' : ''}" data-card="${st.mapid}"><button class="sign" style="width:100%;text-align:left;display:block" data-open="${st.mapid}">
      <div class="nm">${esc(st.name)}</div>
      <div class="sub"><span>${st.lines.map(k => L(k).name).join(' · ')}</span>${w ? `<span>🚶 ${fmtDist(w.d)} · ${w.far ? 'far, friend' : Math.max(1, Math.round(w.walkMin)) + ' min'}</span>` : ''}${st.ada ? '<span>♿</span>' : ''}</div>
    </button>${favBtn(st.mapid)}${lineBars(st.lines)}${body}</div>`;
}
function chipHTML(e, st, w) {
  const leave = w && w.ms != null ? `<div class="lv" data-leave="${e.at - w.ms}"></div>` : '';
  const flag = e.isDly ? ' ⚠️' : e.isSch ? ' 🗓' : '';
  return `<button class="chip" style="--c:${L(e.rt).c}" data-train="${st.mapid}|${e.rn}|${e.stpId}">
    <div class="m" data-at="${e.at}" data-app="${e.isApp ? 1 : 0}"></div>
    <div class="d">${esc(e.destNm)}${flag}</div>${leave}</button>`;
}

/* ------------------------------- Station -------------------------------- */
function stationShell() {
  const st = S.byId[S.station] || { name: 'Station', desc: '', lines: [], mapid: S.station };
  const w = walkInfo(st);
  return `<button class="back" data-act="back">‹ Back</button>
  <div class="card"><div class="sign"><div class="nm">${esc(st.name)}</div><div class="sub"><span>${esc(st.desc)}</span></div></div>${favBtn(st.mapid)}${lineBars(st.lines)}
    <div class="dirgroup small muted">${w ? (w.far ? `🚶 ${fmtDist(w.d)} away — that’s a hike. Maybe a bus? A bike? A pep talk?` : `🚶 ${fmtDist(w.d)} · ~${Math.max(1, Math.round(w.walkMin))} min walk at ${SPEEDS[S.settings.speed].label} pace + ${S.settings.buffer} min buffer`) : '📍 Walk time shows once we know where you are.'}${st.ada ? ' · ♿ Accessible' : ''}</div></div>
  <div class="section-title">Arrivals<span class="grow"></span>${liveHTML()}</div><div id="stationDyn"><div class="skeleton"></div></div>`;
}
function fillStation() {
  const el = $('#stationDyn'); if (!el) return;
  if (!isSetup()) { el.innerHTML = setupCard(); return; }
  const st = S.byId[S.station] || { mapid: S.station };
  const d = S.arr[S.station];
  if (!d) { el.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`; return; }
  const w = walkInfo(st);
  const etas = d.etas.filter(e => e.at > Date.now() - 30000);
  if (!etas.length) { el.innerHTML = `<div class="card empty"><div class="e">🌙</div>${d.err ? '⚠️ ' + esc(d.err) : 'No trains predicted right now.<br>Either it’s late, or the L is doing maintenance-y things.'}</div>`; return; }
  el.innerHTML = groupByDir(etas).map(([k, list]) => `<div class="card"><div class="dirgroup" style="border:0;padding-bottom:4px"><h4>${esc(k)}</h4></div>${list.map(e => trowHTML(e, st, w)).join('')}</div>`).join('');
}
function trowHTML(e, st, w) {
  const has = S.alerts.some(a => !a.fired && a.mapid === st.mapid && a.rn === e.rn);
  const pills = [e.isApp ? '<span class="pill app">Approaching</span>' : '', e.isDly ? '<span class="pill dly">Delayed</span>' : '', e.isSch ? '<span class="pill sch">Scheduled</span>' : '', e.isFlt ? '<span class="pill dly">Fault</span>' : ''].join('');
  return `<div class="trow" data-train="${st.mapid}|${e.rn}|${e.stpId}">
    ${bullet(e.rt)}
    <div class="info"><div class="dest">to ${esc(e.destNm)}</div><div class="meta">Run ${esc(e.rn)} · ${e.clock}${pills}</div></div>
    <div class="mins"><div class="n" data-at="${e.at}" data-app="${e.isApp ? 1 : 0}"></div>${w && w.ms != null ? `<div class="lv" data-leave="${e.at - w.ms}"></div>` : ''}</div>
    <span class="bell ${has ? 'set' : ''}">🔔</span></div>`;
}

/* -------------------------------- Lines --------------------------------- */
function linesShell() {
  return `<div class="linepick">${LINE_ORDER.map(k => `<button data-line="${k}" class="${k === S.line ? 'on' : ''}" style="--c:${LINES[k].c};--t:${LINES[k].t}">${LINES[k].name}</button>`).join('')}</div><div id="linesDyn"><div class="skeleton" style="margin-top:14px"></div></div>`;
}
function fillLines() {
  const el = $('#linesDyn'); if (!el) return;
  if (!isSetup()) { el.innerHTML = '<div style="height:14px"></div>' + setupCard(); return; }
  const k = S.line, l = LINES[k];
  let h = '';
  const ri = (S.routes || []).find(r => r.ServiceId === k);
  if (ri) h += `<div class="card" style="margin-top:14px"><div class="status"><span class="dot" style="background:#${esc(ri.RouteStatusColor || '2ECC71')}"></span>${esc(l.name)} Line · ${esc(ri.RouteStatus)}</div></div>`;
  else h += '<div style="height:14px"></div>';
  const alerts = (S.svc || []).filter(a => arr(a.ImpactedService && a.ImpactedService.Service).some(s => s.ServiceId === k));
  if (alerts.length) h += `<div class="section-title">Service alerts (${alerts.length})</div><div class="card">${alerts.slice(0, 8).map(a =>
    `<div class="salert"><b>${a.MajorAlert === '1' ? '🚨 ' : '⚠️ '}${esc(a.Headline)}</b><p>${esc(a.ShortDescription)}</p></div>`).join('')}</div>`;
  const trains = (S.positions && S.positions[k]) || null;
  h += `<div class="section-title">Live trains${trains ? ` (${trains.length})` : ''}<span class="grow"></span>${liveHTML()}</div>`;
  if (!trains) h += `<div class="skeleton"></div>`;
  else if (!trains.length) h += `<div class="card empty"><div class="e">🛌</div>No ${l.name} Line trains running right now.</div>`;
  else {
    const g = new Map();
    trains.forEach(t => { const kk = 'To ' + t.destNm; if (!g.has(kk)) g.set(kk, []); g.get(kk).push(t); });
    h += [...g.entries()].map(([dest, list]) => `<div class="card"><div class="dirgroup" style="border:0;padding-bottom:4px"><h4>${esc(dest)}</h4></div>${list.sort((a, b) => a.at - b.at).map(t =>
      `<button class="trow" data-follow="${t.rn}" data-rt="${k}"><span class="bullet" style="background:${l.c};color:${l.t}">${esc(t.rn)}</span>
        <div class="info"><div class="dest" style="font-size:15px">Next: ${esc(t.nextStaNm)}</div><div class="meta">${t.isApp ? '<span class="pill app">Approaching</span>' : ''}${t.isDly ? '<span class="pill dly">Delayed</span>' : ''}<span>Tap for all stops</span></div></div>
        <div class="mins"><div class="n" data-at="${t.at}" data-app="${t.isApp ? 1 : 0}" style="font-size:20px"></div></div></button>`).join('')}</div>`).join('');
  }
  el.innerHTML = h;
}

/* -------------------------------- Alerts -------------------------------- */
function notifState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
function fillAlerts() {
  const el = $('#alertsDyn'); if (!el) return;
  const active = S.alerts.filter(a => !a.fired).sort((a, b) => (a.at || 0) - (b.at || 0));
  const done = S.alerts.filter(a => a.fired).slice(-8).reverse();
  const ns = notifState();
  let h = '';
  if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    h += `<div class="note warn">📲 iPhone only delivers push notifications to apps on your Home Screen. Tap <b>Share</b> → <b>Add to Home Screen</b>, then open Leaving from there.</div>`;
  }
  h += `<div class="card"><div class="field"><label>NOTIFICATIONS</label>
    <div class="row"><div class="grow">${ns === 'granted' ? '✅ Allowed' : ns === 'denied' ? '🚫 Blocked — enable in iPhone Settings → Notifications → Leaving' : ns === 'unsupported' ? '😶 Not available here (install to Home Screen)' : '🤷 Not set up yet'}
    <div class="hint">${serverBase() ? 'Push server connected — alerts arrive even when Leaving is closed.' : 'No server set — alerts only fire while Leaving is open.'}</div></div></div>
    <div class="row" style="margin-top:10px;gap:8px">${ns === 'default' ? '<button class="btn" data-act="enable">Enable</button>' : ''}${serverBase() && ns === 'granted' ? '<button class="btn ghost" data-act="testpush">Send test push</button>' : ''}</div></div></div>`;
  h += `<div class="section-title">Active alerts (${active.length})</div>`;
  if (!active.length) h += `<div class="card empty"><div class="e">🔕</div>No alerts yet.<br>Tap any train, pick how many minutes of warning you want, and we’ll nag you. Lovingly.</div>`;
  else h += `<div class="card">${active.map(a => `<div class="arow">${bullet(a.rt)}<div class="grow"><div style="font-weight:800">to ${esc(a.destNm)} · Run ${esc(a.rn)}</div>
      <div class="muted small">${esc(a.staNm)} · ping ${a.lead} min before · ${a.at ? `train in <span data-at="${a.at}"></span>` : 'waiting for prediction'}</div>
      <div class="small" style="color:${a.serverId ? 'var(--good)' : 'var(--warn)'}">${a.serverId ? '☁️ Push — works with app closed' : '📱 In-app only — keep Leaving open'}</div></div>
      <button class="x" data-act="del" data-id="${a.id}" aria-label="Delete">✕</button></div>`).join('')}</div>`;
  if (done.length) h += `<div class="section-title">Recently sent<span class="grow"></span><button data-act="clearDone" style="color:var(--sky);font-size:12px;letter-spacing:0">Clear</button></div><div class="card">${done.map(a =>
    `<div class="arow" style="opacity:.6">${bullet(a.rt)}<div class="grow"><div style="font-weight:700">to ${esc(a.destNm)} · ${esc(a.staNm)}</div><div class="muted small">${a.lead} min warning · sent ✓</div></div></div>`).join('')}</div>`;
  el.innerHTML = h;
}
function updateBadge() {
  const n = S.alerts.filter(a => !a.fired).length;
  const b = $('#alertBadge'); b.hidden = !n; b.textContent = n;
}

/* ------------------------------- Settings ------------------------------- */
function seg(name, opts, cur) {
  return `<div class="seg">${opts.map(([v, l]) => `<button data-set="${name}" data-val="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function settingsHTML() {
  const s = S.settings;
  return `${!isStandalone() ? `<div class="note">📲 Install: in Safari tap <b>Share</b> → <b>Add to Home Screen</b>. Leaving then opens full-screen and can send notifications.</div>` : ''}
  <div class="section-title">Data server</div>
  <div class="card"><div class="field"><label>LEAVING SERVER URL</label>
    <input type="url" id="server" placeholder="https://leaving-api.yourname.workers.dev" value="${esc(s.server)}" autocapitalize="off" autocorrect="off" spellcheck="false">
    <div class="hint">Your Cloudflare Worker. It holds your CTA API key so it never lives in GitHub, and sends push alerts.</div>
    <div class="row" style="margin-top:10px;gap:8px"><button class="btn" data-act="saveServer">Save &amp; test</button></div>
    <div id="testOut" class="hint"></div></div></div>

  <div class="section-title">Your legs</div>
  <div class="card"><div class="field"><label>WALKING SPEED</label>${seg('speed', Object.entries(SPEEDS).map(([k, v]) => [k, v.label]), s.speed)}
    <div class="hint">${esc(SPEEDS[s.speed].sub)} · walk time uses straight-line distance × 1.25 for city blocks.</div></div>
    <div class="field"><label>BUFFER (stairs, turnstile, Ventra fumbling)</label>${seg('buffer', [[0, '0'], [1, '1 min'], [2, '2 min'], [3, '3 min'], [5, '5 min']], s.buffer)}</div>
  </div>

  <div class="section-title">Alerts &amp; data</div>
  <div class="card"><div class="field"><label>DEFAULT ALERT WARNING</label>${seg('defaultLead', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30']], s.defaultLead)}<div class="hint">Minutes before the train reaches your station. You can pick anything when setting an alert.</div></div>
    <div class="field"><label>REFRESH EVERY</label>${seg('refresh', [[5, '5s'], [10, '10s'], [15, '15s'], [30, '30s']], s.refresh)}<div class="hint">Faster = fresher, but spends more of your CTA daily request allowance. Countdowns tick every second regardless.</div></div>
    <div class="field"><label>DOOR CHIME WHEN AN ALERT FIRES (APP OPEN)</label>${seg('chime', [[true, 'Ding-dong'], [false, 'Silent']], s.chime)}</div>
  </div>

  <div class="section-title">Advanced</div>
  <div class="card"><div class="field"><label>DIRECT MODE API KEY (NO SERVER)</label>
    <input type="password" id="apikey" placeholder="Only if you skip the server" value="${esc(s.apiKey)}" autocapitalize="off" autocorrect="off">
    <div class="hint">Stored only on this phone. CTA may refuse direct browser requests, and push alerts need the server — so the server is the way to go.</div>
    <div class="row" style="margin-top:10px"><button class="btn ghost" data-act="saveKey">Save key</button></div></div>
    <div class="field"><div class="row" style="gap:8px"><button class="btn ghost" data-act="reloadStations">Refresh station list</button><button class="btn ghost" data-act="reset">Reset app</button></div></div>
  </div>
  <div class="empty small">Leaving v${VERSION} · Data from CTA Train Tracker &amp; City of Chicago Data Portal.<br>Not affiliated with the CTA. Predictions are estimates — the L does what it wants.</div>`;
}

/* -------------------------------- Sheets -------------------------------- */
function openSheet(html) { $('#sheet').innerHTML = `<div class="grab"></div>` + html; $('#sheetWrap').hidden = false; tick(); }
function closeSheet() { $('#sheetWrap').hidden = true; S.sheet = null; }

function findEta(mapid, rn, stpId) {
  const d = S.arr[mapid]; if (!d) return null;
  return d.etas.find(e => e.rn === rn && (!stpId || e.stpId === stpId)) || d.etas.find(e => e.rn === rn) || null;
}
function openTrainSheet(eta, mapid) {
  const st = S.byId[mapid] || { mapid, name: eta.staNm, lines: [] };
  const w = walkInfo(st);
  const walkLead = w && w.ms != null ? Math.max(1, Math.ceil(w.total)) : null;
  const existing = S.alerts.find(a => !a.fired && a.mapid === mapid && a.rn === eta.rn);
  S.sheet = { type: 'train', eta, mapid, lead: existing ? existing.lead : (walkLead && walkLead > S.settings.defaultLead ? walkLead : S.settings.defaultLead), walkLead };
  renderTrainSheet();
}
function renderTrainSheet() {
  const { eta, mapid, lead, walkLead } = S.sheet;
  const st = S.byId[mapid] || { name: eta.staNm };
  const w = walkInfo(st);
  const existing = S.alerts.find(a => !a.fired && a.mapid === mapid && a.rn === eta.rn);
  const presets = [1, 2, 3, 5, 10, 15, 20, 30];
  openSheet(`<div class="row">${bullet(eta.rt)}<div class="grow"><h3>to ${esc(eta.destNm)}</h3><div class="muted small">Run ${esc(eta.rn)} · ${esc(st.name)}${eta.stpDe ? ' · ' + esc(eta.stpDe) : ''}</div></div></div>
    <div class="note">🕐 Arrives ~<b>${eta.clock}</b> (in <b data-at="${eta.at}" data-app="${eta.isApp ? 1 : 0}"></b>)${w && w.ms != null ? `<br>🚶 ~${Math.round(w.walkMin)} min walk + ${S.settings.buffer} min buffer → <b class="lv" data-leave="${eta.at - w.ms}"></b>` : ''}${eta.isDly ? '<br>⚠️ CTA flags this train as delayed.' : ''}${eta.isSch ? '<br>🗓 Schedule-based (train hasn’t left its terminal yet).' : ''}</div>
    <div class="section-title" style="margin-top:6px">Notify me before it arrives</div>
    <div class="leadgrid">${presets.map(p => `<button data-lead="${p}" class="${p === lead ? 'on' : ''}">${p}m</button>`).join('')}
      ${walkLead ? `<button class="walk ${lead === walkLead ? 'on' : ''}" data-lead="${walkLead}">🚶 My walk (${walkLead}m)</button>` : ''}
      <button class="walk" data-lead="${Math.max(1, Math.floor((eta.at - Date.now()) / 60000) - 1)}">⏱ Almost now</button></div>
    <div class="stepper"><button data-act="leadDown">−</button><div class="val">${lead}<small> min</small></div><button data-act="leadUp">+</button></div>
    <div id="leadWarn"></div>
    <button class="btn red" data-act="setAlert">🔔 ${existing ? 'Update alert' : 'Set alert'} · ${lead} min before</button>
    ${existing ? '<button class="btn ghost" style="margin-top:8px" data-act="delSheet">Remove alert</button>' : ''}
    <button class="btn ghost" style="margin-top:8px" data-follow="${eta.rn}" data-rt="${eta.rt}">🛤️ See this train’s upcoming stops</button>`);
  updateLeadWarn();
}
function updateLeadWarn() {
  const el = $('#leadWarn'); if (!el || !S.sheet) return;
  const secs = (S.sheet.eta.at - Date.now()) / 1000;
  el.innerHTML = S.sheet.lead * 60 >= secs
    ? `<div class="note warn">Heads up: the train’s only ~${Math.max(0, Math.round(secs / 60))} min out, so this alert will fire right away.</div>`
    : `<div class="note">We’ll ping you when Run ${esc(S.sheet.eta.rn)} is ${S.sheet.lead} min from ${esc(S.sheet.eta.staNm)}. CTA predictions can wiggle — we keep tracking the real train.</div>`;
}
function refreshTrainSheetData() {
  const s = S.sheet; if (!s || s.type !== 'train') return;
  const e = findEta(s.mapid, s.eta.rn, s.eta.stpId);
  if (e) {
    s.eta = e;
    $$('#sheet [data-at]').forEach(el => { el.dataset.at = e.at; });
    const st = S.byId[s.mapid]; const w = walkInfo(st);
    if (w && w.ms != null) $$('#sheet [data-leave]').forEach(el => { el.dataset.leave = e.at - w.ms; });
  }
}

async function openFollowSheet(rn, rt) {
  S.sheet = { type: 'follow', rn, rt, etas: null };
  const l = L(rt);
  openSheet(`<div class="row"><span class="bullet" style="background:${l.c};color:${l.t}">${esc(l.name)}</span><div class="grow"><h3>Run ${esc(rn)}</h3><div class="muted small">Upcoming stops · tap one to set an alert there</div></div></div><div class="stops" id="stops"><div class="skeleton"></div></div>`);
  try {
    const c = parseCTA(await getJSON(ctaUrl('/follow', { runnumber: rn })));
    const now = Date.now();
    const etas = arr(c.eta).map(e => normEta(e, c.tmst, now)).sort((a, b) => a.at - b.at);
    if (!S.sheet || S.sheet.rn !== rn) return;
    S.sheet.etas = etas;
    const el = $('#stops'); if (!el) return;
    el.innerHTML = etas.length ? etas.map((e, i) => `<button class="s" style="width:100%;text-align:left;--c:${l.c}" data-ftrain="${i}"><span class="d"></span><div><div style="font-weight:700">${esc(e.staNm)}</div><div class="muted small">${e.clock}${e.isDly ? ' · delayed' : ''}</div></div><span class="t" data-at="${e.at}" data-app="${e.isApp ? 1 : 0}"></span></button>`).join('')
      : `<div class="empty">No upcoming stops reported. This train may be finishing its run.</div>`;
    tick();
  } catch (err) {
    const el = $('#stops'); if (el) el.innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`;
  }
}

/* ------------------------------ Favorites ------------------------------- */
function toggleFav(id, btn) {
  id = String(id);
  const adding = !isFav(id);
  // Append to the END so each new favorite stacks underneath the ones already saved
  S.favs = adding ? [...S.favs.filter(x => x !== id), id] : S.favs.filter(x => x !== id);
  saveFavs();
  const name = (S.byId[id] && S.byId[id].name) || 'Station';
  toast(adding ? `${pick(FAV_ADD, id)}<br><span class="muted small">${esc(name)} is #${S.favs.length} in My stations.</span>` : `☆ ${esc(name)} removed from My stations.`);

  // Re-draw the current screen so the station moves into (or out of) the favorites list immediately
  const v = $('#view'); const scroll = v.scrollTop;
  if (S.station) {
    $$('[data-fav]').forEach(b => { b.outerHTML = favBtn(b.dataset.fav); });
  } else if (S.tab === 'nearby') {
    fillNearby();
    v.scrollTop = scroll;
    if (adding && !S.query.trim()) {
      const card = $(`#nearbyDyn [data-card="${id}"]`);
      if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    refreshNow();
  }
  const nb = $(`[data-fav="${id}"]`);
  if (nb) nb.classList.add('pop');
}

/* ------------------------------ Push + alerts --------------------------- */
const b64uToBytes = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const bytesToB64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function ensurePermission() {
  if (!('Notification' in window)) throw new Error(isStandalone() ? 'Notifications not supported on this device' : 'Add Leaving to your Home Screen to get notifications');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Notifications are blocked for Leaving');
}
async function loadVapid() {
  if (!serverBase()) return null;
  try { S.vapid = (await getJSON(serverBase() + '/vapid')).publicKey; } catch {}
  return S.vapid;
}
async function ensurePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error(isStandalone() ? 'Push not supported on this device' : 'Add Leaving to your Home Screen to get push alerts');
  await ensurePermission(); // first await, so iOS still sees the tap
  const reg = await navigator.serviceWorker.ready;
  const publicKey = S.vapid || await loadVapid();
  if (!publicKey) throw new Error('Server didn’t return a push key (is LEAVING_KV bound?)');
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options && sub.options.applicationServerKey && bytesToB64u(sub.options.applicationServerKey) !== publicKey) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
  return sub;
}

async function setAlertFromSheet() {
  const { eta, mapid, lead } = S.sheet;
  const st = S.byId[mapid] || { name: eta.staNm };
  const pushP = serverBase() ? ensurePush() : ensurePermission();
  pushP.catch(() => {});
  const old = S.alerts.find(a => !a.fired && a.mapid === mapid && a.rn === eta.rn);
  if (old) await deleteAlert(old.id, true);
  const a = { id: Math.random().toString(36).slice(2), mapid, stpId: eta.stpId, staNm: st.name, rn: eta.rn, rt: eta.rt, destNm: eta.destNm, lead, at: eta.at, createdAt: Date.now(), serverId: null, fired: false };
  let msg;
  try {
    if (serverBase()) {
      const sub = await pushP;
      const r = await postJSON(serverBase() + '/alerts', { subscription: sub.toJSON(), mapid, stpId: eta.stpId, staNm: st.name, rn: eta.rn, rt: eta.rt, destNm: eta.destNm, lead });
      a.serverId = r.id;
      msg = `🔔 Locked in! We’ll buzz you ${lead} min before Run ${esc(eta.rn)} hits ${esc(st.name)} — even with the app closed.`;
    } else {
      await pushP.catch(() => {});
      msg = `🔔 Set! Keep Leaving open and we’ll ding you ${lead} min out. (Add a server in Settings for closed-app alerts.)`;
    }
  } catch (e) {
    msg = `🔔 Set as an in-app alert (push failed: ${esc(e.message)}). Keep Leaving open.`;
  }
  S.alerts.push(a); saveAlerts();
  closeSheet(); toast(msg, 5000); updateDynamic();
}
async function deleteAlert(id, quiet) {
  const a = S.alerts.find(x => x.id === id);
  S.alerts = S.alerts.filter(x => x.id !== id); saveAlerts();
  if (a && a.serverId && serverBase()) fetch(`${serverBase()}/alerts/${a.serverId}`, { method: 'DELETE' }).catch(() => {});
  if (!quiet) { updateDynamic(); toast('🗑️ Alert removed. Freedom.'); }
}
async function syncServerAlerts() {
  if (!serverBase() || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = reg.pushManager && await reg.pushManager.getSubscription();
    if (!sub) return;
    const { alerts } = await getJSON(`${serverBase()}/alerts?endpoint=${encodeURIComponent(sub.endpoint)}`);
    const ids = new Set(alerts.map(x => x.id));
    let changed = false;
    for (const a of S.alerts) if (!a.fired && a.serverId && !ids.has(a.serverId) && Date.now() - a.createdAt > 90000) { a.fired = true; changed = true; }
    if (changed) { saveAlerts(); updateDynamic(); }
  } catch {}
}

function checkLocalAlerts() {
  let changed = false;
  const now = Date.now();
  for (const a of S.alerts) {
    if (a.fired) continue;
    const e = findEta(a.mapid, a.rn, a.stpId);
    if (e && e.at !== a.at) { a.at = e.at; changed = true; }
    if (now - a.createdAt > 3 * 3600e3) { a.fired = true; changed = true; continue; }
    if (a.at && now >= a.at - a.lead * 60000) { a.fired = true; changed = true; fireLocal(a); }
  }
  if (changed) { saveAlerts(); updateBadge(); if (S.tab === 'alerts' && !S.station) fillAlerts(); }
}
async function fireLocal(a) {
  const mins = Math.max(0, Math.round((a.at - Date.now()) / 60000));
  const q = pick(mins <= 2 ? QUIPS.run : mins <= 5 ? QUIPS.soon : QUIPS.go, a.rn);
  chime();
  toast(`🚆 <b>${esc(L(a.rt).name)} to ${esc(a.destNm)}</b> hits ${esc(a.staNm)} in ~${mins} min. ${esc(q)}`, 9000);
  if (!a.serverId && 'Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(`🚆 ${L(a.rt).name} Line to ${a.destNm} — ${mins} min`, { body: `Run ${a.rn} at ${a.staNm}. ${q}`, icon: 'icons/icon-192.png', tag: a.id, data: { url: `./?station=${a.mapid}` } });
    } catch {}
  }
}

/* -------------------------------- Ticker -------------------------------- */
function tick() {
  const now = Date.now();
  $$('[data-at]').forEach(el => { const h = minsHTML(+el.dataset.at, el.dataset.app === '1'); if (el.innerHTML !== h) el.innerHTML = h; });
  $$('[data-leave]').forEach(el => { const s = leaveState(+el.dataset.leave); el.textContent = s.label; el.className = 'lv ' + s.cls; });
  const hero = $('#hero');
  if (hero) {
    const secs = (+hero.dataset.target - now) / 1000;
    const walking = hero.dataset.walk === '1';
    const st = walking ? leaveState(+hero.dataset.target) : { cls: secs > 300 ? 'go' : secs > 60 ? 'soon' : 'run' };
    hero.className = 'hero ' + st.cls;
    $('#heroBig').textContent = secs > 0 ? mmss(secs) : (walking ? 'RUN!' : 'Due');
    $('#heroBar').style.width = Math.max(2, Math.min(100, secs / 600 * 100)) + '%';
    if (walking) {
      const qEl = $('#heroQuip');
      if (qEl && !qEl.dataset.base) qEl.dataset.base = qEl.textContent;
      if (qEl) qEl.textContent = `${pick(QUIPS[st.cls] || QUIPS.go, hero.dataset.rn + st.cls)} · ${qEl.dataset.base}`;
    }
  }
  $$('[data-live]').forEach(el => {
    const age = S.lastOk ? Math.round((now - S.lastOk) / 1000) : null;
    el.classList.toggle('err', !!S.lastErr);
    el.classList.toggle('stale', !S.lastErr && (age == null || age > S.settings.refresh * 2.5));
    el.textContent = S.lastErr ? `⚠ ${S.lastErr}` : age == null ? 'Connecting…' : `Live · ${age}s ago`;
  });
  if (S.sheet && S.sheet.type === 'train') updateLeadWarn();
  checkLocalAlerts();
}

/* -------------------------------- Polling ------------------------------- */
let pollT = null, polling = false;
function wantedStations() {
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };
  if (S.station) add(S.station);
  if (S.sheet && S.sheet.mapid) add(S.sheet.mapid);
  if (!S.station && S.tab === 'nearby') {
    S.favs.forEach(add);                                  // favorites first — always live
    if (S.pos) nearest(S.showMore ? 8 : 4).forEach(s => add(s.mapid));
  }
  S.alerts.filter(a => !a.fired).forEach(a => add(a.mapid));
  return ids.slice(0, 20);
}
async function poll() {
  if (polling) return;
  polling = true; clearTimeout(pollT);
  try {
    if (!document.hidden && isSetup()) {
      const jobs = wantedStations().map(fetchArrivals);
      if (S.tab === 'lines' && !S.station) jobs.push(fetchLines());
      await Promise.all(jobs);
      updateDynamic();
    }
  } finally {
    polling = false;
    pollT = setTimeout(poll, S.settings.refresh * 1000);
  }
}
function refreshNow() { clearTimeout(pollT); if (!polling) poll(); else setTimeout(refreshNow, 400); }

/* -------------------------------- Events -------------------------------- */
function go(tab) { S.tab = tab; S.station = null; closeSheet(); render(); $('#view').scrollTop = 0; refreshNow(); if (tab === 'alerts') syncServerAlerts(); }
function openStation(id) { S.station = id; closeSheet(); render(); $('#view').scrollTop = 0; refreshNow(); }

document.addEventListener('pointerdown', unlockAudio, { passive: true });
$('#sheetBg').addEventListener('click', closeSheet);

document.addEventListener('click', async ev => {
  // data-fav is checked first so tapping the star never also opens the station
  const t = ev.target.closest('[data-fav],[data-tab],[data-open],[data-train],[data-ftrain],[data-follow],[data-line],[data-lead],[data-set],[data-act]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.fav) { ev.stopPropagation(); return toggleFav(ds.fav, t); }
  if (ds.tab) return go(ds.tab);
  if (ds.ftrain != null && S.sheet && S.sheet.etas) {
    const e = S.sheet.etas[+ds.ftrain];
    if (e) { S.arr[e.staId] = S.arr[e.staId] || { fetched: 0, etas: [e] }; openTrainSheet(e, e.staId); refreshNow(); }
    return;
  }
  if (ds.train) {
    const [mapid, rn, stp] = ds.train.split('|');
    const e = findEta(mapid, rn, stp);
    if (e) openTrainSheet(e, mapid);
    return;
  }
  if (ds.follow) return openFollowSheet(ds.follow, ds.rt);
  if (ds.open) return openStation(ds.open);
  if (ds.line) { S.line = ds.line; store.set('lv_line', ds.line); $$('.linepick button').forEach(b => b.classList.toggle('on', b.dataset.line === ds.line)); fillLines(); return; }
  if (ds.lead && S.sheet) { S.sheet.lead = Math.max(1, Math.min(120, +ds.lead)); renderTrainSheet(); return; }
  if (ds.set) {
    let v = ds.val; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v;
    S.settings[ds.set] = v; saveSettings();
    const scroll = $('#view').scrollTop; render(); $('#view').scrollTop = scroll;
    if (ds.set === 'refresh') refreshNow();
    return;
  }
  switch (ds.act) {
    case 'back': S.station = null; render(); refreshNow(); break;
    case 'more': S.showMore = !S.showMore; fillNearby(); refreshNow(); break;
    case 'geo': startGeo(); toast('📡 Asking your phone where you are…'); break;
    case 'leadUp': S.sheet.lead = Math.min(120, S.sheet.lead + 1); renderTrainSheet(); break;
    case 'leadDown': S.sheet.lead = Math.max(1, S.sheet.lead - 1); renderTrainSheet(); break;
    case 'setAlert': t.disabled = true; t.textContent = 'Setting…'; await setAlertFromSheet(); break;
    case 'delSheet': { const a = S.alerts.find(x => !x.fired && x.mapid === S.sheet.mapid && x.rn === S.sheet.eta.rn); if (a) await deleteAlert(a.id); closeSheet(); break; }
    case 'del': await deleteAlert(ds.id); break;
    case 'clearDone': S.alerts = S.alerts.filter(a => !a.fired); saveAlerts(); fillAlerts(); break;
    case 'enable':
      try { if (serverBase()) await ensurePush(); else await ensurePermission(); toast('✅ Notifications on. Prepare to be punctual.'); }
      catch (e) { toast('⚠️ ' + esc(e.message), 6000); }
      fillAlerts(); break;
    case 'testpush':
      try {
        const sub = await ensurePush();
        const r = await postJSON(serverBase() + '/test-push', { subscription: sub.toJSON() });
        toast(r.ok ? '📨 Test push sent! Lock your phone and look for it.' : `⚠️ Push service said ${r.status}`);
      } catch (e) { toast('⚠️ ' + esc(e.message), 6000); }
      break;
    case 'saveServer': {
      const val = $('#server').value.trim().replace(/\/+$/, '');
      S.settings.server = val; saveSettings();
      const out = $('#testOut');
      if (!val) { out.textContent = 'Server cleared.'; break; }
      out.textContent = 'Testing…';
      try {
        const h = await getJSON(val + '/health');
        out.innerHTML = h.ok ? `✅ Connected. CTA key: ${h.hasKey ? '✅' : '❌ missing (add CTA_KEY secret)'} · Alert storage: ${h.hasKV ? '✅' : '❌ missing (bind LEAVING_KV)'}` : '⚠️ Unexpected reply';
        S.vapid = null; loadVapid(); loadStations(); refreshNow();
      } catch (e) { out.textContent = '❌ ' + e.message + ' — double-check the URL.'; }
      break;
    }
    case 'saveKey': S.settings.apiKey = $('#apikey').value.trim(); saveSettings(); toast('🔑 Saved on this device.'); refreshNow(); break;
    case 'reloadStations': toast('🔄 Re-downloading stations…'); await loadStations(true); toast(`✅ ${S.stations.length} stations loaded.`); break;
    case 'reset':
      if (confirm('Reset Leaving? This clears settings, favorites and alerts on this device.')) {
        for (const a of S.alerts) if (a.serverId && serverBase()) fetch(`${serverBase()}/alerts/${a.serverId}`, { method: 'DELETE' }).catch(() => {});
        localStorage.clear(); location.reload();
      }
      break;
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { refreshNow(); syncServerAlerts(); }
});

/* -------------------------------- Boot ---------------------------------- */
function rotateTagline() {
  let i = 0; const el = $('#tagline');
  setInterval(() => { el.style.opacity = 0; setTimeout(() => { i = (i + 1) % TAGLINES.length; el.textContent = TAGLINES[i]; el.style.opacity = 1; }, 400); }, 9000);
}

(async function boot() {
  applyRotation();
  $('#skyline').innerHTML = skylineSVG();
  rotateTagline();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', ev => {
      if (ev.data && ev.data.type === 'open') {
        const id = new URL(ev.data.url, location.href).searchParams.get('station');
        if (id) openStation(id);
      }
    });
  }
  const startStation = new URLSearchParams(location.search).get('station');
  if (startStation) S.station = startStation;
  render();
  startGeo();
  await loadStations();
  if (S.tab !== 'settings') render();
  refreshNow();
  loadVapid();
  syncServerAlerts();
  setInterval(tick, 1000);
})();
