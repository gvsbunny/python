/* ===== Broadcast: TV camera rig, live director, multi-angle replays, third-umpire review, graphics ===== */
const BC = (() => {
  const X = { shot: { type: 'orbit', t: 0 }, fresh: true, hold: 0, lastCam: null };
  const P = new THREE.Vector3(), L = new THREE.Vector3(), T1 = new THREE.Vector3(), T2 = new THREE.Vector3();
  const posS = new THREE.Vector3(0, 20, 60), lookS = new THREE.Vector3(); let fov = 40, fovS = 40;
  const DEG = 180 / Math.PI;
  const TV = new THREE.Vector3(0.9, 13.5, 80);                 // high, end-on, behind the bowler
  const HIGH = [[0.9, 24, 86], [-0.9, 24, -86], [86, 24, -6], [-86, 24, -6], [61, 27, 61], [-61, 27, 61], [61, 27, -61], [-61, 27, -61]].map(a => new THREE.Vector3(a[0], a[1], a[2]));
  const narrow = () => innerWidth < innerHeight;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const fovFor = (size, dist, lo, hi) => cl(2 * Math.atan(size / Math.max(1, dist)) * DEG, lo, hi) + (narrow() ? Math.min(14, hi * 0.35) : 0);
  const $ = s => document.querySelector(s);

  function cut(type, o) { X.shot = Object.assign({ type, t: 0 }, o || {}); X.fresh = true; X.hold = (o && o.hold) || 0.9; }

  /* ---------- camera shots ---------- */
  function evalShot(sh, dt, t) {
    const k5 = 1 - Math.exp(-dt * 5), k8 = 1 - Math.exp(-dt * 8), b = W.ball.position;
    let kp = 1, kl = k8, kf = 1 - Math.exp(-dt * 4);
    switch (sh.type) {
      case 'orbit': { const a = t * 0.045 + 0.6; P.set(Math.sin(a) * 52, 11 + Math.sin(t * 0.13) * 3, Math.cos(a) * 52); L.set(0, 3, 0); fov = narrow() ? 62 : 48; kl = 1; break; }
      case 'vs': { const a = t * 0.12; P.set(Math.sin(a) * 9 + 1, 2.2, -9 + Math.cos(a) * 9); L.set(0.3, 1.1, -9.3); fov = 40; kl = 1; break; }
      case 'tv': P.copy(TV); L.set(0, 0.95, -6.0); fov = narrow() ? 14 : 8.4; break;
      case 'tvFollow': {
        P.copy(TV);
        const d = Math.hypot(b.x, b.z + 8.6);
        L.set(b.x, Math.max(0.6, b.y), b.z); fov = cl(8.4 + d * 0.8, 8.4, 40) + (narrow() ? 6 : 0); kl = 1 - Math.exp(-dt * 7); break;
      }
      case 'aim': P.set(0.5, 7.5, 19.5); L.set(0, 0.4, -5); fov = narrow() ? 64 : 48; break;
      case 'bat': P.set(-0.75, narrow() ? 3.7 : 3.3, narrow() ? -15.2 : -14.6); L.set(-0.1, 0.25, 5); fov = narrow() ? 62 : 46; break;
      case 'high': { P.copy(sh.C); L.set(b.x, Math.max(0.5, b.y), b.z); fov = fovFor(15, P.distanceTo(L), 8, 40); kl = k5; break; }
      case 'rope': case 'stand': {
        P.copy(sh.P); L.set(b.x, Math.max(0.5, b.y), b.z);
        fov = fovFor(sh.type === 'rope' ? 5 : 11, P.distanceTo(L), 10, 48); kl = k8; break;
      }
      case 'fielder': {
        P.copy(sh.P); const F = sh.F.g.position; L.set(F.x, 1.25, F.z).lerp(T1.set(b.x, Math.max(0.5, b.y), b.z), 0.35);
        fov = fovFor(3.4, P.distanceTo(L), 12, 40); kl = k5; break;
      }
      case 'crease': case 'tv3side': case 'tv3frame': {
        const e = sh.end, cz = e ? 8.84 : -8.84;
        P.set(-15.5, sh.type === 'crease' ? 1.15 : 0.85, cz); L.set(0, 0.45, cz);
        fov = (sh.type === 'tv3frame' ? 11 : sh.type === 'crease' ? 20 : 18) + (narrow() ? 12 : 0); break;
      }
      case 'tv3front': { const e = sh.end, sg = e ? 1 : -1, ez = e ? 10.06 : -10.06; P.set(-0.55, 0.55, ez + sg * 2.6); L.set(-0.2, 0.5, ez - sg * 6); fov = narrow() ? 46 : 34; break; }
      case 'follow': {
        const F = sh.F.g.position, r = sh.F.g.rotation.y, fx = Math.sin(r), fz = Math.cos(r);
        P.set(F.x + fx * 6.5 + fz * 1.2, 1.75, F.z + fz * 6.5 - fx * 1.2); L.set(F.x, 1.45, F.z);
        fov = narrow() ? 30 : 21; kp = 1 - Math.exp(-dt * 4); kl = k8; break;
      }
      case 'newBat': {
        const F = sh.F.g.position, T = sh.T; const dx = T.x - F.x, dz = T.z - F.z, d = Math.hypot(dx, dz) || 1;
        P.set(F.x + dx / d * 5.5 + 1.2, 1.7, F.z + dz / d * 5.5); L.set(F.x, 1.4, F.z); fov = narrow() ? 34 : 24; kp = 1 - Math.exp(-dt * 3); break;
      }
      case 'batterCU': { const F = sh.F.g.position, r = sh.F.g.rotation.y, fx = Math.sin(r), fz = Math.cos(r); P.set(F.x + fx * 3.6 + fz * 1.1, 1.6, F.z + fz * 3.6 - fx * 1.1); L.set(F.x, 1.4, F.z); fov = narrow() ? 34 : 22; kp = 1 - Math.exp(-dt * 2.5); break; }
      case 'spider': { const a = sh.t * 0.09 + 0.8; P.set(Math.sin(a) * 26, 28, -4 + Math.cos(a) * 20); L.set(0, 0, -2); fov = narrow() ? 62 : 46; kp = 1; kl = 1; break; }
      // replay angles (the ball and players come from the recording)
      case 'rp-bowled': P.set(0.9, 0.42, -13.4); L.set(0, 0.45, -8.5); fov = 34; break;
      case 'rp-sidelow': P.set(-6.5, 0.7, -9.6); L.set(0, 0.5, -9.4); fov = narrow() ? 44 : 30; break;
      case 'rp-generic': {
        const k = cl(sh.t / 3, 0, 1);
        P.set(-17 + k * 4, 1.8 + k * 9, -7 + b.z * 0.25); L.set(b.x, Math.max(0.6, b.y), b.z);
        fov = cl(30 + Math.hypot(b.x, b.z + 8) * 0.25, 30, 58) + (narrow() ? 12 : 0); kp = k5; kl = k8; break;
      }
      case 'rp-stand': P.copy(sh.P); L.set(b.x, Math.max(0.5, b.y), b.z); fov = fovFor(10, P.distanceTo(L), 12, 50); kl = k8; break;
      case 'rp-fielderclose': P.copy(sh.P); L.copy(sh.L); fov = narrow() ? 34 : 24; break;
      default: return null;
    }
    return { kp, kl, kf };
  }
  function update(dt, t) {
    // follow the game's coarse camera intent, unless the director or a replay owns the camera
    let want = null;
    if (S.cam === 'orbit') want = 'orbit';
    else if (S.cam === 'vs') want = 'vs';
    else if (S.cam === 'bat') want = S.settings.view === 'bat' ? 'bat' : 'tv';
    else if (S.cam === 'bowl') want = (S.phase === 'aim' || S.phase === 'meter') ? 'aim' : 'tv';
    if (want && X.shot.type !== want) cut(want);
    if (S.cam === 'chase' && X.lastCam !== 'chase') cut('tvFollow', { hold: 0.45 });
    X.lastCam = S.cam;
    const sh = X.shot; sh.t += dt;
    const r = evalShot(sh, dt, t); if (!r) return;
    if (X.fresh) { posS.copy(P); lookS.copy(L); fovS = fov; X.fresh = false; }
    else { posS.lerp(P, r.kp); lookS.lerp(L, r.kl); fovS += (fov - fovS) * r.kf; }
    const cam = W.camera; cam.fov = fovS; cam.updateProjectionMatrix();
    cam.position.copy(posS);
    if (S.shake > 0) { cam.position.x += (Math.random() - 0.5) * S.shake * 0.5; cam.position.y += (Math.random() - 0.5) * S.shake * 0.5; S.shake = Math.max(0, S.shake - dt); }
    cam.lookAt(lookS);
  }
  const view = () => X.shot.type;

  /* ---------- live director: picks the camera the way a TV producer would ---------- */
  function pickHigh(E) {
    const ox = 0, oz = -8.6; let ux = E.x - ox, uz = E.z - oz; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    let best = HIGH[0], bs = 1e9;
    for (const C of HIGH) {
      let vx = E.x - C.x, vz = E.z - C.z; const dv = Math.hypot(vx, vz) || 1; vx /= dv; vz /= dv;
      const s = Math.abs(vx * ux + vz * uz) + dv / 170 + (dv < 40 ? 1 : 0);
      if (s < bs) { bs = s; best = C; }
    }
    return best;
  }
  function direct(B, dt) {
    if (X.hold > 0) X.hold -= dt;
    const r = B.res, it = B.it, b = W.ball.position, d = Math.hypot(b.x, b.z + 8.6), type = X.shot.type, E = B.evt;
    if (B.ro && B.ro.k > 0 && B.ro.close && !B.cRO && it > r.t + 0.1) { B.cRO = true; cut('crease', { end: B.ro.end, hold: 5 }); return; }
    if (r.kind === 'caught' && !B.cC && it > (r.dropped ? r.catchT : r.t) - 0.8 && Math.hypot(r.at.x, r.at.z + 8.6) > 10) {
      B.cC = true; const F = B.chaser.g.position; let dx = 0 - F.x, dz = -8.6 - F.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      cut('fielder', { F: B.chaser, P: new THREE.Vector3(F.x + dx * 9 - dz * 3, 1.7, F.z + dz * 9 + dx * 3), hold: 3 }); return;
    }
    if (r.kind === 'six' && !B.c6 && it > r.t - 0.9) {
      B.c6 = true; const n = Math.hypot(E.x, E.z) || 1, nx = E.x / n, nz = E.z / n;
      cut('stand', { P: new THREE.Vector3(nx * 86 - nz * 14, 17, nz * 86 + nx * 14), hold: 3 }); return;
    }
    if (r.kind === 'four' && !B.c4 && it > r.t - 0.8) {
      B.c4 = true; const n = Math.hypot(E.x, E.z) || 1, nx = E.x / n, nz = E.z / n;
      cut('rope', { P: new THREE.Vector3(nx * 64.5 - nz * 9, 1.4, nz * 64.5 + nx * 9), hold: 3 }); return;
    }
    if (type === 'tvFollow' && X.hold <= 0 && it > 0.45 && (d > 15 || b.y > 7)) { cut('high', { C: pickHigh(E) }); return; }
    if (r.kind === 'fielded' && !B.cF && !B.cRO && type === 'high' && X.hold <= 0 && it > r.t - 0.55 && Math.hypot(r.at.x, r.at.z + 8.6) > 14) {
      B.cF = true; const F = B.chaser.g.position; let dx = 0 - F.x, dz = -8.6 - F.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      cut('fielder', { F: B.chaser, P: new THREE.Vector3(F.x + dx * 10 + dz * 3.5, 1.8, F.z + dz * 10 - dx * 3.5), hold: 1.2 }); return;
    }
    if (type === 'fielder' && r.kind === 'fielded' && B.thrown && !B.cT && X.hold <= 0) { B.cT = true; cut('tvFollow'); }
  }

  /* ---------- graphics ---------- */
  function lower(l1, l2, color) {
    const el = $('#lower'); el.querySelector('.l1').textContent = l1; el.querySelector('.l2').textContent = l2 || '';
    el.style.setProperty('--lc', color || 'var(--flood)'); el.hidden = false; $('#hud').classList.add('cap'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function lowerHide() { $('#lower').hidden = true; $('#hud').classList.remove('cap'); }
  function wipe() { const w = $('#wipe'); w.hidden = false; w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); }
  function tag(text, tv3) { const t = $('#replayTag'); t.hidden = false; t.classList.toggle('tv3', !!tv3); t.querySelector('b').textContent = text; }
  function decision(out, sub) {
    const d = $('#decision'); d.hidden = false; d.className = out ? 'out' : 'safe';
    d.querySelector('.d-big').textContent = out ? 'OUT' : 'NOT OUT'; d.querySelector('.d-sub').textContent = sub || '';
    void d.offsetWidth; d.classList.add('show');
  }

  /* ---------- replays ---------- */
  let RP = null;
  function standCam(B) {
    const E = B.evt || { x: 0, z: 60 }, n = Math.hypot(E.x, E.z) || 1, nx = E.x / n, nz = E.z / n;
    return new THREE.Vector3(nx * 84 + nz * 10, 15, nz * 84 - nx * 10);
  }
  function startReplay(B, kind, onDone) {
    const range = W.recRange(); if (!range) return onDone();
    const cr = B.contactRec != null ? B.contactRec : B.relRec, ev = B.eventRec != null ? B.eventRec : cr + 2;
    const segs = [];
    if (kind === 'bowled') { const s = B.stumpsRec; segs.push({ cam: 'rp-bowled', a: s - 0.75, b: s + 1.0, sp: 0.4, label: 'STUMP CAM' }, { cam: 'rp-sidelow', a: s - 0.5, b: s + 0.8, sp: 0.3, label: 'SIDE-ON' }); }
    else if (kind === 'caught') {
      const C = B.chaser.g.position; let dx = -C.x, dz = -8.6 - C.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      segs.push({ cam: 'rp-generic', a: cr - 0.6, b: ev + 0.3, sp: 0.45, label: 'REPLAY' }, { cam: 'rp-fielderclose', a: ev - 0.9, b: ev + 0.7, sp: 0.35, label: 'THE CATCH', P: new THREE.Vector3(C.x + dx * 6 + dz * 2, 1.6, C.z + dz * 6 - dx * 2), L: new THREE.Vector3(C.x, 1.4, C.z) });
    } else if (kind === 'six') segs.push({ cam: 'rp-generic', a: cr - 0.6, b: cr + 1.1, sp: 0.45, label: 'REPLAY' }, { cam: 'rp-stand', a: ev - 1.4, b: ev + 0.6, sp: 0.5, label: 'INTO THE CROWD', P: standCam(B) });
    else if (kind === 'runout') { const s = B.breakRec; segs.push({ cam: 'tv3side', a: s - 1.1, b: s + 0.4, sp: 0.35, label: 'SIDE-ON', end: B.ro.end }, { cam: 'tv3front', a: s - 0.9, b: s + 0.3, sp: 0.35, label: 'FRONT-ON', end: B.ro.end }); }
    else segs.push({ cam: 'rp-generic', a: cr - 0.6, b: ev + 0.8, sp: 0.45, label: 'REPLAY' });
    begin(B, segs, onDone, false);
  }
  function startTV3(B, out, sub, onDone) {
    const s = B.breakRec, e = B.ro.end;
    const segs = [
      { cam: 'tv3side', a: s - 1.2, b: s + 0.35, sp: 0.32, label: 'SIDE-ON', end: e },
      { cam: 'tv3front', a: s - 0.9, b: s + 0.25, sp: 0.32, label: 'FRONT-ON', end: e },
      { cam: 'tv3frame', a: s - 0.2, b: s + 0.02, step: 1 / 30, label: 'FRAME BY FRAME', end: e },
    ];
    W.ledT[e] = 0;
    W.drawScreen({ event: { kind: 'TV3', text: 'DECISION PENDING', sub: 'Run out · third umpire' } });
    begin(B, segs, onDone, true, out, sub);
  }
  function begin(B, segs, onDone, tv3, out, sub) {
    const range = W.recRange();
    segs.forEach(sg => { sg.a = Math.max(range[0], sg.a); sg.b = Math.min(range[1], sg.b); });
    RP = { B, segs: segs.filter(sg => sg.b - sg.a > (sg.step ? 0.05 : 0.3)), i: -1, onDone, tv3, out, sub, decT: 0 };
    S.phase = 'replay'; S.cam = 'replay';
    ['#timing', '#shotPad', '#speed', '#lower', '#aimGuide'].forEach(s => { $(s).hidden = true; }); $('#banner').classList.remove('show'); $('#hint').innerHTML = '';
    GUIDE.reset();
    next();
  }
  function next() {
    RP.i++;
    if (RP.i >= RP.segs.length) return finish();
    const sg = RP.segs[RP.i]; RP.t = sg.a; RP.hold = 0;
    wipe(); tag((RP.tv3 ? 'THIRD UMPIRE · ' : '') + sg.label, RP.tv3);
    cut(sg.cam, { end: sg.end, P: sg.P, L: sg.L });
  }
  function finish() {
    if (RP.tv3 && RP.decT === 0) {
      RP.decT = 2.2; $('#replayTag').hidden = true;
      W.creaseHL.forEach(m => { m.visible = false; });
      decision(RP.out, RP.sub);
      W.drawScreen({ event: { kind: RP.out ? 'OUT' : 'SAFE', text: RP.out ? 'OUT' : 'NOT OUT', sub: 'Third umpire' } });
      if (RP.out) { SND.swell(0.9); SND.horn(0.2); } else { SND.swell(0.6); }
      return;
    }
    end();
  }
  function end() {
    if (!RP) return;
    const R = RP; RP = null;
    $('#replayTag').hidden = true; $('#decision').hidden = true;
    W.creaseHL.forEach(m => { m.visible = false; }); W.setLED(0, false); W.setLED(1, false);
    R.onDone();
  }
  function tickReplay(dt) {
    if (!RP) return;
    if (RP.decT > 0) { RP.decT -= dt; if (RP.decT <= 0) end(); return; }
    const sg = RP.segs[RP.i];
    if (sg.step) { RP.hold += dt; if (RP.hold >= 0.5) { RP.hold = 0; RP.t += sg.step; } }
    else RP.t += dt * sg.sp;
    W.recApply(Math.min(RP.t, sg.b));
    if (RP.B.breakRec != null && RP.B.ro) { const e = RP.B.ro.end; W.setLED(e, RP.t >= RP.B.breakRec); W.creaseHL[e].visible = RP.tv3 && sg.cam === 'tv3frame'; }
    if (RP.t >= sg.b) next();
  }
  function skip() {
    if (!RP) return;
    if (RP.tv3 && RP.decT === 0) { RP.i = RP.segs.length; finish(); }
    else end();
  }
  const replaying = () => !!RP;

  return { cut, update, view, direct, lower, lowerHide, wipe, decision, startReplay, startTV3, tickReplay, skip, replaying, TV };
})();
