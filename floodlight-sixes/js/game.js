/* ===== Game: match flow, players, fielding, cameras, replays, HUD and screens ===== */
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const W = WORLD;

const TEAMS = [
  { id: 'hawk',   name: 'Harbour Hawks',     abbr: 'HAW', c1: '#1fb7cc', c2: '#0c2f45', c3: '#ffe0a0' },
  { id: 'wave',   name: 'Monsoon Riders',    abbr: 'MON', c1: '#7a6bff', c2: '#1d1650', c3: '#7fe3ff' },
  { id: 'fin',    name: 'Saltpan Sharks',    abbr: 'SAL', c1: '#ff6f5e', c2: '#3d1012', c3: '#ffffff' },
  { id: 'horn',   name: 'Copperhill Rhinos', abbr: 'COP', c1: '#f4a640', c2: '#3a2408', c3: '#ffffff' },
  { id: 'rocket', name: 'Riverbend Rockets', abbr: 'RIV', c1: '#57c96d', c2: '#0e3318', c3: '#ffd34d' },
  { id: 'star',   name: 'Northgate Comets',  abbr: 'NOR', c1: '#e85bb8', c2: '#3a0d2d', c3: '#ffe0a0' },
];
const SURN = ['Iyer','Khan','Fernando','Clarke','Mendis','Rao','Brooks','Joseph','Naidu','Hussain','Walsh','Perera','Kapoor','Malik','Reid','Thomas','Baig','Lewis','Chandra','Hart','Silva','Ahmed','Nair','Grant','Dube','Okafor','Pillai','Shaw','Varma','Coleman','Bose','Wright','Asante','Mehta','Quinn','Sandhu'];
const INIT = 'ABDGHJKMNPRSTVY';
function roster() {
  const names = [...SURN].sort(() => Math.random() - 0.5).slice(0, 11);
  const nums = [...Array(98).keys()].map(i => i + 1).sort(() => Math.random() - 0.5);
  return names.map((s, i) => ({ name: INIT[Math.floor(Math.random() * INIT.length)] + '. ' + s, short: s, num: nums[i], skin: Math.floor(Math.random() * 6) }));
}
const FIELD = [
  { role: 'keeper',     x: 0.2,  z: -13.2, speed: 4.5, react: 0.12, reach: 1.5 },
  { role: 'slip',       x: -1.9, z: -13.8, speed: 5,   react: 0.15, reach: 1.4 },
  { role: 'point',      x: -22,  z: -8.5 },
  { role: 'cover',      x: -24,  z: 6 },
  { role: 'mid-off',    x: -10,  z: 20 },
  { role: 'mid-on',     x: 10,   z: 20 },
  { role: 'midwicket',  x: 24,   z: 4 },
  { role: 'square leg', x: 22,   z: -12 },
  { role: 'fine leg',   x: 30,   z: -50 },
  { role: 'long-off',   x: -34,  z: 48 },
];
const BAT_POS = { x: 0.42, z: -9.3 }, NS_POS = { x: -1.3, z: 9.6 };

const S = {
  phase: 'loading',
  settings: { team: 0, overs: 2, level: 'pro', time: 'night', start: 'toss' },
  match: null, B: null,
  bowlType: 'pace', target: { x: -0.05, z: -4.2 },
  cam: 'orbit', slow: 1, slowT: 0, shake: 0, paused: false,
  recT: 0, replay: null,
};
const G = {};   // rigs

/* ---------- crests ---------- */
const crestCache = {};
function crest(team) {
  if (crestCache[team.id]) return crestCache[team.id];
  const c = document.createElement('canvas'); c.width = 200; c.height = 232;
  const g = c.getContext('2d');
  const shield = () => { g.beginPath(); g.moveTo(14, 14); g.lineTo(186, 14); g.lineTo(186, 112); g.quadraticCurveTo(186, 186, 100, 222); g.quadraticCurveTo(14, 186, 14, 112); g.closePath(); };
  g.save(); shield(); g.fillStyle = '#0b0f18'; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 10; g.fill(); g.restore();
  g.save(); g.translate(100, 116); g.scale(0.94, 0.94); g.translate(-100, -116); shield();
  const gr = g.createLinearGradient(0, 14, 0, 222); gr.addColorStop(0, team.c1); gr.addColorStop(1, team.c2); g.fillStyle = gr; g.fill();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = -4; i < 10; i++) { g.beginPath(); g.moveTo(i * 34, 0); g.lineTo(i * 34 + 16, 0); g.lineTo(i * 34 - 84, 240); g.lineTo(i * 34 - 100, 240); g.fill(); }
  g.fillStyle = team.c2; g.fillRect(0, 0, 200, 54);
  g.fillStyle = team.c3; g.fillRect(0, 54, 200, 5);
  g.fillStyle = '#fff'; g.font = '900 40px "Saira Condensed","Arial Narrow",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(team.abbr, 100, 36);
  g.translate(100, 132); g.fillStyle = '#fff'; g.strokeStyle = team.c2; g.lineWidth = 5;
  const P = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); g.stroke(); };
  switch (team.id) {
    case 'hawk': P([[-62, -18], [0, 22], [62, -18], [44, 6], [12, 40], [0, 34], [-12, 40], [-44, 6]]); P([[-10, -4], [0, -26], [10, -4], [0, 8]]); break;
    case 'wave': for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = -60; x <= 60; x += 4) g.lineTo(x, -14 + k * 22 + Math.sin(x / 12 + k) * 7); g.lineWidth = 9; g.strokeStyle = '#fff'; g.stroke(); } g.lineWidth = 5; g.beginPath(); g.moveTo(0, -56); g.quadraticCurveTo(18, -30, 0, -24); g.quadraticCurveTo(-18, -30, 0, -56); g.fill(); break;
    case 'fin': P([[-52, 34], [-8, -50], [30, 34]]); g.beginPath(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.moveTo(-70, 40); for (let x = -70; x <= 70; x += 5) g.lineTo(x, 40 + Math.sin(x / 9) * 5); g.stroke(); break;
    case 'horn': P([[-50, 40], [-30, -10], [10, -20], [40, -60], [36, -14], [54, 10], [50, 40]]); g.fillStyle = team.c2; g.beginPath(); g.arc(10, 6, 7, 0, 7); g.fill(); break;
    case 'rocket': P([[0, -62], [20, -30], [20, 22], [36, 42], [10, 34], [0, 46], [-10, 34], [-36, 42], [-20, 22], [-20, -30]]); g.fillStyle = team.c3; g.beginPath(); g.moveTo(-8, 48); g.lineTo(0, 70); g.lineTo(8, 48); g.fill(); g.fillStyle = team.c2; g.beginPath(); g.arc(0, -16, 9, 0, 7); g.fill(); break;
    default: { const st = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 18 : 42, a = -Math.PI / 2 + i * Math.PI / 5; st.push([18 + Math.cos(a) * r, -10 + Math.sin(a) * r]); } P(st); g.lineWidth = 8; g.strokeStyle = '#fff'; [[-20, 20, -66, 50], [-10, 32, -50, 66], [-28, 6, -70, 24]].forEach(l => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); }
  }
  g.restore();
  g.save(); shield(); g.lineWidth = 7; g.strokeStyle = team.c3; g.stroke(); g.restore();
  return (crestCache[team.id] = c.toDataURL());
}

