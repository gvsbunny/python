/* ===== Players: smooth jointed characters, pose clips, blending and two-bone IK ===== */
const RIG = (() => {
  const J = ['body', 'hips', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR', 'bat'];
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpAng = (a, b, t) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; };
  const smooth = t => t * t * (3 - 2 * t);

  /* ---------- geometry ---------- */
  const cache = {};
  function capsule(rTop, rBot, len, seg = 14) {
    const key = 'c' + [rTop, rBot, len, seg].join(',');
    if (cache[key]) return cache[key];
    const pts = [], n = 6;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0005, Math.cos(a) * rBot), -len + Math.sin(a) * rBot)); }
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0005, Math.cos(a) * rTop), Math.sin(a) * rTop)); }
    const g = new THREE.LatheGeometry(pts, seg);
    g.computeVertexNormals();
    return (cache[key] = g);
  }
  function lathe(key, prof, seg = 24) {
    if (cache[key]) return cache[key];
    const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(Math.max(0.0005, p[0]), p[1])), seg);
    g.computeVertexNormals();
    return (cache[key] = g);
  }
  const sphere = (r, w = 16, h = 12, ps, pl, ts, tl) => { const k = 's' + [r, w, h, ps, pl, ts, tl].join(','); return cache[k] || (cache[k] = new THREE.SphereGeometry(r, w, h, ps, pl, ts, tl)); };
  const box = (x, y, z) => { const k = 'b' + [x, y, z].join(','); return cache[k] || (cache[k] = new THREE.BoxGeometry(x, y, z)); };
  const cyl = (a, b, h, s = 12, open = false, ts, tl) => { const k = 'y' + [a, b, h, s, open, ts, tl].join(','); return cache[k] || (cache[k] = new THREE.CylinderGeometry(a, b, h, s, 1, open, ts, tl)); };
  const torus = (r, t, rs, ts, arc) => { const k = 't' + [r, t, rs, ts, arc].join(','); return cache[k] || (cache[k] = new THREE.TorusGeometry(r, t, rs, ts, arc)); };

  const TORSO = [[0, -0.14], [0.165, -0.13], [0.185, -0.05], [0.17, 0.08], [0.185, 0.2], [0.225, 0.33], [0.238, 0.42], [0.225, 0.5], [0.17, 0.56], [0.075, 0.6], [0.06, 0.62], [0, 0.62]];
  const PELVIS = [[0, -0.13], [0.15, -0.12], [0.19, -0.03], [0.185, 0.06], [0.17, 0.1], [0, 0.1]];

  /* ---------- materials ---------- */
  const M = {};
  function std(color, rough = 0.7, metal = 0, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {})); }
  function initMaterials() {
    if (M.ready) return;
    M.skin = [0x8a5638, 0xa8714b, 0x6a3f27, 0xc69067, 0x5a3420, 0xb98260].map(c => std(c, 0.62));
    M.hair = [0x161210, 0x2a1c14, 0x0e0e10, 0x3a2a1c].map(c => std(c, 0.85));
    M.eye = std(0x111111, 0.3);
    M.white = std(0xd9d9d3, 0.7, 0, { envMapIntensity: 0.5 });
    M.pad = std(0xd6d6cf, 0.72, 0, { envMapIntensity: 0.45 });
    M.sole = std(0x2a2a2e, 0.8);
    M.grille = std(0xb8c0c8, 0.3, 0.8);
    M.blade = std(0xe8d2a2, 0.55);
    M.bladeEdge = std(0xd8bf88, 0.6);
    M.ready = true;
  }
  function jerseyTex(team, number, name, opts) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = team.c1; g.fillRect(0, 0, 512, 256);
    // side panels
    g.fillStyle = team.c2; g.globalAlpha = 0.85;
    g.fillRect(100, 0, 40, 256); g.fillRect(372, 0, 40, 256);
    g.globalAlpha = 1;
    // chest sash
    g.save(); g.translate(0, 0); g.fillStyle = 'rgba(255,255,255,.16)';
    g.beginPath(); g.moveTo(-40, 170); g.lineTo(60, 60); g.lineTo(90, 60); g.lineTo(-10, 170); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(472, 170); g.lineTo(572, 60); g.lineTo(602, 60); g.lineTo(502, 170); g.closePath(); g.fill();
    g.restore();
    // subtle fabric noise
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    // collar + hem
    g.fillStyle = team.c2; g.fillRect(0, 0, 512, 14);
    g.fillStyle = team.c3 || '#ffffff'; g.fillRect(0, 14, 512, 4);
    g.fillStyle = team.c2; g.fillRect(0, 238, 512, 18);
    // back: name and number
    g.textAlign = 'center'; g.fillStyle = '#ffffff';
    g.font = '700 26px "Saira Condensed", "Arial Narrow", sans-serif';
    g.fillText(name.toUpperCase(), 256, 64, 160);
    g.font = '800 104px "Saira Condensed", "Arial Narrow", sans-serif';
    g.lineWidth = 6; g.strokeStyle = team.c2; g.strokeText(String(number), 256, 160);
    g.fillText(String(number), 256, 160);
    // front: crest initials over the heart and number
    g.font = '800 30px "Saira Condensed", "Arial Narrow", sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(team.abbr, 470, 92);
    g.font = '800 44px "Saira Condensed", "Arial Narrow", sans-serif';
    g.fillText(String(number), 38, 120); g.fillText(String(number), 550, 120);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }

  /* ---------- build ---------- */
  function build(scene, team, o) {
    initMaterials();
    const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const shirt = std(0xffffff, 0.72, 0, { map: jerseyTex(team, o.number || 7, o.name || '', o) });
    const pants = std(new THREE.Color(team.c2), 0.75);
    const trim = std(new THREE.Color(team.c1), 0.6);
    const capMat = std(new THREE.Color(team.c2), o.batter ? 0.28 : 0.6, o.batter ? 0.15 : 0);
    const skin = M.skin[o.skin != null ? o.skin : Math.floor(Math.random() * M.skin.length)];
    const hair = M.hair[Math.floor(Math.random() * M.hair.length)];
    const root = new THREE.Group();
    const j = {};
    const body = j.body = new THREE.Group(); body.position.y = 0.98; root.add(body);
    const hips = j.hips = new THREE.Group(); body.add(hips);
    mk(lathe('pelvis', PELVIS), pants, hips).scale.set(1, 1, 0.78);
    const chest = j.chest = new THREE.Group(); chest.position.y = 0.06; hips.add(chest);
    const torso = mk(lathe('torso', TORSO, 28), shirt, chest, 0, 0.02, 0); torso.scale.set(1, 1, 0.74);
    const neck = j.neck = new THREE.Group(); neck.position.y = 0.6; chest.add(neck);
    mk(capsule(0.055, 0.06, 0.06), skin, neck, 0, 0.06, 0);
    const head = j.head = new THREE.Group(); head.position.y = 0.08; neck.add(head);
    const skull = mk(sphere(0.128, 20, 16), skin, head, 0, 0.12, 0.005); skull.scale.set(0.94, 1.06, 1);
    mk(sphere(0.017, 8, 6), M.eye, head, 0.044, 0.14, 0.116);
    mk(sphere(0.017, 8, 6), M.eye, head, -0.044, 0.14, 0.116);
    mk(box(0.04, 0.008, 0.01), hair, head, 0.045, 0.168, 0.118);
    mk(box(0.04, 0.008, 0.01), hair, head, -0.045, 0.168, 0.118);
    mk(sphere(0.022, 8, 6), skin, head, 0, 0.115, 0.128);
    mk(sphere(0.026, 8, 6), skin, head, 0.12, 0.12, 0).scale.set(0.5, 1, 0.8);
    mk(sphere(0.026, 8, 6), skin, head, -0.12, 0.12, 0).scale.set(0.5, 1, 0.8);
    if (o.batter || o.keeper) {
      const dome = mk(sphere(0.152, 22, 12, 0, TAU, 0, Math.PI * 0.56), capMat, head, 0, 0.13, -0.008); dome.scale.set(1, 1.02, 1.08);
      const peak = mk(cyl(0.155, 0.155, 0.014, 20, false, -Math.PI / 2, Math.PI), capMat, head, 0, 0.165, 0.035); peak.scale.set(1, 1, 0.75); peak.rotation.x = 0.18;
      [0.085, 0.04, -0.005].forEach((y, i) => { const b = mk(torus(0.135 - i * 0.006, 0.0055, 5, 18, Math.PI * 0.72), M.grille, head, 0, y + 0.02, 0.0); b.rotation.set(Math.PI / 2, 0, Math.PI * 0.14 + Math.PI); b.scale.set(1, 1.05, 1); });
      const v = mk(cyl(0.005, 0.005, 0.11, 5), M.grille, head, 0, 0.04, 0.142); v.rotation.x = 0.12;
      mk(cyl(0.12, 0.13, 0.05, 16, true, Math.PI * 0.6, Math.PI * 0.8), capMat, head, 0, 0.04, -0.02);
    } else {
      mk(sphere(0.134, 18, 10, 0, TAU, 0, Math.PI * 0.5), hair, head, 0, 0.135, -0.012).scale.set(0.98, 0.9, 1.04);
      const cap = mk(sphere(0.138, 20, 10, 0, TAU, 0, Math.PI * 0.42), capMat, head, 0, 0.142, -0.006); cap.scale.set(1, 1.02, 1.06);
      const brim = mk(cyl(0.12, 0.12, 0.012, 18, false, -Math.PI / 2, Math.PI), capMat, head, 0, 0.18, 0.09); brim.scale.set(0.95, 1, 1.25); brim.rotation.x = 0.12;
      mk(sphere(0.022, 8, 6), trim, head, 0, 0.27, -0.005);
    }
    // arms
    [['L', 1], ['R', -1]].forEach(([s, sg]) => {
      const sh = j['sh' + s] = new THREE.Group(); sh.position.set(0.215 * sg, 0.47, 0); chest.add(sh);
      mk(sphere(0.075, 14, 10), shirt, sh, 0, -0.01, 0).scale.set(1, 1, 0.95);
      mk(capsule(0.066, 0.056, 0.16), shirt, sh);                 // sleeve
      mk(capsule(0.05, 0.048, 0.26), skin, sh, 0, -0.03, 0);
      const el = j['el' + s] = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      mk(capsule(0.048, 0.04, 0.22), skin, el);
      const ha = j['ha' + s] = new THREE.Group(); ha.position.y = -0.26; el.add(ha);
      if (o.batter) {
        mk(cyl(0.052, 0.052, 0.06, 12), trim, ha, 0, 0.02, 0);
        mk(sphere(0.062, 12, 10), M.pad, ha, 0, -0.035, 0.005).scale.set(1, 1.25, 0.95);
      } else if (o.keeper) {
        mk(sphere(0.08, 12, 10), M.pad, ha, 0, -0.04, 0.02).scale.set(1.1, 1.3, 0.8);
        mk(cyl(0.06, 0.06, 0.05, 12), trim, ha, 0, 0.03, 0);
      } else {
        mk(sphere(0.048, 10, 8), skin, ha, 0, -0.03, 0).scale.set(0.9, 1.2, 0.8);
      }
    });
    // legs
    [['L', 1], ['R', -1]].forEach(([s, sg]) => {
      const th = j['th' + s] = new THREE.Group(); th.position.set(0.098 * sg, -0.04, 0); hips.add(th);
      mk(capsule(0.09, 0.07, 0.42), pants, th);
      const kn = j['kn' + s] = new THREE.Group(); kn.position.y = -0.44; th.add(kn);
      mk(capsule(0.07, 0.052, 0.4), pants, kn);
      if (o.batter || o.keeper) {
        const pad = mk(capsule(0.085, 0.07, 0.3, 12), M.pad, kn, 0, -0.06, 0.03); pad.scale.set(1.18, 1, 0.95);
        [-0.04, 0, 0.04].forEach(x => mk(cyl(0.012, 0.012, 0.3, 6), M.pad, kn, x, -0.21, 0.105));
        const roll = mk(cyl(0.05, 0.05, 0.19, 10), M.pad, kn, 0, 0.01, 0.075); roll.rotation.z = Math.PI / 2;
        mk(box(0.16, 0.025, 0.02), trim, kn, 0, -0.42, 0.09);
      }
      const ft = j['ft' + s] = new THREE.Group(); ft.position.y = -0.44; kn.add(ft);
      const shoe = mk(sphere(0.07, 14, 10), M.white, ft, 0, -0.04, 0.055); shoe.scale.set(0.95, 0.62, 1.85);
      const sole = mk(sphere(0.07, 14, 6, 0, TAU, Math.PI / 2, Math.PI / 2), M.sole, ft, 0, -0.045, 0.055); sole.scale.set(0.98, 0.3, 1.9);
      const stripe = mk(box(0.01, 0.025, 0.1), trim, ft, 0.066 * sg, -0.03, 0.05);
    });
    // bat
    let bat = null;
    if (o.batter) {
      bat = j.bat = new THREE.Group(); chest.add(bat);
      buildBat(bat, trim, team);
    }
    scene.add(root);
    const P = { g: root, j, bat, o, anim: new Animator(), phase: Math.random() * 6, target: null, team, shirt, pants, capMat, trim };
    P.anim.rig = P;
    return P;
  }
  let willowTex = null;
  function willow() {
    if (willowTex) return willowTex;
    const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, '#c9a467'); gr.addColorStop(0.18, '#ecd3a0'); gr.addColorStop(0.82, '#ecd3a0'); gr.addColorStop(1, '#c9a467');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 26; i++) { const x = 8 + i * 4.5 + Math.random() * 2; g.strokeStyle = `rgba(150,110,60,${0.12 + Math.random() * 0.12})`; g.lineWidth = 0.8 + Math.random(); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 2, 170, x - 2, 340, x + 1, 512); g.stroke(); }
    willowTex = new THREE.CanvasTexture(c); willowTex.encoding = THREE.sRGBEncoding; willowTex.anisotropy = 4;
    return willowTex;
  }
  function stickerTex(team, label) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 256);
    g.fillStyle = team.c1; g.fillRect(6, 10, 116, 150);
    g.fillStyle = team.c2; g.fillRect(6, 120, 116, 40);
    g.save(); g.translate(64, 70); g.rotate(-Math.PI / 2); g.fillStyle = '#ffffff'; g.font = '900 46px "Saira Condensed","Arial Narrow",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 0, 100); g.restore();
    g.fillStyle = '#ffffff'; g.font = '800 26px "Saira Condensed","Arial Narrow",sans-serif'; g.textAlign = 'center'; g.fillText('FS', 64, 148);
    g.fillStyle = team.c1; g.fillRect(6, 214, 116, 30);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function buildBat(bat, trim, team) {
    const mkb = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; bat.add(m); return m; };
    // handle with ribbed rubber grip
    const grip = trim;
    mkb(cyl(0.0165, 0.018, 0.27, 12), grip, 0, -0.135, 0);
    for (let i = 0; i < 7; i++) { const r = mkb(torus(0.0172, 0.0028, 4, 14), grip, 0, -0.025 - i * 0.034, 0); r.rotation.x = Math.PI / 2; }
    mkb(sphere(0.02, 10, 8), grip, 0, 0, 0).scale.set(1, 0.6, 1);
    // blade outline in the face plane: sloping shoulders, straight edges, rounded toe
    const sh = new THREE.Shape();
    sh.moveTo(-0.018, -0.265); sh.quadraticCurveTo(-0.05, -0.285, -0.054, -0.33); sh.lineTo(-0.054, -0.8);
    sh.quadraticCurveTo(-0.054, -0.84, 0, -0.842); sh.quadraticCurveTo(0.054, -0.84, 0.054, -0.8); sh.lineTo(0.054, -0.33);
    sh.quadraticCurveTo(0.05, -0.285, 0.018, -0.265); sh.lineTo(-0.018, -0.265);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.024, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 });
    bg.translate(0, 0, -0.012);
    // planar UVs so the grain runs along the blade
    const pa = bg.attributes.position, uv = bg.attributes.uv;
    for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getX(i) + 0.06) / 0.12, (pa.getY(i) + 0.85) / 0.6);
    const wm = new THREE.MeshStandardMaterial({ map: willow(), roughness: 0.5, metalness: 0 });
    mkb(bg, wm);
    // the spine down the back of the blade
    const sp = mkb(new THREE.CylinderGeometry(0.03, 0.026, 0.44, 14, 1, false, Math.PI / 2, Math.PI), wm, 0, -0.6, -0.012); sp.scale.set(1.4, 1, 0.9);
    // stickers on the face and the back
    const st = new THREE.MeshStandardMaterial({ map: stickerTex(team, team.abbr || 'FS'), transparent: true, roughness: 0.4 });
    bat.userData.sticker = st;
    const f = mkb(new THREE.PlaneGeometry(0.096, 0.19), st, 0, -0.43, 0.0175);
    const bk = mkb(new THREE.PlaneGeometry(0.07, 0.14), st, 0, -0.42, -0.04); bk.rotation.y = Math.PI;
  }
  function recolor(P, team, number, name) {
    P.team = team;
    if (P.shirt.map) P.shirt.map.dispose();
    P.shirt.map = jerseyTex(team, number, name); P.shirt.needsUpdate = true;
    P.pants.color.set(team.c2); P.capMat.color.set(team.c2); P.trim.color.set(team.c1);
    if (P.bat && P.bat.userData.sticker) { const st = P.bat.userData.sticker; if (st.map) st.map.dispose(); st.map = stickerTex(team, team.abbr); st.needsUpdate = true; }
  }

  /* ---------- poses ---------- */
  function pose(base, over) {
    const p = {};
    for (const k of J) p[k] = (over && over[k]) ? over[k].slice() : (base && base[k] ? base[k].slice() : [0, 0, 0]);
    p.hy = over && over.hy != null ? over.hy : (base ? base.hy || 0 : 0);
    p.bp = over && over.bp ? over.bp.slice() : (base && base.bp ? base.bp.slice() : [0, -0.15, 0.25]);
    return p;
  }
  function lerpPose(a, b, t, out) {
    out = out || {};
    for (const k of J) { const x = a[k], y = b[k], o = out[k] || (out[k] = [0, 0, 0]); o[0] = lerpAng(x[0], y[0], t); o[1] = lerpAng(x[1], y[1], t); o[2] = lerpAng(x[2], y[2], t); }
    out.hy = lerp(a.hy, b.hy, t);
    const o = out.bp || (out.bp = [0, 0, 0]); for (let i = 0; i < 3; i++) o[i] = lerp(a.bp[i], b.bp[i], t);
    return out;
  }
  const clone = p => lerpPose(p, p, 0);

  const IDLE = pose(null, { shL: [0.05, 0, 0.12], shR: [0.05, 0, -0.12], elL: [-0.18, 0, 0], elR: [-0.18, 0, 0], thL: [0, 0, 0.05], thR: [0, 0, -0.05] });
  const READY = pose(IDLE, { hy: -0.13, chest: [0.42, 0, 0], head: [-0.35, 0, 0], thL: [-0.45, 0, 0.2], knL: [0.75, 0, 0], ftL: [-0.3, 0, 0], thR: [-0.45, 0, -0.2], knR: [0.75, 0, 0], ftR: [-0.3, 0, 0], shL: [-0.7, 0, 0.25], shR: [-0.7, 0, -0.25], elL: [-0.7, 0, 0], elR: [-0.7, 0, 0] });
  const KEEPER = pose(IDLE, { hy: -0.5, chest: [0.55, 0, 0], head: [-0.5, 0, 0], thL: [-1.45, 0, 0.38], knL: [2.25, 0, 0], ftL: [-0.8, 0, 0], thR: [-1.45, 0, -0.38], knR: [2.25, 0, 0], ftR: [-0.8, 0, 0], shL: [-1.0, 0, 0.1], shR: [-1.0, 0, -0.1], elL: [-0.5, 0, 0], elR: [-0.5, 0, 0] });
  const KEEPER_UP = pose(KEEPER, { hy: -0.25, chest: [0.3, 0, 0], head: [-0.25, 0, 0], thL: [-0.8, 0, 0.3], knL: [1.2, 0, 0], ftL: [-0.4, 0, 0], thR: [-0.8, 0, -0.3], knR: [1.2, 0, 0], ftR: [-0.4, 0, 0], shL: [-1.4, 0, 0.0], shR: [-1.4, 0, 0.0], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0] });
  // Batter, built side-on: model +x points at the bowler, model +z is the off side.
  const STANCE = pose(null, { hy: -0.1, chest: [0.42, 0.25, -0.02], neck: [0, 0.45, 0], head: [-0.35, 0.65, 0], thL: [-0.2, 0, 0.2], knL: [0.45, 0, 0], ftL: [-0.25, 0.35, 0], thR: [-0.2, 0, -0.16], knR: [0.45, 0, 0], ftR: [-0.25, 0.15, 0], bp: [0.0, -0.18, 0.3], bat: [0.25, 0, -0.2] });
  const BACKLIFT = pose(STANCE, { hy: -0.1, chest: [0.36, 0.38, 0.02], bp: [-0.1, 0.2, 0.2], bat: [0.2, 0.25, -2.45] });
  const DRIVE_C = pose(STANCE, { hy: -0.2, chest: [0.55, 0.05, -0.35], neck: [0.1, 0.4, 0], head: [0.1, 0.6, 0.1], thL: [-0.45, 0, 0.55], knL: [0.6, 0, 0], ftL: [-0.2, 0.5, -0.2], thR: [0.2, 0, -0.3], knR: [0.5, 0, 0], ftR: [0.3, 0, 0], bp: [0.2, -0.28, 0.3], bat: [0.05, 0, 0.1] });
  const DRIVE_F = pose(DRIVE_C, { hy: -0.16, chest: [0.2, -0.2, -0.2], head: [-0.1, 0.6, 0.05], bp: [0.12, 0.35, 0.15], bat: [0.3, 0.2, 2.6] });
  const LOFT_C = pose(DRIVE_C, { hy: -0.16, chest: [0.35, -0.05, -0.2], bat: [0, 0, 0.35] });
  const LOFT_F = pose(LOFT_C, { hy: -0.1, chest: [-0.05, -0.55, 0.05], neck: [-0.1, 0.35, 0], head: [-0.4, 0.55, 0], thL: [-0.25, 0, 0.45], knL: [0.2, 0, 0], bp: [0, 0.52, 0], bat: [-0.3, 0, 3.05] });
  const PULL_C = pose(STANCE, { hy: -0.06, chest: [0.1, -0.35, 0.12], head: [0, 0.8, 0], thL: [-0.1, 0, 0.2], thR: [0.0, 0, -0.32], knR: [0.2, 0, 0], bp: [0.08, 0.12, 0.34], bat: [-1.45, 0, 0.25] });
  const PULL_F = pose(PULL_C, { chest: [0.0, -0.95, 0.1], head: [-0.1, 1.1, 0], bp: [-0.05, 0.3, 0.05], bat: [-1.45, -2.1, 0.6] });
  const PULL_B = pose(PULL_C, { chest: [0.15, 0.25, 0.0], bp: [-0.1, 0.25, 0.25], bat: [-0.4, 0.3, -1.8] });
  const CUT_C = pose(STANCE, { hy: -0.08, chest: [0.25, 0.35, 0.05], head: [0.05, 0.6, 0], thR: [-0.2, 0.3, -0.3], knR: [0.4, 0, 0], bp: [0.0, 0.0, 0.38], bat: [-1.5, 0, -0.2] });
  const CUT_F = pose(CUT_C, { chest: [0.25, 0.6, 0.05], bp: [-0.12, 0.2, 0.25], bat: [-1.5, 1.2, 0.5] });
  const LEAVE = pose(STANCE, { hy: -0.08, chest: [0.15, 0.1, 0.05], head: [0.1, 0.9, 0.0], thL: [-0.25, 0, 0.32], knL: [0.4, 0, 0], bp: [-0.05, 0.35, 0.12], bat: [-0.2, 0, -2.6] });
  const RAISE = pose(STANCE, { hy: 0, chest: [-0.05, 0.6, 0], neck: [0, 0.3, 0], head: [-0.25, 0.4, 0], thL: [0, 0, 0.1], knL: [0, 0, 0], thR: [0, 0, -0.1], knR: [0, 0, 0], bp: [0.05, 0.62, 0.12], bat: [0.1, 0, 3.0] });
  const NS_STAND = pose(IDLE, { bp: [0.12, -0.2, 0.2], bat: [0.25, 0, 0.35], chest: [0.05, 0, 0] });

  // Bowling action (model faces down the pitch)
  const BOWL_K = [
    // last stride, bound, side-on coil, front-foot plant, release over the top, follow-through, recovery
    { t: 0.0, p: pose(IDLE, { chest: [0.25, 0, 0], shL: [-0.9, 0, 0.15], elL: [-1.2, 0, 0], shR: [0.5, 0, -0.15], elR: [-0.9, 0, 0], thL: [-0.7, 0, 0], knL: [0.6, 0, 0], thR: [0.5, 0, 0], knR: [1.1, 0, 0], ftR: [0.3, 0, 0] }) },
    { t: 0.13, p: pose(IDLE, { hy: 0.24, hips: [0, -0.3, 0], chest: [0.05, -0.4, 0], head: [0, 0.4, 0], shL: [-1.9, 0, -0.25], elL: [-1.3, 0, 0], shR: [-1.6, 0, 0.25], elR: [-1.6, 0, 0], thL: [-1.25, 0, 0], knL: [1.5, 0, 0], ftL: [-0.3, 0, 0], thR: [0.25, 0, 0], knR: [1.3, 0, 0], ftR: [0.4, 0, 0] }) },
    { t: 0.24, p: pose(IDLE, { hy: -0.04, hips: [0, -0.85, 0], chest: [-0.18, -0.55, 0], head: [0.05, 1.2, 0], shL: [-2.95, 0, 0.1], elL: [-0.15, 0, 0], shR: [0.75, 0, -0.25], elR: [-0.15, 0, 0], thL: [-1.05, 0, 0], knL: [1.1, 0, 0], ftL: [-0.2, 0, 0], thR: [0.15, 0, 0], knR: [0.45, 0, 0] }) },
    { t: 0.32, p: pose(IDLE, { hy: -0.08, hips: [0, -0.5, 0], chest: [-0.22, -0.35, 0], head: [0.05, 0.75, 0], shL: [-2.2, 0, 0.55], elL: [-0.3, 0, 0], shR: [2.1, 0, -0.2], elR: [-0.05, 0, 0], thL: [-0.62, 0, 0], knL: [0.06, 0, 0], ftL: [0.1, 0, 0], thR: [0.6, 0, 0], knR: [0.75, 0, 0], ftR: [0.4, 0, 0] }) },
    { t: 0.38, p: pose(IDLE, { hy: -0.06, hips: [0, 0.05, 0], chest: [0.12, 0.15, 0.05], head: [0.05, -0.15, 0], shL: [0.15, 0, 0.5], elL: [-1.1, 0, 0], shR: [3.45, 0, -0.12], elR: [0, 0, 0], thL: [-0.55, 0, 0], knL: [0.02, 0, 0], thR: [0.8, 0, 0], knR: [0.65, 0, 0], ftR: [0.6, 0, 0] }) },
    { t: 0.52, p: pose(IDLE, { hy: -0.3, hips: [0.15, 0.5, 0], chest: [1.05, 0.45, 0], head: [-0.9, 0, 0], shL: [0.9, 0, 0.3], elL: [-0.6, 0, 0], shR: [5.4, 0, 0.75], elR: [-0.3, 0, 0], thL: [-0.55, 0, 0], knL: [0.6, 0, 0], thR: [-0.5, 0, 0], knR: [1.2, 0, 0] }) },
    { t: 0.8, p: pose(IDLE, { hy: -0.05, chest: [0.35, 0.1, 0], head: [-0.3, 0, 0], shL: [0.3, 0, 0.15], elL: [-0.8, 0, 0], shR: [5.95, 0, 0.15], elR: [-0.8, 0, 0], thL: [-0.4, 0, 0], knL: [0.7, 0, 0], thR: [0.35, 0, 0], knR: [0.9, 0, 0] }) },
  ];
  const THROW_K = [
    { t: 0, p: pose(IDLE, { chest: [0.1, 0.4, 0], shR: [1.0, 0, -0.3], shL: [-1.2, 0, 0.3], elR: [-0.3, 0, 0], thL: [-0.4, 0, 0.15], knL: [0.3, 0, 0], thR: [0.3, 0, -0.1], knR: [0.4, 0, 0] }) },
    { t: 0.16, p: pose(IDLE, { chest: [-0.15, 0.7, 0], shR: [2.4, 0, -0.4], shL: [-1.5, 0, 0.4], elR: [-1.2, 0, 0], thL: [-0.5, 0, 0.15], knL: [0.3, 0, 0], thR: [0.4, 0, -0.1], knR: [0.4, 0, 0] }) },
    { t: 0.3, p: pose(IDLE, { chest: [0.45, -0.5, 0], shR: [4.4, 0, -0.2], shL: [-0.2, 0, 0.5], elR: [-0.2, 0, 0], thL: [-0.5, 0, 0.15], knL: [0.5, 0, 0], thR: [0.5, 0, -0.1], knR: [0.6, 0, 0] }) },
    { t: 0.6, p: pose(IDLE, { chest: [0.3, -0.3, 0], shR: [5.3, 0, 0], shL: [0.1, 0, 0.3], elR: [-0.4, 0, 0] }) },
  ];
  const DIVE_K = [
    { t: 0, p: pose(READY, {}) },
    { t: 0.18, p: pose(IDLE, { body: [0.9, 0, 0], hy: -0.3, chest: [0.2, 0, 0], shL: [-2.8, 0, 0.2], shR: [-2.8, 0, -0.2], elL: [0, 0, 0], elR: [0, 0, 0], thL: [0.3, 0, 0], thR: [-0.3, 0, 0], knR: [0.8, 0, 0] }) },
    { t: 0.42, p: pose(IDLE, { body: [1.45, 0, 0], hy: -0.75, chest: [-0.2, 0, 0], head: [-0.6, 0, 0], shL: [-3.0, 0, 0.15], shR: [-3.0, 0, -0.15], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0], thL: [0.2, 0, 0.1], knL: [0.4, 0, 0], thR: [0.1, 0, -0.1], knR: [0.9, 0, 0] }) },
    { t: 1.1, p: pose(IDLE, { body: [1.45, 0, 0], hy: -0.8, chest: [-0.25, 0, 0], head: [-0.6, 0, 0], shL: [-2.5, 0, 0.4], shR: [-2.9, 0, -0.1], thL: [0.2, 0, 0.1], knL: [0.6, 0, 0], thR: [0.1, 0, -0.1], knR: [0.9, 0, 0] }) },
  ];
  const CATCH = pose(IDLE, { hy: -0.05, chest: [0.12, 0, 0], head: [-0.35, 0, 0], shL: [-2.45, 0, -0.25], shR: [-2.45, 0, 0.25], elL: [-0.35, 0, 0], elR: [-0.35, 0, 0], thL: [-0.2, 0, 0.1], knL: [0.3, 0, 0], thR: [-0.2, 0, -0.1], knR: [0.3, 0, 0] });
  const STOP = pose(READY, { hy: -0.3, chest: [0.8, 0, 0], shL: [-1.4, 0, 0.1], shR: [-1.4, 0, -0.1], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], thL: [-1.0, 0, 0.3], knL: [1.5, 0, 0], thR: [-0.5, 0, -0.3], knR: [1.6, 0, 0] });
  const APPEAL = pose(IDLE, { chest: [-0.25, 0, 0], head: [-0.45, 0, 0], shL: [-2.9, 0, 0.35], shR: [-2.9, 0, -0.35], elL: [-0.15, 0, 0], elR: [-0.15, 0, 0], thL: [-0.3, 0, 0.1], knL: [0.4, 0, 0] });

  function keyClip(keys, loop = false) { return { keys, dur: keys[keys.length - 1].t, loop }; }
  function staticClip(p) { return { keys: [{ t: 0, p }], dur: 0 }; }
  const CLIPS = {
    idle: { fn: (t, P, out) => { lerpPose(IDLE, IDLE, 0, out); out.chest[0] += Math.sin(t * 1.8 + P.phase) * 0.02; out.head[1] = Math.sin(t * 0.4 + P.phase) * 0.35; return out; } },
    ready: staticClip(READY),
    keeper: staticClip(KEEPER),
    keeperUp: staticClip(KEEPER_UP),
    stance: { fn: (t, P, out) => { lerpPose(STANCE, STANCE, 0, out); out.bat[2] += Math.sin(t * 2.2) * 0.04; out.bp[1] += Math.sin(t * 2.2) * 0.01; return out; } },
    backlift: staticClip(BACKLIFT),
    leave: staticClip(LEAVE),
    ns: { fn: (t, P, out) => { lerpPose(NS_STAND, NS_STAND, 0, out); out.head[1] = 0.2; return out; } },
    nsBackup: staticClip(pose(NS_STAND, { hy: -0.06, chest: [0.25, 0, 0], thL: [-0.4, 0, 0.1], knL: [0.5, 0, 0], thR: [0.2, 0, -0.1], knR: [0.3, 0, 0], bp: [0.12, -0.15, 0.25], bat: [0.6, 0, 0.6] })),
    drive: keyClip([{ t: 0, p: BACKLIFT }, { t: 0.12, p: DRIVE_C }, { t: 0.45, p: DRIVE_F }, { t: 0.9, p: DRIVE_F }]),
    loft: keyClip([{ t: 0, p: BACKLIFT }, { t: 0.12, p: LOFT_C }, { t: 0.5, p: LOFT_F }, { t: 1.0, p: LOFT_F }]),
    pull: keyClip([{ t: 0, p: PULL_B }, { t: 0.12, p: PULL_C }, { t: 0.45, p: PULL_F }, { t: 0.9, p: PULL_F }]),
    cut: keyClip([{ t: 0, p: BACKLIFT }, { t: 0.12, p: CUT_C }, { t: 0.42, p: CUT_F }, { t: 0.9, p: CUT_F }]),
    raise: keyClip([{ t: 0, p: STANCE }, { t: 0.35, p: RAISE }, { t: 2.0, p: RAISE }]),
    bowl: keyClip(BOWL_K),
    throw: keyClip(THROW_K),
    dive: keyClip(DIVE_K),
    catch: staticClip(CATCH),
    stop: staticClip(STOP),
    appeal: staticClip(APPEAL),
    run: { fn: (t, P, out) => runPose(P.phase, P.runAmp == null ? 1 : P.runAmp, out, P.o.batter) },
    jog: { fn: (t, P, out) => runPose(P.phase, 0.45, out, P.o.batter) },
    celebrate: { fn: (t, P, out) => { lerpPose(IDLE, IDLE, 0, out); const h = Math.abs(Math.sin(t * 6 + P.phase)); out.hy = h * 0.22 - 0.02; out.shL = [-0.3, 0, 2.6 + Math.sin(t * 6) * 0.2]; out.shR = [-0.3, 0, -2.6 - Math.sin(t * 6) * 0.2]; out.elL = [-0.3, 0, 0]; out.elR = [-0.3, 0, 0]; out.head = [-0.35, 0, 0]; out.knL = [h * 0.6, 0, 0]; out.knR = [h * 0.6, 0, 0]; out.thL = [-h * 0.3, 0, 0.08]; out.thR = [-h * 0.3, 0, -0.08]; return out; } },
    dejected: { fn: (t, P, out) => { runPose(P.phase, 0.28, out, true); out.head[0] = 0.55; out.chest[0] += 0.15; return out; } },
  };
  function runPose(ph, a, out, batter) {
    lerpPose(IDLE, IDLE, 0, out);
    const s = Math.sin(ph), c = Math.cos(ph);
    out.thL = [-s * 0.95 * a, 0, 0.04]; out.thR = [s * 0.95 * a, 0, -0.04];
    out.knL = [a * (0.25 + 1.0 * Math.max(0, Math.sin(ph + 1.4))), 0, 0];
    out.knR = [a * (0.25 + 1.0 * Math.max(0, Math.sin(ph + 1.4 + Math.PI))), 0, 0];
    out.ftL = [-0.2 * a, 0, 0]; out.ftR = [-0.2 * a, 0, 0];
    out.shL = [s * 0.85 * a, 0, 0.12]; out.shR = [-s * 0.85 * a, 0, -0.12];
    out.elL = [-0.4 - 0.9 * a, 0, 0]; out.elR = [-0.4 - 0.9 * a, 0, 0];
    out.chest = [0.18 * a, s * 0.18 * a, 0]; out.head = [-0.12 * a, -s * 0.12 * a, 0];
    out.hy = Math.abs(c) * 0.07 * a - 0.04 * a;
    if (batter) { out.bp = [0.15, -0.05, 0.22]; out.bat = [0.9, 0, 0.5 + s * 0.1]; }
    return out;
  }
  function evalClip(clip, t, P, out) {
    if (clip.fn) return clip.fn(t, P, out);
    const k = clip.keys;
    if (k.length === 1 || clip.dur === 0) return lerpPose(k[0].p, k[0].p, 0, out);
    if (clip.loop) t = t % clip.dur;
    if (t <= 0) return lerpPose(k[0].p, k[0].p, 0, out);
    for (let i = 0; i < k.length - 1; i++) {
      if (t <= k[i + 1].t) { const w = (t - k[i].t) / (k[i + 1].t - k[i].t); return lerpPose(k[i].p, k[i + 1].p, smooth(clamp(w, 0, 1)), out); }
    }
    return lerpPose(k[k.length - 1].p, k[k.length - 1].p, 0, out);
  }

  /* ---------- animator ---------- */
  function Animator() { this.name = ''; this.clip = CLIPS.idle; this.t = 0; this.speed = 1; this.fade = 1; this.fadeDur = 0.0001; this.cur = clone(IDLE); this.from = clone(IDLE); this.tmp = clone(IDLE); }
  Animator.prototype.play = function (name, opt) {
    opt = opt || {};
    if (this.name === name && !opt.restart) return;
    lerpPose(this.cur, this.cur, 0, this.from);
    this.name = name; this.clip = CLIPS[name]; this.t = opt.t || 0; this.speed = opt.speed || 1;
    this.fade = 0; this.fadeDur = opt.fade == null ? 0.15 : Math.max(0.0001, opt.fade);
  };
  Animator.prototype.update = function (dt) {
    const P = this.rig;
    this.t += dt * this.speed;
    const target = evalClip(this.clip, this.t, P, this.tmp);
    if (this.fade < this.fadeDur) { this.fade += dt; lerpPose(this.from, target, smooth(clamp(this.fade / this.fadeDur, 0, 1)), this.cur); }
    else lerpPose(target, target, 0, this.cur);
    if (P.extra) P.extra(this.cur);
    apply(P, this.cur);
  };
  function apply(P, p) {
    const j = P.j;
    for (const k of J) { const n = j[k]; if (n) n.rotation.set(p[k][0], p[k][1], p[k][2]); }
    j.body.position.y = 0.98 + p.hy;
    if (P.bat) { P.bat.position.set(p.bp[0], p.bp[1], p.bp[2]); if (P.ikOn !== false) solveBatIK(P); }
  }

  /* ---------- two-bone IK for hands on the bat ---------- */
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0);
  const GRIP_TOP = new THREE.Vector3(0, -0.035, 0), GRIP_BOT = new THREE.Vector3(0, -0.15, 0);
  function ik(sh, el, ha, target, pole) {
    const S = sh.getWorldPosition(v1);
    const L1 = el.position.length(), L2 = ha.position.length() + 0.03;
    const dir = v2.copy(target).sub(S); let d = dir.length();
    d = clamp(d, 0.05, L1 + L2 - 0.002); dir.normalize();
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pv = v3.copy(pole).sub(S); pv.sub(v4.copy(dir).multiplyScalar(pv.dot(dir))).normalize();
    const E = v4.copy(S).addScaledVector(dir, L1 * cosA).addScaledVector(pv, L1 * sinA);
    const T = v5.copy(S).addScaledVector(dir, d);
    // upper arm
    const dSE = v3.copy(E).sub(S).normalize();
    q1.setFromUnitVectors(DOWN, dSE);
    sh.parent.getWorldQuaternion(q2); q2.invert();
    sh.quaternion.copy(q2.multiply(q1));
    sh.updateMatrixWorld(true);
    // forearm
    const dET = v3.copy(T).sub(E).normalize();
    const qe = q2.setFromUnitVectors(DOWN, dET);
    el.quaternion.copy(q1.invert().multiply(qe));
    el.updateMatrixWorld(true);
  }
  function solveBatIK(P) {
    const j = P.j;
    P.g.updateMatrixWorld(true);
    const top = P.bat.localToWorld(v5.copy(GRIP_TOP)).clone();
    const bot = P.bat.localToWorld(v5.copy(GRIP_BOT)).clone();
    const poleL = j.chest.localToWorld(new THREE.Vector3(0.55, -0.1, 0.45));
    const poleR = j.chest.localToWorld(new THREE.Vector3(-0.55, -0.25, 0.4));
    ik(j.shL, j.elL, j.haL, top, poleL);
    ik(j.shR, j.elR, j.haR, bot, poleR);
  }

  /* ---------- per-frame motion helpers ---------- */
  function face(P, x, z) { const dx = x - P.g.position.x, dz = z - P.g.position.z; if (dx * dx + dz * dz > 1e-4) P.g.rotation.y = Math.atan2(dx, dz); }
  function turnToward(P, x, z, dt, rate = 8) {
    const dx = x - P.g.position.x, dz = z - P.g.position.z; if (dx * dx + dz * dz < 1e-4) return;
    const a = Math.atan2(dx, dz); P.g.rotation.y = lerpAng(P.g.rotation.y, a, Math.min(1, dt * rate));
  }
  // Move toward P.target; returns true while moving.
  function step(P, dt) {
    const T = P.target;
    if (!T) return false;
    if (T.delay > 0) { T.delay -= dt; return false; }
    const dx = T.x - P.g.position.x, dz = T.z - P.g.position.z, d = Math.hypot(dx, dz);
    if (d < 0.04) { P.g.position.x = T.x; P.g.position.z = T.z; P.target = null; if (T.done) T.done(P); return false; }
    const s = Math.min(d, T.speed * dt);
    P.g.position.x += dx / d * s; P.g.position.z += dz / d * s;
    if (!T.noTurn) turnToward(P, T.x, T.z, dt, 12);
    P.phase += dt * (3.2 + T.speed * 1.25);
    P.runAmp = clamp(T.speed / 6.5, 0.3, 1.1);
    return true;
  }

  return { build, recolor, CLIPS, face, turnToward, step, lerpAng, jerseyTex, stickerTex };
})();
