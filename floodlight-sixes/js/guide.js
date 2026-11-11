/* ===== Visual guides: smooth ball trail, landing marker, shot-direction fans, shot trace, bat swing arc ===== */
const GUIDE = (() => {
  const G = { ready: false };
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const FONT = '"Saira Condensed","Arial Narrow",sans-serif';
  const CZ = -8.6;                                   // origin of the shot fans (batter's hitting spot)
  let W, scene;
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), TC = new THREE.Vector3(), RT = new THREE.Vector3();

  function ctex(w, h, draw, filter) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    t.userData = { canvas: c };
    return t;
  }

  /* ---------- ribbon strips: soft-edged, alpha-faded, any number of points ---------- */
  const SV = 'attribute float aA; attribute float aS; attribute vec3 aC; varying float vA; varying float vS; varying vec3 vC;\nvoid main(){ vA = aA; vS = aS; vC = aC; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const SF = 'uniform vec3 uColor; uniform float uOpacity; uniform float uSoft; uniform float uVC; varying float vA; varying float vS; varying vec3 vC;\nvoid main(){ float e = mix(1.0, 1.0 - smoothstep(0.2, 1.0, abs(vS)), uSoft); vec3 c = mix(uColor, vC, uVC); gl_FragColor = vec4(c, vA * e * uOpacity); }';
  function strip(n, o) {
    o = o || {};
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 6), al = new Float32Array(n * 2), sd = new Float32Array(n * 2), col = new Float32Array(n * 6);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (let i = 0; i < n; i++) { sd[i * 2] = -1; sd[i * 2 + 1] = 1; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(al, 1));
    geo.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
    geo.setAttribute('aC', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: lin(o.color == null ? 0xffffff : o.color) }, uOpacity: { value: o.opacity == null ? 1 : o.opacity }, uSoft: { value: o.soft == null ? 1 : o.soft }, uVC: { value: o.vc ? 1 : 0 } },
      vertexShader: SV, fragmentShader: SF, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = o.order || 6; mesh.visible = false;
    scene.add(mesh);
    return { mesh, geo, pos, al, col, n, mat, count: 0 };
  }
  function edge(s, i, a, b, alpha, c) {
    const k = i * 6;
    s.pos[k] = a.x; s.pos[k + 1] = a.y; s.pos[k + 2] = a.z; s.pos[k + 3] = b.x; s.pos[k + 4] = b.y; s.pos[k + 5] = b.z;
    s.al[i * 2] = s.al[i * 2 + 1] = alpha;
    if (c) { s.col[k] = s.col[k + 3] = c.r; s.col[k + 1] = s.col[k + 4] = c.g; s.col[k + 2] = s.col[k + 5] = c.b; }
  }
  function commit(s, count) {
    s.count = count;
    s.geo.setDrawRange(0, Math.max(0, (count - 1)) * 6);
    s.geo.attributes.position.needsUpdate = true; s.geo.attributes.aA.needsUpdate = true; s.geo.attributes.aC.needsUpdate = true;
  }

  /* ---------- ball trail (camera-facing tapered ribbon) ---------- */
  function initTrail() {
    G.trailN = 18; G.trailCount = 0;
    G.trailPts = []; for (let i = 0; i < G.trailN; i++) G.trailPts.push(new THREE.Vector3());
    G.trailS = strip(G.trailN, { color: 0xe4f2ff, opacity: 0.95, soft: 1, order: 7 });
    W.trail = G.trailS.mesh;
    // a crisp tracker ring that keeps the same size on screen so the ball is easy to follow at any distance
    const t = ctex(128, 128, (g, w) => {
      g.translate(64, 64);
      g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke();
      g.lineWidth = 5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke();
      for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(47, -5, 15, 10); g.fillStyle = '#fff'; g.fillRect(49, -3, 11, 6); g.restore(); }
    });
    G.tracker = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false, sizeAttenuation: false, color: lin(0xffe9a8) }));
    G.tracker.scale.set(0.05, 0.05, 1); G.tracker.renderOrder = 9; G.tracker.visible = false; scene.add(G.tracker);
  }
  G.trailPush = (p, reset) => {
    const pts = G.trailPts, y = Math.max(p.y, 0.06);
    if (reset) { for (const v of pts) v.set(p.x, y, p.z); G.trailCount = 1; }
    else { for (let i = pts.length - 1; i > 0; i--) pts[i].copy(pts[i - 1]); pts[0].set(p.x, y, p.z); G.trailCount = Math.min(G.trailCount + 1, pts.length); }
    G.trackPos = pts[0];
  };
  function buildTrail(cam) {
    const s = G.trailS, pts = G.trailPts, n = G.trailCount;
    G.tracker.visible = s.mesh.visible && W.ball.visible;
    if (G.tracker.visible) {
      const d = cam.position.distanceTo(W.ball.position);
      G.tracker.position.copy(W.ball.position);
      G.tracker.material.opacity = clamp((d - 3) / 4, 0, 0.9);
    }
    if (!s.mesh.visible || n < 2) { s.geo.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const p = pts[i], nx = pts[Math.max(i - 1, 0)], pv = pts[Math.min(i + 1, n - 1)];
      D.subVectors(nx, pv); if (D.lengthSq() < 1e-9) D.set(0, 0, 1);
      TC.subVectors(cam.position, p); RT.crossVectors(D, TC);
      if (RT.lengthSq() < 1e-12) RT.set(1, 0, 0);
      RT.normalize();
      const f = i / (n - 1), w = 0.055 * Math.pow(1 - f, 0.75) + 0.004;
      A.copy(p).addScaledVector(RT, w); B.copy(p).addScaledVector(RT, -w);
      edge(s, i, A, B, Math.pow(1 - f, 1.5));
    }
    commit(s, n);
  }

  /* ---------- landing marker: crisp decal, smooth motion, colour by length ---------- */
  const ZONES = [{ max: 2.2, name: 'YORKER', col: 0xffc93c }, { max: 4.5, name: 'FULL', col: 0x9be37a }, { max: 7.5, name: 'GOOD LENGTH', col: 0x4fd3ff }, { max: 99, name: 'SHORT', col: 0xff5468 }];
  G.zoneOf = z => { const d = z + 10.06; return ZONES.find(Z => d < Z.max) || ZONES[3]; };
  function decal(tex, size, y, order) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = order; return m;
  }
  function initMarker() {
    const grp = new THREE.Group(); grp.visible = false;
    const core = ctex(512, 512, (g, w) => {
      g.translate(256, 256);
      const r = g.createRadialGradient(0, 0, 0, 0, 0, 250); r.addColorStop(0, 'rgba(255,255,255,.5)'); r.addColorStop(0.4, 'rgba(255,255,255,.16)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.beginPath(); g.arc(0, 0, 250, 0, TAU); g.fill();
      g.lineWidth = 36; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(0, 0, 118, 0, TAU); g.stroke();
      g.lineWidth = 19; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 118, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 25, 0, TAU); g.fill();
      for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(136, -13, 66, 26); g.fillStyle = '#fff'; g.fillRect(142, -7, 54, 14); g.restore(); }
    });
    const dash = ctex(512, 512, (g, w) => {
      g.translate(256, 256); g.lineCap = 'round';
      for (let k = 0; k < 14; k++) { const a0 = k / 14 * TAU, a1 = a0 + TAU / 14 * 0.52; g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(0, 0, 214, a0, a1); g.stroke(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 214, a0, a1); g.stroke(); }
    });
    const ripple = ctex(512, 512, (g, w) => {
      g.translate(256, 256); const r = g.createRadialGradient(0, 0, 150, 0, 0, 246); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,.9)'); r.addColorStop(0.82, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.beginPath(); g.arc(0, 0, 250, 0, TAU); g.fill();
    });
    const mc = decal(core, 1.5, 0.045, 11), md = decal(dash, 1.5, 0.046, 11), mr = decal(ripple, 1.5, 0.047, 11);
    [mc, md, mr].forEach(m => grp.add(m));
    // light beam: two crossed planes with a soft vertical gradient
    const beamTex = ctex(32, 256, (g, w, h) => {
      const id = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = (x - w / 2) / (w / 2), v = y / h; const a = Math.exp(-u * u * 5) * Math.pow(v, 1.4); const i = (y * w + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; id.data[i + 3] = Math.round(a * 255); }
      g.putImageData(id, 0, 0);
    });
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const beams = [0, Math.PI / 2].map(r => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.2), beamMat); m.position.y = 1.1; m.rotation.y = r; m.renderOrder = 10; grp.add(m); return m; });
    // zone label
    const lab = labelSprite(320, 80, 1.5, 0.375);
    lab.s.position.y = 0.55; lab.s.position.z = 0.95; grp.add(lab.s);
    scene.add(grp);
    G.mk = { grp, mc, md, mr, beamMat, lab, tx: 0, tz: 0, was: false, fade: 1, zone: null, col: new THREE.Color(0xffffff), tcol: new THREE.Color(0xffffff), ph: 0 };
    W.marker = grp;
  }
  G.markTo = (x, z) => { const M = G.mk; M.tx = x; M.tz = z; const Z = G.zoneOf(z); M.tcol.copy(lin(Z.col)); if (M.zone !== Z.name) { M.zone = Z.name; drawLabel(M.lab, Z.name, null, Z.col, 56); } };
  G.markFade = v => { G.mk.fade = clamp(v, 0, 1); };
  function tickMarker(dt, t) {
    const M = G.mk, g = M.grp;
    if (!g.visible) { M.was = false; return; }
    if (!M.was) { g.position.set(M.tx, 0, M.tz); M.col.copy(M.tcol); M.was = true; M.ph = 0; }
    const k = 1 - Math.exp(-dt * 14);
    g.position.x += (M.tx - g.position.x) * k; g.position.z += (M.tz - g.position.z) * k;
    M.col.lerp(M.tcol, 1 - Math.exp(-dt * 9));
    M.ph += dt;
    const cd = W.camera.position.distanceTo(g.position), ds = clamp(cd / 9, 1, 2.4);
    M.md.rotation.z = -M.ph * 0.9;
    const pulse = (1 + Math.sin(M.ph * 5) * 0.035) * ds;
    M.mc.scale.setScalar(pulse); M.md.scale.setScalar(ds);
    M.lab.s.scale.set(1.5 * ds, 0.375 * ds, 1); M.lab.s.position.z = 0.95 * ds; M.lab.s.position.y = 0.55 * ds;
    const rp = (M.ph * 0.85) % 1;
    M.mr.scale.setScalar((0.45 + rp * 1.05) * ds);
    M.mr.material.opacity = (1 - rp) * 0.85 * M.fade; M.mr.material.color.copy(M.col);
    M.mc.material.opacity = M.fade; M.mc.material.color.copy(M.col).lerp(new THREE.Color(1, 1, 1), 0.35);
    M.md.material.opacity = 0.9 * M.fade; M.md.material.color.copy(M.col);
    M.beamMat.opacity = (0.38 + Math.sin(M.ph * 4) * 0.1) * M.fade; M.beamMat.color.copy(M.col);
    M.lab.s.material.opacity = 0.95 * M.fade;
  }

  /* ---------- labels ---------- */
  function labelSprite(w, h, sx, sy) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    s.scale.set(sx, sy, 1); s.renderOrder = 20;
    return { s, c, t, g: c.getContext('2d'), w, h };
  }
  function css(hex) { return '#' + new THREE.Color(hex).getHexString(); }
  function drawLabel(L, l1, l2, col, size) {
    const g = L.g, w = L.w, h = L.h; g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    let fs = size || 52; g.font = `900 ${fs}px ${FONT}`;
    const tw = g.measureText(l1).width; if (tw > w - 28) fs = Math.floor(fs * (w - 28) / tw);
    g.font = `900 ${fs}px ${FONT}`; g.lineWidth = Math.max(6, fs * 0.18); g.strokeStyle = 'rgba(4,10,22,.92)';
    g.strokeText(l1, w / 2, h / 2); g.fillStyle = css(col); g.fillText(l1, w / 2, h / 2);
    L.t.needsUpdate = true;
  }

  /* ---------- length bands for bowling ---------- */
  function initBands() {
    const PX = 110, Wd = 2.7, Ln = 12.06;
    const tex = ctex(Math.round(Wd * PX), Math.round(Ln * PX), (g, w, h) => {
      const zones = [[-10.06, -7.86, 0xffc93c, 'YORKER'], [-7.86, -5.56, 0x9be37a, 'FULL'], [-5.56, -2.56, 0x4fd3ff, 'GOOD LENGTH'], [-2.56, 2, 0xff5468, 'SHORT']];
      zones.forEach(([a, b, c, name]) => {
        const y0 = (a + 10.06) / Ln * h, y1 = (b + 10.06) / Ln * h;
        const gr = g.createLinearGradient(0, y0, 0, y1); const col = css(c);
        gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '22');
        g.fillStyle = gr; g.fillRect(0, y0 + 2, w, y1 - y0 - 4);
        g.fillStyle = col + 'dd'; g.fillRect(0, y0, w, 3);
        g.font = `800 ${Math.round(PX * 0.2)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(name, w / 2, (y0 + y1) / 2); g.fillStyle = '#fff'; g.fillText(name, w / 2, (y0 + y1) / 2);
      });
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Ln), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, -10.06 + Ln / 2); m.renderOrder = 4;
    const grp = new THREE.Group(); grp.add(m); grp.visible = false; scene.add(grp);
    W.bands = grp;
  }

  /* ---------- shot-direction fans on the outfield ---------- */
  const FV = 'attribute float aA; attribute float aS; varying float vA; varying float vS;\nvoid main(){ vA = aA; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const FF = 'uniform vec3 uColor; uniform float uOpacity; uniform float uPulse; varying float vA; varying float vS;\nvoid main(){ float e = smoothstep(0.88, 1.0, abs(vS)); float a = vA * (0.2 + 0.5 * e + 0.5 * uPulse) + e * 0.25; gl_FragColor = vec4(uColor, a * uOpacity); }';
  const FANS = [{ aim: -0.75, name: 'LEG' }, { aim: 0, name: 'STRAIGHT' }, { aim: 0.75, name: 'OFF' }];
  const FCOL = { gap: 0x58f08a, mid: 0xffcf55, cov: 0xff6b5a };
  function fanGeo(phi, half, r0, r1) {
    const Aseg = 22, Rseg = 14, pos = [], aa = [], ss = [], idx = [];
    for (let j = 0; j <= Rseg; j++) {
      const t = j / Rseg, r = r0 + (r1 - r0) * Math.pow(t, 1.2);
      for (let i = 0; i <= Aseg; i++) { const u = i / Aseg * 2 - 1, ang = phi + u * half; pos.push(Math.sin(ang) * r, 0.055, Math.cos(ang) * r); aa.push(Math.pow(1 - t, 1.25)); ss.push(u); }
    }
    for (let j = 0; j < Rseg; j++) for (let i = 0; i < Aseg; i++) { const a = j * (Aseg + 1) + i, b = a + Aseg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aA', new THREE.Float32BufferAttribute(aa, 1)); g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1)); g.setIndex(idx);
    return g;
  }
  function initFans() {
    const grp = new THREE.Group(); grp.position.set(0, 0, CZ); grp.visible = false;
    G.fans = FANS.map(def => {
      const phi = -def.aim * 1.4;
      const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: lin(FCOL.gap) }, uOpacity: { value: 0 }, uPulse: { value: 0 } }, vertexShader: FV, fragmentShader: FF, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(fanGeo(phi, 0.43, 2.6, 58), mat); mesh.renderOrder = 3; mesh.frustumCulled = false; grp.add(mesh);
      return { def, phi, mat, mesh, state: '', pulse: 0 };
    });
    scene.add(grp);
    G.fanGrp = grp; G.fanT = 0; G.fanFade = 0;
  }
  G.fansShow = on => { G.fanT = on ? 1 : 0; };
  G.fansUpdate = (field) => {
    G.fans.forEach(F => {
      let minA = 9;
      for (const f of field) {
        if (f.role === 'keeper' || f.role === 'slip' || f.role === 'bowler') continue;
        let d = Math.atan2(f.x, f.z - CZ) - F.phi; d = Math.atan2(Math.sin(d), Math.cos(d));
        minA = Math.min(minA, Math.abs(d));
      }
      const state = minA > 0.46 ? 'gap' : minA > 0.26 ? 'mid' : 'cov';
      F.minA = minA;
      if (state !== F.state) {
        F.state = state;
        F.mat.uniforms.uColor.value.copy(lin(FCOL[state]));
      }
    });
  };
  G.fanStates = () => G.fans.map(F => F.state);
  G.fanPulse = aim => {
    let best = null, bd = 9;
    G.fans.forEach(F => { const d = Math.abs(F.def.aim - aim); if (d < bd) { bd = d; best = F; } });
    if (best) best.pulse = 1;
  };

  /* ---------- aim ray: where the swing was sent ---------- */
  function initRay() { G.rayS = strip(10, { color: 0xffffff, opacity: 1, soft: 1, order: 5, normal: false }); G.rayT = 0; }
  G.ray = (phi, col) => {
    const s = G.rayS, n = 10;
    const sx = Math.sin(phi), cz = Math.cos(phi), px = cz, pz = -sx;
    for (let i = 0; i < n; i++) {
      const r = 2 + i / (n - 1) * 58, w = 0.1 * (1 - i / (n - 1) * 0.5) + 0.03;
      A.set(sx * r + px * w, 0.07, CZ + cz * r + pz * w); B.set(sx * r - px * w, 0.07, CZ + cz * r - pz * w);
      edge(s, i, A, B, Math.pow(1 - i / (n - 1), 0.8));
    }
    s.mat.uniforms.uColor.value.copy(lin(col)).multiplyScalar(1.5); commit(s, n); s.mesh.visible = true; G.rayT = 1.6;
  };

  /* ---------- shot trace on the ground ---------- */
  const TC_AIR = lin(0xffd34d), TC_GND = lin(0x6fe0ff);
  function initTrace() {
    G.traceN = 200; G.trace = strip(G.traceN, { vc: true, soft: 1, order: 4, opacity: 1, normal: false });
    G.tpts = []; G.tcols = []; G.tfade = 0; G.tOn = false;
    G.rings = [];
    const ring = ctex(256, 256, (g) => { g.translate(128, 128); g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(0, 0, 80, 0, TAU); g.stroke(); g.lineWidth = 9; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 80, 0, TAU); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill(); });
    for (let i = 0; i < 3; i++) { const m = decal(ring, 1.6, 0.06, 12); m.visible = false; scene.add(m); G.rings.push({ m, t: 0 }); }
  }
  G.traceBegin = () => { G.tpts.length = 0; G.tcols.length = 0; G.tOn = true; G.tfade = 1; G.trace.mesh.visible = true; G.rings.forEach(r => { r.m.visible = false; }); G.ringN = 0; };
  G.tracePush = (p, colHex) => {
    if (!G.tOn) return;
    const L = G.tpts[G.tpts.length - 1];
    if (L && Math.hypot(p.x - L.x, p.z - L.z) < 0.35) return;
    if (G.tpts.length >= G.traceN) return;
    G.tpts.push({ x: p.x, z: p.z, h: p.y }); G.tcols.push(p.y > 0.6 ? TC_AIR : TC_GND);
  };
  G.traceMark = (x, z, colHex) => { const r = G.rings[(G.ringN = (G.ringN || 0) % G.rings.length)]; G.ringN++; r.m.position.set(x, 0.06, z); r.m.material.color.copy(lin(colHex)); r.m.visible = true; r.t = 0; };
  G.traceEnd = () => { G.tOn = false; G.tHold = 1.8; };
  function buildTrace() {
    const s = G.trace, pts = G.tpts, n = pts.length;
    if (n < 2 || G.tfade <= 0) { s.mesh.visible = false; return; }
    s.mesh.visible = true;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = 0.2 + 0.1 * (i / n);
      A.set(p.x - dz * w, 0.065, p.z + dx * w); B.set(p.x + dz * w, 0.065, p.z - dx * w);
      edge(s, i, A, B, 0.35 + 0.65 * (i / (n - 1)), G.tcols[i]);
    }
    commit(s, n); s.mat.uniforms.uOpacity.value = G.tfade * 0.95;
  }

  /* ---------- bat swing arc ---------- */
  function initSwing() { G.swN = 20; G.sw = strip(G.swN, { color: 0xffe9a8, soft: 0, opacity: 0.9, order: 8 }); G.swPts = []; G.swFade = 0; G.swOn = false; }
  G.swingBegin = () => { G.swPts.length = 0; G.swOn = true; G.swFade = 1; G.sw.mesh.visible = true; G.sw.mat.uniforms.uColor.value.copy(lin(0xfff2c4)).multiplyScalar(1.9); };
  G.swingColor = hex => { G.sw.mat.uniforms.uColor.value.copy(lin(hex)).multiplyScalar(1.9); };
  G.swingPush = (tip, mid) => { if (!G.swOn) return; G.swPts.unshift({ t: tip.clone(), m: mid.clone() }); if (G.swPts.length > G.swN) G.swPts.pop(); };
  G.swingEnd = () => { G.swOn = false; };
  function buildSwing() {
    const s = G.sw, pts = G.swPts, n = pts.length;
    if (n < 2 || G.swFade <= 0) { s.mesh.visible = false; return; }
    s.mesh.visible = true;
    for (let i = 0; i < n; i++) edge(s, i, pts[i].t, pts[i].m, Math.pow(1 - i / (n - 1), 1.1));
    commit(s, n); s.mat.uniforms.uOpacity.value = G.swFade * 1.0;
  }

  /* ---------- lifecycle ---------- */
  G.reset = () => {
    G.tOn = false; G.tfade = 0; G.tHold = 0; G.tpts.length = 0; G.trace.mesh.visible = false; G.rings.forEach(r => { r.m.visible = false; });
    G.swOn = false; G.swFade = 0; G.swPts.length = 0; G.sw.mesh.visible = false;
    G.rayS.mesh.visible = false; G.rayT = 0;
  };
  G.init = (w) => {
    W = w; scene = w.scene;
    initTrail(); initMarker(); initBands(); initFans(); initRay(); initTrace(); initSwing();
    G.ready = true;
  };
  G.tick = (dt, t) => {
    if (!G.ready) return;
    tickMarker(dt, t);
    // fans
    const kf = 1 - Math.exp(-dt * 7);
    G.fanFade += (G.fanT - G.fanFade) * kf;
    G.fanGrp.visible = G.fanFade > 0.01;
    if (G.fanGrp.visible) G.fans.forEach(F => {
      F.pulse = Math.max(0, F.pulse - dt * 1.6);
      const dim = 0.5 + 0.5 * (F.state === 'gap' ? 1 : F.state === 'mid' ? 0.85 : 0.7);
      F.mat.uniforms.uOpacity.value = G.fanFade * dim * (S_LEVEL_SCALE());
      F.mat.uniforms.uPulse.value = F.pulse;
    });
    // ray
    if (G.rayT > 0) { G.rayT -= dt; G.rayS.mat.uniforms.uOpacity.value = clamp(G.rayT / 0.8, 0, 1); if (G.rayT <= 0) G.rayS.mesh.visible = false; }
    // trace
    if (!G.tOn && G.tfade > 0) { G.tHold -= dt; if (G.tHold <= 0) { G.tfade -= dt * 1.1; if (G.tfade <= 0) { G.tfade = 0; G.rings.forEach(r => { r.m.visible = false; }); } } }
    G.rings.forEach(r => { if (!r.m.visible) return; r.t += dt; const k = Math.min(1, r.t / 0.35); r.m.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - k, 3))); r.m.material.opacity = G.tfade; });
    // swing
    if (!G.swOn && G.swFade > 0) { G.swFade -= dt * 3.2; if (G.swFade <= 0) { G.swFade = 0; G.swPts.length = 0; } }
  };
  function S_LEVEL_SCALE() { return G.fanScale == null ? 1 : G.fanScale; }
  G.preRender = (cam) => { if (!G.ready) return; buildTrail(cam); buildTrace(); buildSwing(); };
  return G;
})();