/* ---------- players ---------- */
function buildRigs() {
  const t = TEAMS[0];
  G.fielders = FIELD.map((f, i) => { const P = RIG.build(W.scene, t, { keeper: f.role === 'keeper', number: i + 2, name: '' }); P.data = f; P.home = { x: f.x, z: f.z }; return P; });
  G.bowler = RIG.build(W.scene, t, { number: 9, name: '' });
  G.bowler.data = { role: 'bowler' };
  G.striker = RIG.build(W.scene, t, { batter: true, number: 1, name: '' });
  G.nonStriker = RIG.build(W.scene, t, { batter: true, number: 2, name: '' });
  G.all = [...G.fielders, G.bowler, G.striker, G.nonStriker];
  G.fieldAll = [...G.fielders, G.bowler];
  G.all.forEach(P => { P.rest = 'idle'; P.lock = 0; });
  if (AV.ready) {
    G.fielders.forEach(P => AV.create(P, P.data.role === 'keeper' ? 'keeper' : 'fielder'));
    AV.create(G.bowler, 'fielder'); AV.create(G.striker, 'batter'); AV.create(G.nonStriker, 'batter');
  }
  const objs = [];
  G.all.forEach(P => { objs.push(P.g); Object.values(P.j).forEach(o => objs.push(o)); AV.replayObjects(P).forEach(o => objs.push(o)); });
  objs.push(W.ball, ...W.stumps[0]);
  W.recTrack(objs);
  resetPositions();
}
function kit(P, team, num, name) { if (P.av) AV.dress(P, team, num, name); else RIG.recolor(P, team, num, name); }
function act(P, name, dur, opt) { P.anim.play(name, Object.assign({ restart: true, fade: 0.12 }, opt || {})); P.lock = dur; }
function resetPositions() {
  G.fielders.forEach(P => {
    P.g.position.set(P.home.x, 0, P.home.z); P.target = null; P.lock = 0; P.extra = null; P.moveAnim = null;
    P.rest = P.data.role === 'keeper' ? 'keeper' : 'idle';
    RIG.face(P, 0, -9); P.anim.play(P.rest, { fade: 0.2 });
  });
  const b = G.bowler; b.g.position.set(0.1, 0, 22); b.g.rotation.y = Math.PI; b.target = null; b.lock = 0; b.rest = 'idle'; b.moveAnim = null; b.anim.play('idle', { fade: 0.1 });
  const st = G.striker; st.g.position.set(BAT_POS.x, 0, BAT_POS.z); st.g.rotation.y = -Math.PI / 2; st.target = null; st.lock = 0; st.rest = 'stance'; st.extra = null; st.moveAnim = null; st.anim.play('stance', { fade: 0.2 });
  const ns = G.nonStriker; ns.g.position.set(NS_POS.x, 0, NS_POS.z); ns.g.rotation.y = Math.PI; ns.target = null; ns.lock = 0; ns.rest = 'ns'; ns.moveAnim = null; ns.anim.play('ns', { fade: 0.2 });
  W.resetStumps(); W.hideBall();
}
const _bat = new THREE.Vector3(), _bowl = new THREE.Vector3(), _stumps = new THREE.Vector3(0, 0.9, -10);
function setLooks() {
  const ball = W.ball.visible ? W.ball.position : null, ph = S.phase;
  _bat.copy(G.striker.g.position).setY(1.4); _bowl.copy(G.bowler.g.position).setY(1.65);
  for (const P of G.all) {
    if (P === G.striker) { P.look = (ball && (ph === 'delivery' || ph === 'inplay')) ? ball : _bowl; P.lookW = 0.95; }
    else if (P === G.bowler) { P.look = (ph === 'runup' || ph === 'wait' || ph === 'aim' || ph === 'meter' || (ph === 'delivery' && S.B && S.B.t < 0.3)) ? _stumps : (ball || _bat); P.lookW = 0.9; }
    else { P.look = ball || _bat; P.lookW = 0.8; }
  }
}
function updateRigs(dt) {
  setLooks();
  for (const P of G.all) {
    const moving = RIG.step(P, dt);
    if (P.lock > 0) P.lock -= dt;
    else if (moving) P.anim.play(P.moveAnim || (P.target && P.target.speed < 3.2 ? 'jog' : 'run'), { fade: 0.15 });
    else P.anim.play(P.rest, { fade: 0.2 });
    P.anim.update(dt);
    AV.drive(P, dt);
  }
}
function handR(P, out) { return (P.av && AV.handWorld(P, 'R', out)) || P.j.haR.getWorldPosition(out || new THREE.Vector3()); }
function handPos(P, out) {
  if (P.av) { const a = AV.handWorld(P, 'L'), b = AV.handWorld(P, 'R'); return (out || new THREE.Vector3()).copy(a).add(b).multiplyScalar(0.5); }
  const a = P.j.haL.getWorldPosition(new THREE.Vector3()), b = P.j.haR.getWorldPosition(new THREE.Vector3());
  return (out || new THREE.Vector3()).copy(a).add(b).multiplyScalar(0.5);
}

/* ---------- match state ---------- */
function newInnings(bat) { return { bat, runs: 0, wkts: 0, balls: 0, overLog: [], all: [], stats: [], striker: 0, nonStriker: 1, next: 2, bowlerIdx: 10, bowlerType: 'pace', figs: {}, target: null, fours: 0, sixes: 0, wheel: [] }; }
function newMatch() {
  const ti = S.settings.team;
  let oi = Math.floor(Math.random() * 5); if (oi >= ti) oi++;
  const teams = [Object.assign({}, TEAMS[ti], { players: roster(), user: true }), Object.assign({}, TEAMS[oi], { players: roster(), user: false })];
  const overs = S.settings.overs;
  S.match = { teams, maxBalls: overs * 6, maxWkts: overs === 2 ? 3 : 5, inns: [], cur: 0, done: false, guide: 0 };
  W.paintCrowd(teams[0].c1, teams[1].c1);
}
const I = () => S.match.inns[S.match.cur];
const userBatting = () => !!S.match && I().bat === 0;
const oversText = b => `${Math.floor(b / 6)}.${b % 6}`;
function startInnings(batIdx) {
  const m = S.match, inn = newInnings(batIdx);
  inn.stats = m.teams[batIdx].players.map(p => ({ p, r: 0, b: 0, out: false, how: '' }));
  if (m.inns.length === 1) inn.target = m.inns[0].runs + 1;
  m.inns.push(inn); m.cur = m.inns.length - 1;
  const bat = m.teams[batIdx], fld = m.teams[1 - batIdx];
  G.fielders.forEach((P, i) => { const pl = fld.players[i + 1]; kit(P, fld, pl.num, pl.short); });
  G.batKey = '';
  newBowler();
  syncBatters(true);
  document.documentElement.style.setProperty('--team', bat.c1);
  document.documentElement.style.setProperty('--team2', bat.c2);
  document.documentElement.style.setProperty('--opp', fld.c1);
}
function newBowler() {
  const m = S.match, inn = I(), fld = m.teams[1 - inn.bat];
  const over = Math.floor(inn.balls / 6);
  inn.bowlerIdx = 10 - (over % 4);
  inn.bowlerType = ['pace', 'swing', 'spin', 'pace'][over % 4];
  if (fld.user) inn.bowlerType = S.bowlType;
  const pl = fld.players[inn.bowlerIdx];
  if (!inn.figs[inn.bowlerIdx]) inn.figs[inn.bowlerIdx] = { b: 0, r: 0, w: 0 };
  kit(G.bowler, fld, pl.num, pl.short);
}
function syncBatters(force) {
  const m = S.match, inn = I(), team = m.teams[inn.bat];
  const a = inn.stats[inn.striker].p, b = inn.stats[inn.nonStriker].p;
  const key = a.num + '/' + b.num;
  if (!force && key === G.batKey) return;
  G.batKey = key;
  kit(G.striker, team, a.num, a.short);
  kit(G.nonStriker, team, b.num, b.short);
}

