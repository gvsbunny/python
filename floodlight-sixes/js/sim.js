/* ===== Match physics and outcome model (no rendering) ===== */
const SIM = (() => {
  const RUN_FIRST = 2.2, RUN_LEG = 2.6;
  const G = 9.8, BOUNDARY = 62, HIT_Z = -8.1, STUMP_Z = -10.06, DT = 1 / 120, FD = 1 / 60;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const TYPES = {
    pace:  { label: 'Pace',  speed: [36, 40], swing: [0, 0],     turn: [0, 0],     seam: 0.6, bounce: 0.56, keep: 0.9 },
    swing: { label: 'Swing', speed: [32, 35], swing: [2.6, 4.2], turn: [0, 0],     seam: 0.2, bounce: 0.52, keep: 0.9 },
    spin:  { label: 'Spin',  speed: [21, 24], swing: [0, 0],     turn: [1.1, 2.0], seam: 0,   bounce: 0.5,  keep: 0.8 },
  };
  // Length is measured from the batter's stumps (z = -10.06)
  function lengthZone(lz) {
    const d = lz + 10.06;
    if (d < 2.2) return 'Yorker';
    if (d < 4.5) return 'Full';
    if (d < 7.5) return 'Good length';
    return 'Short';
  }
  function delivery(type, lx, lz) {
    const T = TYPES[type];
    const speed = rnd(T.speed[0], T.speed[1]);
    const R = { x: 0.3, y: 2.2, z: 9.3 };
    const t1 = (R.z - lz) / speed;
    const as = -rnd(T.swing[0], T.swing[1]);          // away-swing toward off side (-x)
    let vx = (lx - R.x - 0.5 * as * t1 * t1) / t1;
    let vy = (0.5 * G * t1 * t1 - R.y) / t1;
    let vz = -speed;
    const turn = rnd(T.turn[0], T.turn[1]) + gauss() * T.seam * 0.5;   // off-break turns toward leg (+x)
    const pts = [];
    let x = R.x, y = R.y, z = R.z, t = 0, bounced = false;
    let idealT = null, ideal = null, stumps = null, stumpsT = null;
    while (t < 3 && z > -15) {
      pts.push(x, y, z);
      const px = x, py = y, pz = z;
      if (!bounced) vx += as * DT;
      vy -= G * DT;
      x += vx * DT; y += vy * DT; z += vz * DT; t += DT;
      if (y <= 0 && vy < 0) {
        y = 0;
        if (!bounced) { bounced = true; vy = -vy * T.bounce; vx += turn; vz *= T.keep; }
        else { vy = -vy * 0.4; vz *= 0.85; vx *= 0.85; }
      }
      if (idealT === null && z <= HIT_Z) { const f = (pz - HIT_Z) / (pz - z); idealT = t - DT + f * DT; ideal = { x: px + (x - px) * f, y: py + (y - py) * f, z: HIT_Z }; }
      if (stumps === null && z <= STUMP_Z) { const f = (pz - STUMP_Z) / (pz - z); stumps = { x: px + (x - px) * f, y: py + (y - py) * f }; stumpsT = t - DT + f * DT; }
    }
    pts.push(x, y, z);
    const hitsStumps = !!stumps && Math.abs(stumps.x) < 0.13 && stumps.y < 0.74;
    const zone = lengthZone(lz);
    let diff = { Yorker: 0.85, Full: 0.45, 'Good length': 0.7, Short: 0.35 }[zone];
    if (Math.abs(lx) < 0.18) diff += 0.15;
    if (lx < -0.6 || lx > 0.45) diff -= 0.2;
    if (type === 'swing') diff += 0.08;
    if (type === 'spin' && zone === 'Good length') diff += 0.05;
    diff = Math.max(0, Math.min(1, diff));
    const window = zone === 'Yorker' ? 0.85 : type === 'spin' ? 1.15 : 1;
    return { type, label: T.label, speed, kmh: Math.round(speed * 3.6), pts, dt: DT, dur: t, idealT, ideal, stumpsT, hitsStumps, lx, lz, zone, diff, window };
  }
  function sample(pts, step, t, out) {
    const n = pts.length / 3 - 1;
    let f = t / step; if (f < 0) f = 0; if (f > n) f = n;
    const i = Math.min(Math.floor(f), n - 1 < 0 ? 0 : n - 1), a = f - i, j = Math.min(i + 1, n);
    out.x = pts[i * 3] + (pts[j * 3] - pts[i * 3]) * a;
    out.y = pts[i * 3 + 1] + (pts[j * 3 + 1] - pts[i * 3 + 1]) * a;
    out.z = pts[i * 3 + 2] + (pts[j * 3 + 2] - pts[i * 3 + 2]) * a;
    return out;
  }
  function grade(dtv, k = 1) {
    const a = Math.abs(dtv) / k;
    if (a <= 0.035) return 'perfect';
    if (a <= 0.075) return 'good';
    if (a <= 0.11) return 'ok';
    if (a <= 0.17) return 'edge';
    return 'miss';
  }
  // Ball flight after contact. phi: 0 = straight back past the bowler (+z), positive = leg side (+x).
  function flight(s, phi, speed, elev) {
    const h = Math.cos(elev) * speed;
    let vx = Math.sin(phi) * h, vz = Math.cos(phi) * h, vy = Math.sin(elev) * speed;
    let x = s.x, y = Math.max(0.3, s.y), z = s.z, t = 0;
    const pts = [];
    let firstBounce = null, boundaryT = null, boundaryAir = false, stopT = null;
    while (t < 10) {
      pts.push(x, y, z);
      const r = Math.hypot(x, z);
      if (boundaryT === null && r > BOUNDARY) { boundaryT = t; boundaryAir = firstBounce === null; }
      if (boundaryT !== null) {
        if (boundaryAir && (r > 82 || y < -1)) break;
        if (!boundaryAir && r > 64.2) { vx = vz = 0; }
        if (t > boundaryT + 1.6) break;
      }
      if (y > 0.0001 || vy > 0) {
        vy -= G * FD; x += vx * FD; y += vy * FD; z += vz * FD;
        if (y <= 0 && !(boundaryAir && boundaryT !== null)) {
          y = 0;
          if (firstBounce === null) firstBounce = t + FD;
          if (Math.abs(vy) > 2) { vy = -vy * 0.38; vx *= 0.75; vz *= 0.75; } else vy = 0;
        }
      } else {
        const sp = Math.hypot(vx, vz);
        if (sp > 0.05) { const ns = Math.max(0, sp - 5.0 * FD); vx *= ns / sp; vz *= ns / sp; x += vx * FD; z += vz * FD; }
        else if (stopT === null) stopT = t;
      }
      t += FD;
    }
    return { pts, step: FD, dur: t, firstBounce, boundaryT, boundaryAir, stopT, phi, speed, elev };
  }
  function shot(contact, dtv, aim, loft, k = 1) {
    const g = grade(dtv, k);
    if (g === 'miss') return null;
    let phi = -aim * 1.4 - dtv * 5;   // late (dtv > 0) drifts to the off side
    let speed, elev;
    if (g === 'edge') {
      if (dtv > 0) { phi = Math.PI + rnd(0.15, 0.6); speed = rnd(13, 20); elev = rnd(0.05, 0.3); }   // outside edge behind
      else { phi = rnd(-0.6, 0.6); speed = rnd(13, 18); elev = rnd(0.9, 1.2); }                     // leading edge, skied
    } else if (loft) {
      if (g === 'perfect') { speed = rnd(27.5, 32.5); elev = rnd(0.52, 0.66); }
      else if (g === 'good') { speed = rnd(21, 26); elev = rnd(0.45, 0.62); }
      else { speed = rnd(17, 22); elev = rnd(0.62, 0.85); }
    } else {
      if (g === 'perfect') { speed = rnd(29, 34); elev = rnd(0.03, 0.09); }
      else if (g === 'good') { speed = rnd(22, 27); elev = rnd(0.03, 0.12); }
      else { speed = rnd(13, 18); elev = rnd(0.05, 0.2); }
    }
    phi += gauss() * 0.06;
    return { grade: g, fl: flight(contact, phi, speed, elev) };
  }
  function fielded(t, j, at, extra) {
    const dEnd = Math.min(Math.hypot(at.x, at.z - 10.06), Math.hypot(at.x, at.z + 10.06));
    const throwT = 0.35 + dEnd / 30;
    const total = t + throwT;
    let runs = total >= RUN_FIRST ? 1 + Math.floor((total - RUN_FIRST) / RUN_LEG) : 0;
    runs = Math.min(runs, 3);
    return Object.assign({ kind: 'fielded', t, fielder: j, at, runs, throwT }, extra || {});
  }
  // Earliest moment any fielder can get to the ball decides the outcome.
  function resolve(fl, F) {
    const { pts, step, firstBounce, boundaryT, boundaryAir } = fl;
    const n = pts.length / 3;
    for (let i = 0; i < n; i++) {
      const t = i * step;
      if (boundaryT !== null && t >= boundaryT) return { kind: boundaryAir ? 'six' : 'four', t: boundaryT, runs: boundaryAir ? 6 : 4 };
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      if (y > 2.5) continue;
      let best = -1, margin = -1e9;
      for (let j = 0; j < F.length; j++) {
        const f = F[j];
        const reach = f.reach + (y < 1 ? 0.8 : 0);
        const m = Math.max(0, t - f.react) * f.speed + reach - Math.hypot(x - f.x, z - f.z);
        if (m >= 0 && m > margin) { best = j; margin = m; }
      }
      if (best < 0) continue;
      const air = firstBounce === null || t < firstBounce;
      if (air && y > 0.12) {
        const chance = margin > 1.2 ? 0.88 : 0.6;
        if (Math.random() < chance) return { kind: 'caught', t, fielder: best, at: { x, y, z }, runs: 0 };
        return fielded(t + 0.9, best, { x, y: 0, z }, { dropped: true, catchT: t });
      }
      return fielded(t + (Math.random() < 0.05 ? 0.8 : 0), best, { x, y, z });
    }
    const L = (n - 1) * 3;
    return fielded(n * step, 0, { x: pts[L], y: 0, z: pts[L + 2] });
  }
  function aimFor(F) {
    let bestAim = 0, bestScore = -1;
    for (let k = 0; k < 15; k++) {
      const aim = -1 + 2 * k / 14, phi = -aim * 1.4;
      let minA = 9;
      for (const f of F) {
        if (f.role === 'keeper' || f.role === 'slip') continue;
        let d = Math.atan2(f.x, f.z + 8.1) - phi;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        minA = Math.min(minA, Math.abs(d));
      }
      const s = minA + Math.random() * 0.3;
      if (s > bestScore) { bestScore = s; bestAim = aim; }
    }
    return bestAim;
  }
  return { RUN_LEG, G, BOUNDARY, HIT_Z, TYPES, rnd, gauss, delivery, sample, grade, shot, flight, resolve, aimFor, lengthZone };
})();