/* ---------- HUD ---------- */
function updateHUD(newBall) {
  const m = S.match, inn = I(), team = m.teams[inn.bat], fld = m.teams[1 - inn.bat];
  $('#hCrest').src = crest(team);
  $('#hAbbr').textContent = team.abbr;
  $('#hScore').textContent = `${inn.runs}/${inn.wkts}`;
  $('#hOv').textContent = `${oversText(inn.balls)} / ${m.maxBalls / 6}`;
  const need = $('#hNeed');
  if (inn.target) { const n = inn.target - inn.runs, left = m.maxBalls - inn.balls; need.textContent = n > 0 ? `Need ${n} off ${left}` : 'Won'; need.className = 'bug-need'; }
  else { const rr = inn.balls ? (inn.runs / inn.balls * 6).toFixed(1) : '0.0'; need.textContent = `RR ${rr}`; need.className = 'bug-need plain'; }
  const nm = $('#hNeedM'); nm.textContent = need.textContent; nm.className = 'bug-sub' + (inn.target ? '' : ' plain');
  const bl = $('#hBalls'); bl.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const o = inn.overLog[i], e = document.createElement('i');
    if (o === undefined) e.className = 'e'; else { e.textContent = o === 0 ? '•' : o; e.className = 'r' + o + (newBall && i === inn.overLog.length - 1 ? ' new' : ''); }
    bl.appendChild(e);
  }
  const s = inn.stats[inn.striker], n = inn.stats[inn.nonStriker], f = inn.figs[inn.bowlerIdx] || { b: 0, r: 0, w: 0 }, bp = fld.players[inn.bowlerIdx];
  const card = (st, on) => `<div class="pc${on ? ' on' : ''}"><span class="num">${st.p.num}</span><span class="nm">${st.p.name}</span><span class="st">${st.r} <small>(${st.b})</small></span></div>`;
  $('#hCards').innerHTML = card(s, true) + card(n, false) +
    `<div class="pc bowl"><span class="num">${bp.num}</span><span class="nm">${bp.name} <small style="color:var(--muted);font-weight:600">${SIM.TYPES[inn.bowlerType].label}</small></span><span class="st">${f.w}-${f.r} <small>(${oversText(f.b)})</small></span></div>`;
  W.drawScreen({ team: team.name, score: `${inn.runs}/${inn.wkts}`, overs: `${oversText(inn.balls)} ov`, line: inn.target ? `Need ${Math.max(0, inn.target - inn.runs)} from ${m.maxBalls - inn.balls}` : `${fld.name} bowling`, c1: team.c1 });
}
let screenRevert = 0;
function screenEvent(kind, text, sub) { W.drawScreen({ event: { kind, text, sub } }); screenRevert = 3.4; }
const BANNERS = {
  six: { bg: 'linear-gradient(180deg,#fff6d0,#ffd34d 45%,#f08c0c)', bc: '#ffb21e', glow: 'rgba(255,190,60,.6)' },
  four: { bg: 'linear-gradient(180deg,#e9fbff,#5fd6ff 45%,#0a8ccc)', bc: '#1aa9e8', glow: 'rgba(60,190,255,.55)' },
  out: { bg: 'linear-gradient(180deg,#ffe3e7,#ff5a70 45%,#c4122f)', bc: '#e0213e', glow: 'rgba(255,60,90,.55)' },
  plain: { bg: 'linear-gradient(180deg,#ffffff,#d7e2f2)', bc: '#8aa0c0', glow: 'rgba(255,255,255,.3)' },
};
function banner(kind, big, sub) {
  const b = $('#banner'), st = BANNERS[kind] || BANNERS.plain;
  b.style.setProperty('--bg', st.bg); b.style.setProperty('--bc', st.bc); b.style.setProperty('--glow', st.glow);
  b.querySelector('.big').textContent = big; b.querySelector('.sub').textContent = sub || '';
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
function showTiming(dtv, label, shot) { $('#timing').hidden = false; $('#tLabel').textContent = label; $('#tShot').textContent = shot || ''; $('#tNeedle').style.left = (clamp(dtv / 0.2, -1, 1) * 50 + 50) + '%'; }
function setHint(h) { $('#hint').innerHTML = h || ''; }
function drawRadar() {
  const c = $('#radar'), g = c.getContext('2d'), w = c.width, cx = w / 2, s = (w / 2 - 8) / 64;
  const batView = S.lastView === 'bat';
  const map = (x, z) => batView ? [cx - x * s, cx - z * s] : [cx + x * s, cx + z * s];
  g.clearRect(0, 0, w, w);
  const gr = g.createRadialGradient(cx, cx, 0, cx, cx, SIM.BOUNDARY * s); gr.addColorStop(0, 'rgba(70,160,80,.75)'); gr.addColorStop(1, 'rgba(30,100,45,.75)');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cx, SIM.BOUNDARY * s, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,224,160,.95)'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; g.setLineDash([5, 5]); g.beginPath(); g.arc(cx, cx, 27.4 * s, 0, 7); g.stroke(); g.setLineDash([]);
  const [px, py] = map(0, 0); g.fillStyle = '#d7c39a'; g.fillRect(px - 4, py - 10 * s - 2, 8, 20 * s + 4);
  if (S.match && S.match.inns.length) {
    const wl = I().wheel || [], [ox, oy] = map(0, -8.6);
    g.lineCap = 'round';
    wl.slice(-14).forEach((e, i, arr) => {
      const [x, y] = map(e.x, e.z), last = i === arr.length - 1;
      g.strokeStyle = e.wk ? 'rgba(255,84,100,.95)' : e.runs >= 6 ? 'rgba(255,211,77,.95)' : e.runs >= 4 ? 'rgba(54,198,255,.95)' : 'rgba(255,255,255,.5)';
      g.lineWidth = last ? 3.4 : 1.8; g.beginPath(); g.moveTo(ox, oy); g.lineTo(x, y); g.stroke();
      if (last) { g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
    });
  }
  const fc = S.match ? S.match.teams[1 - I().bat].c1 : '#fff';
  G.fieldAll.forEach(P => { const [x, y] = map(P.g.position.x, P.g.position.z); g.fillStyle = '#04101a'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = fc; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill(); });
  g.fillStyle = '#fff';
  [G.striker, G.nonStriker].forEach(P => { const [x, y] = map(P.g.position.x, P.g.position.z); g.fillRect(x - 4, y - 4, 8, 8); });
  if (W.ball.visible) { const [x, y] = map(W.ball.position.x, W.ball.position.z); g.fillStyle = '#ffe36b'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
}

/* ---------- ball flow ---------- */
function fieldData() {
  return G.fielders.map(P => ({ role: P.data.role, x: P.g.position.x, z: P.g.position.z, speed: P.data.speed || 7, react: P.data.react || 0.3, reach: P.data.reach || 1.3 }))
    .concat([{ role: 'bowler', x: 0.5, z: 6.5, speed: 5.5, react: 0.3, reach: 1.3 }]);
}
function refreshFans() {
  GUIDE.fansUpdate(fieldData());
  const st = GUIDE.fanStates();
  document.querySelectorAll('#shotPad button').forEach(b => { const a = +b.dataset.aim; b.dataset.gap = st[a < -0.4 ? 0 : a > 0.4 ? 2 : 1] || ''; });
}
function setupBall() {
  resetPositions();
  $('#timing').hidden = true; $('#speed').hidden = true; $('#replayTag').hidden = true;
  W.marker.visible = false; W.bands.visible = false;
  GUIDE.reset(); GUIDE.fansShow(false); swingOn = false;
  syncBatters(false);
  const inn = I(), m = S.match, rookie = S.settings.level === 'rookie';
  S.B = { t: 0, ru: 0, swung: false, pending: null, contact: false, plan: null, it: 0, done: false };
  if (userBatting()) {
    S.lastView = 'bat'; S.cam = 'bat';
    const r = Math.random(), yk = rookie ? 0.05 : 0.15;
    const lz = r < yk ? SIM.rnd(-8.4, -7.9) : r < yk + 0.25 ? SIM.rnd(-7.6, -5.8) : r < 0.82 ? SIM.rnd(-5.4, -2.8) : SIM.rnd(-2.3, 0.6);
    const lx = clamp(-0.15 + SIM.gauss() * (rookie ? 0.18 : 0.25), -0.85, 0.5);
    S.B.del = SIM.delivery(inn.bowlerType, lx, lz);
    S.B.wait = 1.0; S.phase = 'wait';
    $('#bowlCtl').hidden = true; $('#shotPad').hidden = false; $('#hud').classList.add('batting');
    GUIDE.fanScale = rookie ? 1 : 0.75; refreshFans(); GUIDE.fansShow(true);
    const guide = m.guide < 6;
    $('#aimGuide').hidden = !guide;
    setHint(guide ? 'Press a <b>shot button</b> as the ball arrives · <b style="color:#58f08a">green</b> = a gap in the field' : '');
  } else {
    S.lastView = 'bowl'; S.cam = 'bowl';
    S.phase = 'aim';
    W.bands.visible = true; W.marker.visible = true; GUIDE.markTo(S.target.x, S.target.z); GUIDE.markFade(1);
    $('#bowlCtl').hidden = false; $('#meter').hidden = true; $('#bowlBtn').hidden = false; $('#types').hidden = false; $('#shotPad').hidden = true; $('#hud').classList.remove('batting');
    $('#aimGuide').hidden = true;
    setHint('Tap the pitch to set your length · <b>' + SIM.lengthZone(S.target.z) + '</b>');
  }
  updateHUD(false);
}
function startRunup() {
  S.phase = 'runup'; const B = S.B; B.ru = 0;
  const spin = B.del.type === 'spin';
  B.ruDur = spin ? 1.0 : 1.55; B.ruFrom = spin ? 15.5 : 24;
  B.bowlStarted = false;
  G.bowler.g.position.set(0.1, 0, B.ruFrom); G.bowler.g.rotation.y = Math.PI;
  G.bowler.lock = 99; G.bowler.anim.play('run', { fade: 0.2 });
  G.bowler.runAmp = spin ? 0.7 : 1.05;
  // fielders walk in
  G.fielders.forEach(P => { if (P.data.role === 'keeper' || P.data.role === 'slip') { P.rest = P.data.role === 'keeper' ? 'keeper' : 'ready'; return; } const dx = -P.g.position.x, dz = -9 - P.g.position.z, d = Math.hypot(dx, dz); P.target = { x: P.g.position.x + dx / d * 1.6, z: P.g.position.z + dz / d * 1.6, speed: 1.4, delay: 0.3 + Math.random() * 0.3, done: Q => { Q.rest = 'ready'; } }; P.moveAnim = 'jog'; });
  G.nonStriker.target = { x: NS_POS.x, z: NS_POS.z - 1.6, speed: 1.6, delay: B.ruDur * 0.6, noTurn: true }; G.nonStriker.moveAnim = 'jog';
  G.nonStriker.rest = 'nsBackup';
  W.recClear();
}
function release() {
  S.phase = 'delivery'; const B = S.B, d = B.del; B.t = 0;
  { const h = handR(G.bowler, new THREE.Vector3()); B.relOff = { x: h.x - d.pts[0], y: h.y - d.pts[1], z: h.z - d.pts[2] }; }
  B.relRec = S.recT;
  $('#speed').hidden = false; $('#speed').innerHTML = `${d.kmh} km/h <em>· ${d.label} · ${d.zone}</em>`;
  if (userBatting()) { W.marker.visible = true; GUIDE.markTo(d.lx, d.lz); GUIDE.markFade(0.95); }
  else {
    W.bands.visible = false; GUIDE.markTo(d.lx, d.lz); GUIDE.markFade(0.9); W.marker.visible = true;
    const inn = I(), m = S.match, rookie = S.settings.level === 'rookie';
    let loftP = rookie ? 0.22 : 0.3;
    if (inn.target) { const need = inn.target - inn.runs, left = m.maxBalls - inn.balls; loftP = clamp(0.25 + (need / Math.max(1, left) - 1.2) * 0.25, 0.15, 0.85); }
    const leave = d.lx < -0.6 && !d.hitsStumps && Math.random() < 0.55;
    const sigma = (0.042 + 0.065 * d.diff) * (rookie ? 1.3 : 1);
    B.plan = leave ? { leave: true } : { dt: SIM.gauss() * sigma, aim: SIM.aimFor(fieldData()), loft: Math.random() < loftP };
  }
  G.striker.lock = 0; G.striker.rest = 'backlift';
  G.bowler.target = { x: 0.35, z: 6.8, speed: 3.6, delay: 0.15 };
  SND.whoosh();
}
function shotClip(aim, loft, ballY) {
  if (ballY > 0.95) return aim > 0.15 ? 'cut' : 'pull';
  return loft ? 'loft' : 'drive';
}
function shotName(clip, aim, loft) {
  const side = aim > 0.4 ? 'off' : aim < -0.4 ? 'leg' : 'mid';
  if (clip === 'pull') return loft ? 'Hooked pull' : 'Pull shot';
  if (clip === 'cut') return loft ? 'Upper cut' : 'Square cut';
  if (loft) return side === 'off' ? 'Lofted cover drive' : side === 'leg' ? 'Slog over midwicket' : 'Lofted straight hit';
  return side === 'off' ? 'Cover drive' : side === 'leg' ? 'On drive' : 'Straight drive';
}
const SWING = { drive: { b: 27, c: 40, k: 47 }, loft: { b: -5, c: 54, k: 56 }, pull: { b: -34, c: 55, k: 22 }, cut: { b: -17, c: 25 + 30, k: 25 } };   // natural direction (deg) and joint sensitivities, measured
const GRADE_COL = { perfect: 0xffd34d, good: 0x7dffb0, ok: 0xffffff, edge: 0xff6b5a };
function trySwing(dtv, aim, loft, isUser) {
  const B = S.B;
  if (B.swung || S.phase !== 'delivery') return;
  B.swung = true;
  const rookie = S.settings.level === 'rookie';
  const k = B.del.window * (isUser && rookie ? 1.35 : 1);
  const g = SIM.grade(dtv, k);
  B.user = isUser; B.dtv = dtv; B.k = k;
  const clip = shotClip(aim, loft, B.del.ideal.y);
  B.clip = clip;
  const st = G.striker;
  B.shotName = shotName(clip, aim, loft);
  GUIDE.fansShow(false); if (isUser) GUIDE.fanPulse(aim);
  { // turn the whole stroke toward the chosen direction: hips lead, then chest, then bat
    const sw = SWING[clip] || SWING.drive, want = -aim * 1.4 * 57.3, d = clamp(want - sw.b, -105, 105);
    const yh = 0.55 * d / 57.3, yc = 0.3 * d / sw.c, yb = 0.15 * d / sw.k;
    st.extraK = 0;
    st.extra = p => { const k = st.extraK; p.hips[1] += yh * k; p.chest[1] += yc * k; p.bat[1] += yb * k; };
  }
  const ahead = Math.max(0, B.del.idealT - B.t);      // seconds until the ball reaches the hitting zone
  const tc = 0.12;
  if (g !== 'miss' && ahead > tc) B.swingDelay = ahead - tc;
  else { act(st, clip, 1.0, { t: g === 'miss' ? 0 : Math.max(0, tc - ahead), fade: 0.06 }); st.rest = 'stance'; }
  if (isUser) {
    const ms = Math.round(Math.abs(dtv) * 1000);
    const lbl = g === 'perfect' ? 'Perfect timing' : g === 'miss' ? (dtv < 0 ? 'Way too early' : 'Way too late') : `${dtv < 0 ? 'Early' : 'Late'} · ${ms} ms`;
    showTiming(dtv, lbl, B.shotName);
    S.match.guide++;
    $('#aimGuide').hidden = true;
  }
  if (g === 'miss') return;
  B.pending = { dtv, aim, loft };
  if (B.t >= B.del.idealT) doContact();
}
function doContact() {
  const B = S.B, p = B.pending; B.pending = null; B.contact = true;
  const pos = SIM.sample(B.del.pts, B.del.dt, B.t, {});
  const sh = SIM.shot(pos, p.dtv, p.aim, p.loft, B.k);
  if (!sh) return;
  B.shot = sh; B.fl = sh.fl; B.contactRec = S.recT;
  B.res = SIM.resolve(sh.fl, fieldData());
  const q = { perfect: 1, good: 0.7, ok: 0.4, edge: 0.2 }[sh.grade];
  if (sh.grade === 'edge') SND.edge(); else SND.hit(q);
  if (sh.grade === 'perfect' && !REDUCED) { S.slow = 0.3; S.slowT = 0.4; S.shake = 0.22; }
  S.phase = 'inplay'; B.it = 0;
  S.cam = 'chase';
  W.marker.visible = false;
  { const gc = GRADE_COL[sh.grade] || 0xffffff; GUIDE.swingColor(gc); GUIDE.traceBegin(); GUIDE.ray(sh.fl.phi, gc); B.maxY = 0; B.bounceMk = false; }
  if (B.user) $('#tShot').textContent = `${B.shotName} · ${Math.round(sh.fl.speed * 3.6)} km/h`;
  planFielding();
  if (sh.grade === 'perfect' && B.user) toast('Perfect timing');
}
function planFielding() {
  const B = S.B, r = B.res, fl = B.fl, n = fl.pts.length / 3 - 1;
  const endP = { x: fl.pts[n * 3], z: fl.pts[n * 3 + 2] };
  const data = fieldData();
  G.bowler.lock = 0; G.bowler.target = null; G.bowler.g.position.set(0.3, 0, 6.5); G.bowler.rest = 'ready';
  G.fieldAll.forEach(P => { P.target = null; P.moveAnim = null; if (P.data.role !== 'keeper') P.rest = 'ready'; });
  if (r.kind === 'caught' || r.kind === 'fielded') {
    const P = G.fieldAll[r.fielder], f = data[r.fielder];
    const arriveT = r.dropped ? r.catchT : (r.kind === 'caught' ? r.t : r.t);
    const d = Math.hypot(r.at.x - P.g.position.x, r.at.z - P.g.position.z);
    const travel = Math.max(0.15, arriveT - f.react);
    const dive = r.kind === 'caught' && d > 2.2 && (d / travel) > 6.5;
    B.chaser = P; B.dive = dive;
    // stop a little short so the hands, not the feet, meet the ball
    const k = dive ? Math.max(0, 1 - 1.6 / Math.max(d, 0.01)) : Math.max(0, 1 - 0.45 / Math.max(d, 0.01));
    const tx = P.g.position.x + (r.at.x - P.g.position.x) * k, tz = P.g.position.z + (r.at.z - P.g.position.z) * k;
    P.target = { x: tx, z: tz, speed: Math.max(1.5, Math.hypot(tx - P.g.position.x, tz - P.g.position.z) / Math.max(0.12, travel - (dive ? 0.25 : 0))), delay: f.react };
    P.rest = 'ready';
  } else {
    const bp = SIM.sample(fl.pts, fl.step, r.t, {});
    let best = null, bd = 1e9;
    G.fieldAll.forEach(P => { if (P.data.role === 'keeper') return; const d = Math.hypot(bp.x - P.g.position.x, bp.z - P.g.position.z); if (d < bd) { bd = d; best = P; } });
    if (best) best.target = { x: bp.x * 0.96, z: bp.z * 0.96, speed: 7.2, delay: 0.3 };
  }
  G.fieldAll.forEach(P => {
    if (P.target || P.data.role === 'keeper') return;
    const d = Math.hypot(endP.x - P.g.position.x, endP.z - P.g.position.z);
    if (d < 30) { const k = Math.min(1, 5 / d); P.target = { x: lerp(P.g.position.x, endP.x, k), z: lerp(P.g.position.z, endP.z, k), speed: 3, delay: 0.35 }; }
  });
  const kp = G.fielders[0]; kp.target = { x: 0.25, z: -10.7, speed: 3, delay: 0.3 }; kp.rest = 'keeperUp';
  B.runs = r.kind === 'fielded' ? r.runs : 0;
  if (r.kind === 'fielded') B.endT = Math.max(r.t + r.throwT, B.runs ? 0.3 + B.runs * SIM.RUN_LEG : 0) + 0.35;
  else if (r.kind === 'caught') B.endT = r.t + 1.0;
  else B.endT = r.t + 1.2;
  // batters set off
  if (B.runs > 0) {
    const legs = B.runs;
    const runner = (P, x, z0) => {
      let leg = 0;
      const next = () => { if (leg >= legs) { P.rest = P === G.striker ? 'stance' : 'ns'; return; } const z = (leg % 2 === 0 ? -z0 : z0); leg++; P.target = { x, z, speed: 18.6 / SIM.RUN_LEG, delay: leg === 1 ? 0.3 : 0.05, done: next }; };
      P.moveAnim = 'run'; P.runAmp = 1.1; next();
    };
    runner(G.striker, 0.9, BAT_POS.z); runner(G.nonStriker, -0.9, NS_POS.z - 1.6);
  }
}
function finishBall(o) {
  const m = S.match, inn = I(), B = S.B;
  if (B.done) return; B.done = true;
  S.phase = 'dead'; B.deadT = 0;
  inn.balls++; inn.runs += o.runs;
  const s = inn.stats[inn.striker]; s.b++; s.r += o.runs;
  const f = inn.figs[inn.bowlerIdx]; f.b++; f.r += o.runs;
  if (o.runs === 4) inn.fours++; if (o.runs === 6) inn.sixes++;
  inn.overLog.push(o.wicket ? 'W' : o.runs);
  inn.all.push(o.wicket ? 'W' : o.runs);
  if (o.wicket) {
    inn.wkts++; f.w++; s.out = true; s.how = o.how;
    B.outIdx = inn.striker;
    if (inn.wkts < m.maxWkts) { inn.striker = inn.next; inn.next++; }
  } else if (o.runs % 2 === 1) { [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker]; }
  GUIDE.traceEnd(); GUIDE.fansShow(false); W.marker.visible = false;
  if (B.contact && B.fl) {
    const r = B.res, e = (r && (r.kind === 'six' || r.kind === 'four')) ? SIM.sample(B.fl.pts, B.fl.step, r.t, {}) : { x: W.ball.position.x, z: W.ball.position.z };
    const d = Math.hypot(e.x, e.z + 8.6) || 1, k = Math.min(1, (SIM.BOUNDARY - 1) / d);
    inn.wheel.push({ x: e.x * k, z: (e.z + 8.6) * k - 8.6, runs: o.runs, wk: !!o.wicket });
  }
  updateHUD(true);
  if (o.banner) banner(o.banner[0], o.banner[1], o.banner[2]);
  // celebrations
  if (o.wicket) {
    W.crowdU.uCheer.value = userBatting() ? 0.2 : 1;
    if (userBatting()) SND.groan(); else { SND.swell(0.8); SND.horn(0.3); }
    screenEvent('OUT', 'OUT!', `${s.p.name} ${s.r} (${s.b})`);
    W.boardFlash('out');
    G.striker.rest = 'dejected'; G.striker.lock = 0; G.striker.moveAnim = 'dejected'; G.striker.extra = null;
    G.striker.target = { x: -14, z: -40, speed: 1.1, delay: 0.6 };
    const bw = G.bowler; act(bw, 'appeal', 0.9); bw.rest = 'celebrate';
    G.fieldAll.forEach(P => { if (P === bw) return; const d = Math.hypot(P.g.position.x - bw.g.position.x, P.g.position.z - bw.g.position.z); if (d < 40) { const a = Math.random() * 6.28; P.target = { x: bw.g.position.x + Math.cos(a) * 1.6, z: bw.g.position.z + Math.sin(a) * 1.6, speed: 6, delay: 0.2 + Math.random() * 0.3, done: Q => { Q.rest = 'celebrate'; } }; P.moveAnim = null; } });
  }
  S.cam = S.cam === 'chase' ? 'chase' : S.cam;
  B.replayKind = o.replay || null;
}
function afterBall() {
  const m = S.match, inn = I();
  S.replay = null; $('#replayTag').hidden = true;
  const chased = inn.target && inn.runs >= inn.target;
  if (inn.balls >= m.maxBalls || inn.wkts >= m.maxWkts || chased) { return m.cur === 0 ? showBreak() : showResult(); }
  if (inn.balls % 6 === 0) {
    [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
    const overRuns = inn.overLog.reduce((a, b) => a + (b === 'W' ? 0 : b), 0);
    inn.overLog = [];
    newBowler();
    toast(`End of over ${inn.balls / 6} · ${overRuns} run${overRuns === 1 ? '' : 's'}`);
  }
  setupBall();
}

/* ---------- replays ---------- */
function startReplay() {
  const B = S.B, kind = B.replayKind, range = W.recRange();
  if (!range) return afterBall();
  let t0, t1;
  if (kind === 'bowled') { t0 = B.stumpsRec - 0.75; t1 = B.stumpsRec + 1.1; }
  else { t0 = (B.contactRec != null ? B.contactRec : B.relRec) - 0.65; t1 = (B.eventRec != null ? B.eventRec : B.contactRec + 2) + 0.9; }
  t0 = Math.max(range[0], t0); t1 = Math.min(range[1], t1);
  if (t1 - t0 < 0.4) return afterBall();
  GUIDE.reset();
  S.replay = { kind, t0, t1, t: t0, speed: 0.42, catcher: B.chaser ? B.chaser.g.position.clone() : null };
  S.phase = 'replay'; S.cam = 'replay';
  $('#replayTag').hidden = false; $('#timing').hidden = true; $('#shotPad').hidden = true; $('#speed').hidden = true; setHint('');
  $('#banner').classList.remove('show');
  camPos.copy(replayCam(S.replay, true).pos);
}
const _rp = new THREE.Vector3(), _rl = new THREE.Vector3();
function replayCam(R) {
  const b = W.ball.position;
  let fov = 38;
  if (R.kind === 'bowled') { _rp.set(0.9, 0.42, -13.4); _rl.set(0, 0.45, -8.5); fov = 34; }
  else if (R.kind === 'caught' && R.catcher) {
    const c = R.catcher, dx = c.x, dz = c.z + 8, d = Math.hypot(dx, dz) || 1;
    _rp.set(-dx / d * 6 + (c.x * 0.15), 5 + d * 0.06, -8 - dz / d * 6); _rl.set(b.x, Math.max(0.5, b.y), b.z);
    fov = clamp(46 - Math.hypot(b.x - _rp.x, b.z - _rp.z) * 0.25, 18, 46);
  } else {
    const k = clamp((R.t - R.t0) / (R.t1 - R.t0), 0, 1);
    _rp.set(-17 + k * 4, 1.8 + k * 9, -7 + b.z * 0.25); _rl.set(b.x, Math.max(0.6, b.y), b.z);
    fov = clamp(30 + Math.hypot(b.x, b.z + 8) * 0.25, 30, 58);
  }
  return { pos: _rp, look: _rl, fov };
}

/* ---------- per-frame game logic ---------- */
const tmpV = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
let swingOn = false;
function tickGame(dt) {
  const B = S.B; if (!B) return;
  S.recT += dt;
  const st = G.striker;
  if (userBatting() && !B.swung && (S.phase === 'wait' || S.phase === 'runup' || S.phase === 'delivery')) { B.fanT = (B.fanT || 0) - dt; if (B.fanT <= 0) { B.fanT = 0.25; refreshFans(); } }

  if (S.phase === 'replay') {
    const R = S.replay;
    R.t += dt * R.speed;
    W.recApply(Math.min(R.t, R.t1));
    if (R.t >= R.t1) afterBall();
    return;
  }

  if (S.phase === 'wait') { B.wait -= dt; if (B.wait <= 0) startRunup(); }

  if (S.phase === 'aim' || S.phase === 'meter') {
    GUIDE.markTo(S.target.x, S.target.z);
    if (S.phase === 'meter') { B.mt += dt; B.mu = Math.sin(B.mt * 4.4); $('#mNeedle').style.left = (B.mu * 50 + 50) + '%'; }
  }

  if (S.phase === 'runup') {
    B.ru += dt;
    const k = Math.min(1, B.ru / B.ruDur), bw = G.bowler;
    bw.g.position.z = lerp(B.ruFrom, 9.45, k); bw.g.position.x = 0.1;
    bw.phase += dt * (3.2 + (B.ruFrom - 9.45) / B.ruDur * 1.1);
    if (!B.bowlStarted && B.ru >= B.ruDur - 0.38) { B.bowlStarted = true; act(bw, 'bowl', 0.8, { fade: 0.08 }); G.striker.rest = 'backlift'; G.striker.lock = 0; }
    if (userBatting()) { const show = S.settings.level === 'rookie' ? 0.15 : 0.4; W.marker.visible = k > show; GUIDE.markTo(B.del.lx, B.del.lz); GUIDE.markFade(0.35 + 0.65 * k); }
  }

  // animate everybody, then attach the ball to hands where needed
  if (st.extra && st.extraK < 1) st.extraK = Math.min(1, st.extraK + dt / 0.13);
  updateRigs(dt);
  { const a = st.anim, stroke = a.name === 'drive' || a.name === 'loft' || a.name === 'pull' || a.name === 'cut';
    if (stroke && a.t > 0.05 && a.t < 0.55) {
      if (!swingOn) { GUIDE.swingBegin(); swingOn = true; }
      st.bat.localToWorld(tmpA.set(0, -0.84, 0)); st.bat.localToWorld(tmpB.set(0, -0.4, 0)); GUIDE.swingPush(tmpA, tmpB);
    } else if (swingOn) { GUIDE.swingEnd(); swingOn = false; } }

  if (S.phase === 'runup') {
    const h = handR(G.bowler, tmpV);
    W.placeBall({ x: h.x, y: h.y - 0.06, z: h.z }, true); W.trail.visible = false;
    if (B.ru >= B.ruDur) release();
  }

  if (S.phase === 'delivery') {
    B.t += dt;
    const d = B.del, p = SIM.sample(d.pts, d.dt, B.t, {});
    if (B.relOff) { const k = Math.max(0, 1 - B.t / 0.14); p.x += B.relOff.x * k; p.y += B.relOff.y * k; p.z += B.relOff.z * k; }
    W.placeBall(p, B.t <= dt * 1.01);
    if (B.t > d.idealT - 0.25 && G.fielders[0].rest !== 'keeperUp') G.fielders[0].rest = 'keeperUp';
    if (B.swingDelay != null) { B.swingDelay -= dt; if (B.swingDelay <= 0) { act(st, B.clip, 1.0, { fade: 0.06 }); st.rest = 'stance'; B.swingDelay = null; } }
    if (!userBatting() && B.plan && !B.swung) {
      if (B.plan.leave) { if (B.t >= d.idealT - 0.25) { B.swung = true; act(st, 'leave', 0.9); st.rest = 'stance'; } }
      else if (B.t >= d.idealT + B.plan.dt - 0.02) trySwing(B.plan.dt, B.plan.aim, B.plan.loft, false);
    }
    if (B.pending && B.t >= d.idealT) doContact();
    if (S.phase !== 'delivery') return;
    if (!B.contact && d.hitsStumps && B.t >= d.stumpsT && !B.stumpsHit) {
      B.stumpsHit = true; B.stumpsRec = S.recT; SND.stumps(); W.breakStumps(d.speed / 36);
      if (!REDUCED) S.shake = 0.3;
      finishBall({ runs: 0, wicket: true, how: 'bowled', banner: ['out', 'Bowled!', `${d.kmh} km/h ${d.label.toLowerCase()} · ${d.zone.toLowerCase()}`], replay: 'bowled' });
      B.frozenBall = { x: 0, y: 0.3, z: -10.3 };
      return;
    }
    if (p.z < -12.85 || B.t >= d.dur) {
      SND.glove();
      const kp = G.fielders[0]; handPos(kp, tmpV);
      W.placeBall({ x: tmpV.x, y: tmpV.y, z: tmpV.z }, true);
      finishBall({ runs: 0, wicket: false });
      toast(B.swung ? 'Played and missed' : 'Left alone');
      B.keeperHold = true;
    }
  }

  if (S.phase === 'inplay') {
    B.it += dt;
    const r = B.res, fl = B.fl;
    let p;
    if (r.kind === 'six' || r.kind === 'four') {
      p = SIM.sample(fl.pts, fl.step, Math.min(B.it, fl.dur), {});
      if (!B.flashed && B.it >= r.t) {
        B.flashed = true; B.eventRec = S.recT;
        const six = r.kind === 'six';
        const dist = Math.round(Math.hypot(p.x, p.z + 8.1) + (six ? 12 : 0));
        banner(six ? 'six' : 'four', six ? 'Six!' : 'Four!', six ? `${dist} metres` : 'Into the boards');
        GUIDE.traceMark(p.x, p.z, six ? 0xffd34d : 0x36c6ff);
        screenEvent(six ? 'SIX' : 'FOUR', six ? 'SIX!' : 'FOUR!', six ? `${dist}m` : '');
        W.boardFlash(six ? 'six' : 'four');
        SND.swell(six ? 1 : 0.7); SND.stinger(six); if (six) SND.horn(0.6);
        W.crowdU.uCheer.value = 1;
        if (six) {
          const tc = new THREE.Color(S.match.teams[I().bat].c1), wc = new THREE.Color(0xffe0a0);
          for (let i = 0; i < 4; i++) setTimeout(() => W.fireworks(p.x * 1.35 + SIM.rnd(-20, 20), 46 + SIM.rnd(0, 16), p.z * 1.35 + SIM.rnd(-20, 20), [tc, wc, new THREE.Color(0xffffff)]), i * 230);
          act(st, 'raise', 2.2, { fade: 0.25 });
        }
      }
    } else {
      const P = B.chaser;
      const catchT = r.dropped ? r.catchT : r.t;
      if (P && B.dive && !B.dived && B.it >= catchT - 0.32) { B.dived = true; act(P, 'dive', 1.6, { fade: 0.06 }); P.target = null; }
      if (B.it < catchT) p = SIM.sample(fl.pts, fl.step, B.it, {});
      else if (r.kind === 'caught') {
        p = handPos(P, new THREE.Vector3());
        if (!B.flashed) {
          B.flashed = true; B.eventRec = S.recT; SND.glove(); GUIDE.traceMark(P.g.position.x, P.g.position.z, 0xff5468);
          if (!B.dive) { act(P, 'catch', 0.7, { fade: 0.08 }); }
          P.rest = 'celebrate';
          banner('out', 'Caught!', `${P.data.role === 'bowler' ? 'caught and bowled' : 'taken at ' + P.data.role}`);
        }
      } else {
        if (r.dropped && !B.dropFlash) { B.dropFlash = true; toast('Dropped!'); SND.groan(); }
        if (B.it < r.t) p = r.dropped ? { x: r.at.x, y: 0.05, z: r.at.z } : SIM.sample(fl.pts, fl.step, B.it, {});
        else {
          const tt = B.it - r.t, pick = 0.35;
          if (!B.picked) { B.picked = true; act(P, 'stop', 0.25, { fade: 0.06 }); GUIDE.traceMark(r.at.x, r.at.z, 0xffffff); }
          if (tt >= 0.15 && !B.thrown) { B.thrown = true; act(P, 'throw', 0.6, { fade: 0.05 }); const toB = Math.hypot(r.at.x, r.at.z - 10.06) < Math.hypot(r.at.x, r.at.z + 10.06); P.g.rotation.y = Math.atan2(-P.g.position.x, (toB ? 10 : -10) - P.g.position.z); }
          const hand = handR(P, new THREE.Vector3());
          if (tt < pick) p = hand;
          else {
            const k = clamp((tt - pick) / Math.max(0.1, r.throwT - pick), 0, 1);
            const toBowlerEnd = Math.hypot(r.at.x, r.at.z - 10.06) < Math.hypot(r.at.x, r.at.z + 10.06);
            if (!B.from) B.from = hand.clone();
            const dest = toBowlerEnd ? handPos(G.bowler, new THREE.Vector3()) : handPos(G.fielders[0], new THREE.Vector3());
            const dist = Math.hypot(dest.x - B.from.x, dest.z - B.from.z);
            p = { x: lerp(B.from.x, dest.x, k), y: lerp(B.from.y, dest.y, k) + Math.sin(k * Math.PI) * dist * 0.07, z: lerp(B.from.z, dest.z, k) };
            if (k >= 1 && !B.caughtThrow) { B.caughtThrow = true; SND.glove(); }
          }
        }
      }
    }
    W.placeBall(p, false);
    GUIDE.tracePush(p);
    B.maxY = Math.max(B.maxY || 0, p.y);
    if (!B.bounceMk && B.maxY > 1.4 && p.y < 0.09) { B.bounceMk = true; GUIDE.traceMark(p.x, p.z, 0xffffff); }
    if (B.it >= B.endT) {
      const runs = r.runs || 0;
      if (r.kind === 'caught') finishBall({ runs: 0, wicket: true, how: 'caught', replay: 'caught' });
      else if (r.kind === 'six') finishBall({ runs, replay: 'six' });
      else if (r.kind === 'four') finishBall({ runs, replay: B.shot.grade === 'perfect' && Math.random() < 0.5 ? 'four' : null });
      else finishBall({ runs, banner: runs ? ['plain', `${runs} run${runs > 1 ? 's' : ''}`, ''] : null });
      if (!runs && r.kind === 'fielded') toast(r.dropped ? 'Dropped · no run' : 'Fielded · no run');
    }
  }

  if (S.phase === 'dead') {
    B.deadT += dt;
    if (B.keeperHold) { handPos(G.fielders[0], tmpV); W.placeBall({ x: tmpV.x, y: tmpV.y, z: tmpV.z }, true); W.trail.visible = false; }
    if (B.frozenBall) { W.placeBall(B.frozenBall, true); W.trail.visible = false; }
    if (B.res && B.res.kind === 'caught' && B.chaser) { handPos(B.chaser, tmpV); W.placeBall({ x: tmpV.x, y: tmpV.y, z: tmpV.z }, true); W.trail.visible = false; }
    if (B.replayKind && B.deadT > 1.5) { startReplay(); return; }
    if (!B.replayKind && B.deadT > 1.9) afterBall();
  }
  if (S.phase === 'delivery' || S.phase === 'inplay' || (S.phase === 'dead' && B.deadT < 1.5)) W.recCapture(S.recT);
}

/* ---------- camera ---------- */
const camPos = new THREE.Vector3(0, 20, 60), camLook = new THREE.Vector3();
const tA = new THREE.Vector3(), tB = new THREE.Vector3();
function tickCamera(dt, t) {
  const cam = W.camera, narrow = innerWidth < innerHeight;
  let pos, look, fov = 50, k = 1 - Math.pow(0.002, dt);
  if (S.cam === 'orbit') {
    const a = t * 0.045 + 0.6;
    pos = tA.set(Math.sin(a) * 52, 11 + Math.sin(t * 0.13) * 3, Math.cos(a) * 52); look = tB.set(0, 3, 0); fov = narrow ? 62 : 48; k = 1;
  } else if (S.cam === 'vs') {
    const a = t * 0.12;
    pos = tA.set(Math.sin(a) * 9 + 1, 2.2, -9 + Math.cos(a) * 9); look = tB.set(0.3, 1.1, -9.3); fov = 40; k = 1;
  } else if (S.cam === 'bat') {
    pos = tA.set(-0.75, narrow ? 3.7 : 3.3, narrow ? -15.2 : -14.6); look = tB.set(-0.1, 0.25, 5); fov = narrow ? 62 : 46;
  } else if (S.cam === 'bowl') {
    const aiming = S.phase === 'aim' || S.phase === 'meter';
    pos = tA.set(0.5, aiming ? 7.5 : 3.3, aiming ? 19.5 : 25.5); look = tB.set(0, 0.4, aiming ? -5 : -8); fov = narrow ? 64 : 48;
    if (!aiming && S.B && S.phase === 'runup') { pos.z = Math.max(G.bowler.g.position.z + 4.5, 13.5); }
    if (!aiming && S.phase === 'delivery') pos.z = 13.5;
  } else if (S.cam === 'chase') {
    const b = W.ball.position, bx = 0, bz = -8;
    const dx = b.x - bx, dz = b.z - bz, d = Math.hypot(dx, dz) || 1;
    const back = Math.min(18, 8 + d * 0.2);
    pos = tA.set(bx - dx / d * back, 8 + Math.min(16, d * 0.22), bz - dz / d * back);
    look = tB.set(b.x, Math.max(0.6, b.y * 0.85), b.z);
    fov = clamp(54 - d * 0.18, 36, 54) + (narrow ? 12 : 0);
    k = 1 - Math.pow(0.02, dt);
  } else if (S.cam === 'replay' && S.replay) {
    const r = replayCam(S.replay); pos = r.pos; look = r.look; fov = r.fov + (narrow ? 14 : 0); k = 1 - Math.pow(0.0005, dt);
  }
  if (pos) { camPos.lerp(pos, k); camLook.lerp(look, Math.min(1, k * 1.6)); }
  cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
  cam.position.copy(camPos);
  if (S.shake > 0) { cam.position.x += (Math.random() - 0.5) * S.shake * 0.5; cam.position.y += (Math.random() - 0.5) * S.shake * 0.5; S.shake = Math.max(0, S.shake - dt); }
  cam.lookAt(camLook);
}

/* ---------- input ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function aimPitch(ev) {
  ndc.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, W.camera);
  const hit = new THREE.Vector3();
  if (ray.ray.intersectPlane(groundPlane, hit)) {
    S.target.x = clamp(hit.x, -0.95, 0.75); S.target.z = clamp(hit.z, -8.6, 1.6);
    setHint('Tap the pitch to set your length · <b>' + SIM.lengthZone(S.target.z) + '</b>');
  }
}
function userSwing(aim, loft) { if (S.phase !== 'delivery' || !userBatting() || S.paused) return; trySwing(S.B.t - S.B.del.idealT, aim, loft, true); }
let dragging = false;
$('#c').addEventListener('pointerdown', ev => {
  SND.init();
  if (S.paused) return;
  if (S.phase === 'replay') { if (S.replay) S.replay.t = S.replay.t1; return; }
  if (S.phase === 'aim') { dragging = true; aimPitch(ev); return; }
  if (S.phase === 'meter') { releaseMeter(); return; }
  if (S.phase === 'delivery' && userBatting()) { userSwing(clamp(((ev.clientX / innerWidth) * 2 - 1) * 1.15, -1, 1), ev.clientY < innerHeight * 0.55); return; }
  if (S.phase === 'inplay' && S.B && S.B.it > 0.6) { const B = S.B; if (B.res && (B.res.kind === 'six' || B.res.kind === 'four') && !B.flashed) B.it = B.res.t; else B.it = Math.max(B.it, B.endT - 0.05); }
});
addEventListener('pointermove', ev => { if (dragging && S.phase === 'aim') aimPitch(ev); });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('keydown', ev => {
  if (ev.code === 'Escape' && S.match && !$('#hud').hidden) { togglePause(); return; }
  if (S.paused) return;
  if (S.phase === 'replay' && (ev.code === 'Space' || ev.code === 'Enter')) { ev.preventDefault(); S.replay.t = S.replay.t1; return; }
  if (S.phase === 'delivery' && userBatting()) {
    const map = { ArrowLeft: [-0.75, false], ArrowDown: [0, false], ArrowRight: [0.75, false], KeyQ: [-0.75, true], ArrowUp: [0, true], KeyE: [0.75, true], Space: [0, false] };
    const a = map[ev.code]; if (a) { ev.preventDefault(); userSwing(a[0], a[1]); }
    return;
  }
  if (S.phase === 'aim') {
    const s = { ArrowLeft: [0.08, 0], ArrowRight: [-0.08, 0], ArrowUp: [0, -0.4], ArrowDown: [0, 0.4] }[ev.code];
    if (s) { ev.preventDefault(); S.target.x = clamp(S.target.x + s[0], -0.95, 0.75); S.target.z = clamp(S.target.z + s[1], -8.6, 1.6); setHint('Tap the pitch to set your length · <b>' + SIM.lengthZone(S.target.z) + '</b>'); }
    if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); startMeter(); }
    return;
  }
  if (S.phase === 'meter' && (ev.code === 'Space' || ev.code === 'Enter')) { ev.preventDefault(); releaseMeter(); }
});
function startMeter() {
  if (S.phase !== 'aim') return;
  SND.click();
  S.phase = 'meter'; S.B.mt = Math.random() * 3; S.B.mu = 0;
  $('#meter').hidden = false; $('#bowlBtn').hidden = true; $('#types').hidden = true;
  setHint('Stop the needle in the <b>middle</b> for an accurate ball');
}
function releaseMeter() {
  if (S.phase !== 'meter') return;
  const u = S.B.mu, a = Math.abs(u), sign = Math.random() < 0.5 ? -1 : 1;
  const lx = clamp(S.target.x + u * 0.45, -1.1, 0.9), lz = clamp(S.target.z + a * 1.5 * sign, -8.9, 2);
  S.B.del = SIM.delivery(S.bowlType, lx, lz);
  toast(a < 0.15 ? 'Perfect release' : a < 0.45 ? 'Good release' : 'Wayward');
  $('#bowlCtl').hidden = true;
  GUIDE.markTo(lx, lz); W.bands.visible = false; W.marker.visible = false;
  setHint('');
  startRunup();
}
$('#bowlBtn').addEventListener('click', startMeter);
$('#shotPad').addEventListener('pointerdown', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  ev.preventDefault(); SND.init();
  b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  userSwing(+b.dataset.aim, b.dataset.loft === '1');
});
$('#types').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  SND.click();
  S.bowlType = b.dataset.t;
  $('#types').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  I().bowlerType = S.bowlType; updateHUD(false);
});
$('#bMute').addEventListener('click', () => { const on = SND.toggle(); $('#muteWave').style.display = on ? '' : 'none'; $('#bMute').setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on'); });
$('#bPause').addEventListener('click', togglePause);
$('#resumeBtn').addEventListener('click', togglePause);
$('#quitBtn').addEventListener('click', () => { S.paused = false; $('#pause').hidden = true; S.match = null; goMenu(); });
function togglePause() { S.paused = !S.paused; $('#pause').hidden = !S.paused; }

/* ---------- screens ---------- */
function showScreen(id) {
  ['menu', 'vs', 'brk', 'res'].forEach(s => { $('#' + s).hidden = s !== id; });
  $('#hud').hidden = !!id;
}
function goMenu() {
  S.phase = 'menu'; S.cam = 'orbit'; S.B = null; S.replay = null;
  resetPositions(); W.marker.visible = false; W.bands.visible = false;
  G.fielders.forEach(P => P.anim.play(P.data.role === 'keeper' ? 'keeper' : 'idle'));
  W.drawScreen({ team: 'FLOODLIGHT SIXES', score: 'T20', overs: '', line: 'Pick a team and play', c1: TEAMS[S.settings.team].c1 });
  showScreen('menu');
}
function pillSet(id, key, parse) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(parse(b.dataset.v) === S.settings[key])));
  el.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; S.settings[key] = parse(b.dataset.v); sync(); save(); SND.init(); SND.click(); if (key === 'time') W.setTime(S.settings.time); });
  sync();
}
function buildMenu() {
  const tp = $('#teamPick');
  TEAMS.forEach((t, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'team'; b.style.setProperty('--c', t.c1);
    b.setAttribute('aria-pressed', String(i === S.settings.team));
    b.innerHTML = `<img src="${crest(t)}" alt=""><b>${t.name}</b>`;
    b.addEventListener('click', () => { S.settings.team = i; tp.querySelectorAll('.team').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); save(); SND.init(); SND.click(); W.paintCrowd(t.c1, '#ffffff'); previewKits(); });
    tp.appendChild(b);
  });
  pillSet('#optOvers', 'overs', v => +v);
  pillSet('#optLevel', 'level', v => v);
  pillSet('#optTime', 'time', v => v);
  pillSet('#optStart', 'start', v => v);
  $('#playBtn').addEventListener('click', () => { SND.init(); newMatch(); showVs(); });
  $('#brkBtn').addEventListener('click', () => { startInnings(1); enterPlay(); });
  $('#againBtn').addEventListener('click', () => { newMatch(); showVs(); });
  $('#homeBtn').addEventListener('click', goMenu);
}
function previewKits() {
  const t = TEAMS[S.settings.team];
  G.fieldAll.forEach((P, i) => kit(P, t, i + 3, ''));
  kit(G.striker, t, 18, ''); kit(G.nonStriker, t, 45, '');
}
function save() { try { localStorage.setItem('fs-settings-v2', JSON.stringify(S.settings)); } catch (e) {} }
function showVs() {
  const m = S.match, A = m.teams[0], Bt = m.teams[1];
  S.phase = 'vs'; S.cam = 'vs';
  G.fieldAll.forEach((P, i) => { const pl = Bt.players[(i + 1) % 11]; kit(P, Bt, pl.num, pl.short); });
  kit(G.striker, A, A.players[0].num, A.players[0].short); kit(G.nonStriker, A, A.players[1].num, A.players[1].short);
  showScreen('vs');
  $('#vsKick').textContent = `${S.settings.time === 'day' ? 'Day' : 'Night'} match · ${m.maxBalls / 6} overs · ${m.maxWkts} wickets`;
  $('#vsA').src = crest(A); $('#vsB').src = crest(Bt); $('#vsAn').textContent = A.name; $('#vsBn').textContent = Bt.name;
  $('#coinA').src = crest(A); $('#coinB').src = crest(Bt);
  const coin = $('#coin'); coin.classList.remove('flip'); coin.style.transform = '';
  ['.vs-l', '.vs-r', '.vs-mid'].forEach(s => { const e = document.querySelector(s); e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; });
  $('#tossText').innerHTML = 'Call the toss. <b>Heads</b> shows your crest.';
  const btns = $('#tossBtns'); btns.innerHTML = '';
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'cta' + (cls ? ' ' + cls : ''); b.innerHTML = `<span>${label}</span>`; b.addEventListener('click', fn); btns.appendChild(b); return b; };
  if (S.settings.start === 'bat' || S.settings.start === 'bowl') {
    const bat = S.settings.start === 'bat';
    $('.coin-stage').hidden = true;
    $('#tossText').innerHTML = bat ? `You're <b>batting first</b>. Set a target for ${Bt.name}.` : `You're <b>bowling first</b>. Keep ${Bt.name} to a small total.`;
    mk(bat ? 'Walk out to bat' : 'Take the new ball', '', () => { startInnings(bat ? 0 : 1); enterPlay(); });
    return;
  }
  $('.coin-stage').hidden = false;
  const call = side => {
    SND.click(); btns.innerHTML = '';
    const heads = Math.random() < 0.5, won = (side === 'heads') === heads;
    const spins = 6 + Math.floor(Math.random() * 3);
    coin.style.setProperty('--spin', `${spins * 360 + (heads ? 0 : 180)}deg`);
    coin.style.setProperty('--spin-half', `${spins * 180}deg`);
    void coin.offsetWidth; coin.classList.add('flip');
    $('#tossText').textContent = 'The coin is in the air…';
    setTimeout(() => {
      SND.thud();
      if (won) {
        $('#tossText').innerHTML = `It's <b>${heads ? 'heads' : 'tails'}</b>. You won the toss. Bat or bowl?`;
        mk('Bat first', '', () => { startInnings(0); enterPlay(); });
        mk('Bowl first', 'alt', () => { startInnings(1); enterPlay(); });
      } else {
        const cpuBats = Math.random() < 0.5;
        $('#tossText').innerHTML = `It's <b>${heads ? 'heads' : 'tails'}</b>. ${Bt.name} won the toss and chose to <b>${cpuBats ? 'bat' : 'bowl'}</b>.`;
        mk(cpuBats ? 'Take the new ball' : 'Walk out to bat', '', () => { startInnings(cpuBats ? 1 : 0); enterPlay(); });
      }
    }, 1650);
  };
  mk('Heads', '', () => call('heads'));
  mk('Tails', 'alt', () => call('tails'));
}
function enterPlay() {
  showScreen(null); S.paused = false;
  setupBall();
  camPos.set(0, 25, -48);
}
function scoreCard(inn) {
  const m = S.match, t = m.teams[inn.bat];
  const best = inn.stats.filter(s => s.b > 0).sort((a, b) => b.r - a.r).slice(0, 3);
  return `<div class="card-line head"><span>${t.name}</span><b>${inn.runs}/${inn.wkts} <small>(${oversText(inn.balls)} ov)</small></b></div>` +
    best.map(s => `<div class="card-line"><span>${s.p.name}${s.out ? '' : '*'}</span><b>${s.r} <small>(${s.b})</small></b></div>`).join('') +
    `<div class="card-line"><span>Boundaries</span><b>${inn.fours} × 4 · ${inn.sixes} × 6</b></div>`;
}
function showBreak() {
  const m = S.match, inn = m.inns[0];
  S.phase = 'break'; S.cam = 'orbit'; S.B = null; resetPositions();
  showScreen('brk');
  const chaserIsUser = inn.bat === 1;
  $('#brkHead').textContent = `Target ${inn.runs + 1}`;
  $('#brkText').textContent = chaserIsUser ? `You need ${inn.runs + 1} from ${m.maxBalls} balls to win.` : `${m.teams[1].name} need ${inn.runs + 1} from ${m.maxBalls} balls. Bowl them out or keep it tight.`;
  $('#brkBtn').querySelector('span').textContent = chaserIsUser ? 'Start the chase' : 'Defend it';
  $('#brkCard').innerHTML = scoreCard(inn);
}
function playerOfMatch() {
  const m = S.match; let best = null;
  m.inns.forEach(inn => {
    inn.stats.forEach(s => { const v = s.r + (s.b ? s.r / s.b * 4 : 0); if (s.b && (!best || v > best.v)) best = { v, p: s.p, team: m.teams[inn.bat], fig: `${s.r} off ${s.b} balls` }; });
    Object.entries(inn.figs).forEach(([idx, f]) => { const v = f.w * 22 - f.r * 0.6 + 4; if (f.b && (!best || v > best.v)) best = { v, p: m.teams[1 - inn.bat].players[idx], team: m.teams[1 - inn.bat], fig: `${f.w} for ${f.r} from ${oversText(f.b)} overs` }; });
  });
  return best;
}
function showResult() {
  const m = S.match, A = m.inns[0], Bn = m.inns[1];
  m.done = true; S.phase = 'result'; S.cam = 'orbit'; S.B = null; resetPositions();
  let winner = null, text;
  if (Bn.runs >= Bn.target) { winner = Bn.bat; const w = m.maxWkts - Bn.wkts, left = m.maxBalls - Bn.balls; text = `${m.teams[Bn.bat].name} won by ${w} wicket${w === 1 ? '' : 's'}${left ? ` with ${left} ball${left === 1 ? '' : 's'} to spare` : ' off the last ball'}.`; }
  else if (Bn.runs === Bn.target - 1) text = 'Scores level. The match is tied.';
  else { winner = A.bat; const d = Bn.target - 1 - Bn.runs; text = `${m.teams[A.bat].name} won by ${d} run${d === 1 ? '' : 's'}.`; }
  const h = $('#resHead');
  h.textContent = winner === null ? 'Tied' : winner === 0 ? 'Victory' : 'Defeat';
  h.className = 'big-num ' + (winner === 0 ? 'win' : 'lose');
  $('#resKick').textContent = winner === 0 ? 'Full time · match won' : 'Full time';
  $('#resText').textContent = text;
  const pm = playerOfMatch(), po = $('#potm');
  if (pm) { po.hidden = false; po.style.setProperty('--pc', pm.team.c1); po.innerHTML = `<div class="shirt">${pm.p.num}</div><div><div class="t">Player of the match</div><div class="n">${pm.p.name}</div><div class="f">${pm.team.name} · ${pm.fig}</div></div>`; }
  else po.hidden = true;
  $('#resCard').innerHTML = scoreCard(A) + scoreCard(Bn);
  showScreen('res');
  if (winner === 0) {
    SND.swell(1, 4); SND.stinger(true); W.crowdU.uCheer.value = 1;
    const c = new THREE.Color(m.teams[0].c1), w = new THREE.Color(0xffe0a0);
    for (let i = 0; i < 8; i++) setTimeout(() => W.fireworks(SIM.rnd(-70, 70), 50, SIM.rnd(-70, 70), [c, w, new THREE.Color(0xffffff)]), i * 320);
    W.confetti([m.teams[0].c1, '#ffe0a0', '#ffffff', m.teams[0].c2], { x: 0, z: 0 }, 400);
    screenEvent('WIN', m.teams[0].abbr + ' WIN', text);
  }
}

/* ---------- loop ---------- */
let last = performance.now(), elapsed = 0, radarT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (document.hidden) return;
  elapsed += dt;
  if (S.slowT > 0) { S.slowT -= dt; dt *= S.slow; }
  if (!S.paused) {
    if (S.match && S.B) tickGame(dt);
    else updateRigs(dt);
  }
  if (screenRevert > 0) { screenRevert -= dt; if (screenRevert <= 0 && S.match && S.match.inns.length) updateHUD(false); }
  W.tickFx(dt, elapsed);
  SND.tick();
  tickCamera(dt, elapsed);
  if (!$('#hud').hidden) { radarT -= dt; if (radarT <= 0) { radarT = 0.05; drawRadar(); } }
  W.render();
}

/* ---------- boot ---------- */
async function start(data) {
  try { const s = JSON.parse(localStorage.getItem('fs-settings-v2') || 'null'); if (s && TEAMS[s.team]) Object.assign(S.settings, s); } catch (e) {}
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || Math.min(screen.width, screen.height) < 500;
  WORLD.init($('#c'), lowEnd ? 'mid' : 'high');
  const prog = {}, show = () => { const v = Object.values(prog); const p = v.length ? v.reduce((a, b) => a + b, 0) / 2 : 0; $('#loading').textContent = `Switching on the floodlights… ${Math.round(p * 100)}%`; };
  try { await Promise.all([AV.load('assets/', (f, p) => { prog[f] = p; show(); }), W.loadEnv('assets/')]); }
  catch (e) { console.warn('Assets did not load; using simple players', e); }
  W.setTime(S.settings.time);
  buildRigs();
  buildMenu();
  previewKits();
  W.paintCrowd(TEAMS[S.settings.team].c1, '#ffffff');
  $('#loading').hidden = true;
  const m = data && data.match;
  if (m && !m.done && m.inns && m.inns.length) {
    S.match = m;
    const inn = I(), bat = m.teams[inn.bat], fld = m.teams[1 - inn.bat];
    G.fielders.forEach((P, i) => { const pl = fld.players[i + 1]; kit(P, fld, pl.num, pl.short); });
    newBowler(); syncBatters(true); W.paintCrowd(m.teams[0].c1, m.teams[1].c1);
    document.documentElement.style.setProperty('--team', bat.c1); document.documentElement.style.setProperty('--team2', bat.c2); document.documentElement.style.setProperty('--opp', fld.c1);
    enterPlay();
  } else goMenu();
  requestAnimationFrame(t => { last = t; frame(t); });
}
window.claude?.hot?.snapshot?.(() => ({ match: S.match && !S.match.done ? S.match : null }));
if (typeof THREE === 'undefined') { $('#loading').textContent = 'The 3D engine did not load. Check your connection and reload.'; }
else {
  const boot = () => { if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start(window.claude?.hot?.data ?? {}); };
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(boot, boot);
}
