/* ===== Skinned players: a modelled human (head, hands, trousers, shoes) dressed in a
   procedurally built team jersey bound to its skeleton, driven by the pose rig in rig.js
   and by motion-captured locomotion retargeted from a second Mixamo-skeleton model. ===== */
const AV = (() => {
  const A = { ready: false };
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const TAU = Math.PI * 2;
  const MAIN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

  /* ---------- loading ---------- */
  function load(base, onProgress) {
    const L = new THREE.GLTFLoader();
    const get = (f) => new Promise((res, rej) => L.load(base + f, res, e => onProgress && e.total && onProgress(f, e.loaded / e.total), rej));
    return Promise.all([get('player.json'), get('moves.json')]).then(([p, m]) => {
      A.base = p.scene; A.moves = m;
      prepareBase();
      A.clips = {};
      ['idle', 'run', 'walk'].forEach(n => { const c = m.animations.find(a => a.name === n); if (c) A.clips[n] = retarget(c, m.scene); });
      buildTemplates();
      A.ready = true;
      return A;
    });
  }

  function bone(root, name) { let b = null; root.traverse(o => { if (!b && o.isBone && o.name === name) b = o; }); return b; }
  function wpos(o) { return o.getWorldPosition(V()); }

  /* ---------- the base body ---------- */
  function prepareBase() {
    const root = A.base;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      const n = o.material.name;
      if (n === 'Wolf3D_Headwear' || n === 'Wolf3D_Outfit_Top') { o.visible = false; o.userData.drop = true; }
      if (n === 'Wolf3D_Outfit_Bottom') { o.material.map = null; o.material.roughness = 0.78; o.material.metalness = 0; o.userData.role = 'pants'; }
      if (n === 'Wolf3D_Outfit_Footwear') { o.material.map = null; o.material.color.set(0xf2f2f2); o.material.roughness = 0.55; o.userData.role = 'shoes'; }
      if (n === 'Wolf3D_Skin' || n === 'Wolf3D_Body') o.userData.role = 'skin';
      if (n === 'Wolf3D_Beard') o.userData.role = 'beard';
    });
    // drop hidden meshes entirely so clones stay light
    const drop = []; root.traverse(o => { if (o.userData.drop) drop.push(o); }); drop.forEach(o => o.parent.remove(o));
    const body = root.getObjectByName('Wolf3D_Body') || (() => { let s; root.traverse(o => { if (!s && o.isSkinnedMesh) s = o; }); return s; })();
    A.skeleton = body.skeleton; A.bindMatrix = body.bindMatrix.clone(); A.bodyParent = body.parent;
    const b = n => wpos(bone(root, n));
    A.bp = {}; MAIN.concat(['Head', 'HeadTop_End']).forEach(n => { const o = bone(root, n); if (o) A.bp[n] = wpos(o); });
    A.restWorldQ = {}; A.restLocalQ = {}; A.restLocalP = {};
    root.traverse(o => { if (o.isBone) { A.restWorldQ[o.name] = o.getWorldQuaternion(Q()); A.restLocalQ[o.name] = o.quaternion.clone(); A.restLocalP[o.name] = o.position.clone(); } });
    // procedural jersey bound to the same skeleton
    const jersey = buildJersey();
    A.bodyParent.add(jersey.torso); A.bodyParent.add(jersey.sleeves);
    jersey.torso.bind(A.skeleton, A.bindMatrix); jersey.sleeves.bind(A.skeleton, A.bindMatrix);
  }

  // distance from point p to segment ab
  function segDist(p, a, b) { const ab = V().subVectors(b, a), ap = V().subVectors(p, a); const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, t).distanceTo(p); }
  function autoSkin(geo, segs) {
    const pos = geo.attributes.position, n = pos.count;
    const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4), p = V();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      const c = segs.map(s => ({ i: s.i, w: 1 / Math.pow(segDist(p, s.a, s.b) + 0.012, 6) })).sort((x, y) => y.w - x.w).slice(0, 4);
      const sum = c.reduce((s, x) => s + x.w, 0);
      c.forEach((x, k) => { idx[i * 4 + k] = x.i; wt[i * 4 + k] = x.w / sum; });
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  }
  function seg(from, to) { const bones = A.skeleton.bones; const i = bones.findIndex(b => b.name === from); return { i, a: A.bp[from], b: A.bp[to] }; }

  function buildJersey() {
    const bp = A.bp, cx = bp.Spine1.x, cz = bp.Spine1.z;
    // torso: elliptical rings, u around (front is +z), v up
    const rings = [[0.955, 0.192, 0.15], [1.0, 0.188, 0.145], [1.08, 0.178, 0.135], [1.17, 0.174, 0.132], [1.26, 0.183, 0.138], [1.35, 0.196, 0.142], [1.43, 0.198, 0.138], [1.485, 0.18, 0.125], [1.52, 0.13, 0.098], [1.545, 0.085, 0.075], [1.575, 0.066, 0.064], [1.59, 0.064, 0.062]];
    const seg = 40, pos = [], uv = [], ix = [];
    rings.forEach(([y, rx, rz], j) => {
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        const front = Math.max(0, Math.cos(a));
        pos.push(cx + Math.sin(a) * rx, y, cz + 0.008 + Math.cos(a) * rz * (1 + front * 0.06));
        uv.push(i / seg, j / (rings.length - 1));
      }
    });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; ix.push(a, b, a + 1, b, b + 1, a + 1); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(ix); tg.computeVertexNormals();
    autoSkin(tg, [seg2('Hips', 'Spine'), seg2('Spine', 'Spine1'), seg2('Spine1', 'Spine2'), seg2('Spine2', 'Neck'), seg2('LeftShoulder', 'LeftArm'), seg2('RightShoulder', 'RightArm')]);
    // sleeves: tubes along shoulder -> elbow -> wrist
    const sp = [], su = [], si = [];
    let base = 0;
    ['Left', 'Right'].forEach(side => {
      const sh = bp[side + 'Arm'], el = bp[side + 'ForeArm'], wr = bp[side + 'Hand'];
      const inner = new THREE.Vector3(sh.x * 0.55 + cx * 0.45, sh.y - 0.01, sh.z);
      const wrist = el.clone().lerp(wr, 0.9);
      const path = [inner, sh, el.clone().lerp(sh, 0.04), el, wrist];
      const rad = [0.075, 0.07, 0.055, 0.052, 0.042];
      const N = 22, ring = 16;
      for (let k = 0; k <= N; k++) {
        const t = k / N * (path.length - 1), s = Math.min(Math.floor(t), path.length - 2), f = t - s;
        const c = path[s].clone().lerp(path[s + 1], f);
        const r = rad[s] + (rad[s + 1] - rad[s]) * f;
        const dir = path[s + 1].clone().sub(path[s]).normalize();
        const side1 = new THREE.Vector3(0, 0, 1).cross(dir).normalize();
        if (side1.lengthSq() < 0.5) side1.set(1, 0, 0);
        const side2 = dir.clone().cross(side1).normalize();
        for (let i = 0; i <= ring; i++) {
          const a = i / ring * TAU;
          const p = c.clone().addScaledVector(side1, Math.cos(a) * r).addScaledVector(side2, Math.sin(a) * r * 0.92);
          sp.push(p.x, p.y, p.z); su.push(i / ring, k / N);
        }
      }
      for (let k = 0; k < N; k++) for (let i = 0; i < ring; i++) { const a = base + k * (ring + 1) + i, b = a + ring + 1; si.push(a, a + 1, b, b, a + 1, b + 1); }
      base += (N + 1) * (ring + 1);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si); sg.computeVertexNormals();
    autoSkin(sg, [seg2('Spine2', 'Neck'), seg2('LeftShoulder', 'LeftArm'), seg2('LeftArm', 'LeftForeArm'), seg2('LeftForeArm', 'LeftHand'), seg2('RightShoulder', 'RightArm'), seg2('RightArm', 'RightForeArm'), seg2('RightForeArm', 'RightHand')]);
    const tm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74, side: THREE.DoubleSide, skinning: true });
    const sm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74, side: THREE.DoubleSide, skinning: true });
    const torso = new THREE.SkinnedMesh(tg, tm); torso.name = 'Jersey'; torso.userData.role = 'jersey';
    const sleeves = new THREE.SkinnedMesh(sg, sm); sleeves.name = 'Sleeves'; sleeves.userData.role = 'sleeves';
    [torso, sleeves].forEach(m => { m.castShadow = true; m.frustumCulled = false; });
    return { torso, sleeves };
  }
  function seg2(a, b) { return seg(a, b); }

  /* ---------- gear, attached to bones in the bind pose ---------- */
  const G = {};
  function gearMats() {
    if (G.ready) return;
    G.pad = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.7 });
    G.grille = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.3, metalness: 0.85 });
    G.ready = true;
  }
  function attach(root, boneName, mesh) { const b = bone(root, boneName); root.updateMatrixWorld(true); b.attach(mesh); mesh.castShadow = true; return mesh; }
  function capsuleBetween(a, b, r1, r2, mat) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r1, r2, len, 14, 1);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
    return m;
  }
  function addPads(root, keeper) {
    ['Left', 'Right'].forEach(side => {
      const k = A.bp[side + 'Leg'], an = A.bp[side + 'Foot'];
      const front = new THREE.Vector3(0, 0, 0.045);
      const top = k.clone().add(front).add(new THREE.Vector3(0, 0.1, 0)), bot = an.clone().add(front).add(new THREE.Vector3(0, 0.02, 0.02));
      const pad = capsuleBetween(top, bot, 0.078, 0.07, G.pad); pad.scale.set(1.25, 1, 0.9); pad.userData.role = 'pad';
      attach(root, side + 'Leg', pad);
      [-0.045, 0, 0.045].forEach(dx => { const r = capsuleBetween(top.clone().add(new THREE.Vector3(dx, -0.03, 0.06)), bot.clone().add(new THREE.Vector3(dx, 0.04, 0.05)), 0.014, 0.014, G.pad); attach(root, side + 'Leg', r); });
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.19, 12), G.pad); roll.rotation.z = Math.PI / 2; roll.position.copy(k).add(new THREE.Vector3(0, 0.06, 0.09)); attach(root, side + 'Leg', roll);
    });
  }
  function addGloves(root, keeper) {
    ['Left', 'Right'].forEach(side => {
      const h = A.bp[side + 'Hand'], e = A.bp[side + 'ForeArm'];
      const dir = h.clone().sub(e).normalize();
      const glove = new THREE.Mesh(new THREE.SphereGeometry(keeper ? 0.07 : 0.058, 14, 10), G.pad);
      glove.position.copy(h).addScaledVector(dir, keeper ? 0.07 : 0.055); glove.scale.set(1, keeper ? 1.35 : 1.2, keeper ? 0.85 : 0.95);
      glove.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      glove.userData.role = 'glove';
      attach(root, side + 'Hand', glove);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      cuff.position.copy(h).addScaledVector(dir, -0.005); cuff.quaternion.copy(glove.quaternion); cuff.userData.role = 'trim';
      attach(root, side + 'Hand', cuff);
    });
  }
  function headFrame() {
    const h = A.bp.Head, top = A.bp.HeadTop_End;
    return { c: new THREE.Vector3(h.x, (h.y + top.y) / 2 + 0.01, h.z + 0.02), top };
  }
  function addHelmet(root) {
    const { c } = headFrame();
    const shell = new THREE.MeshStandardMaterial({ color: 0x1a2a40, roughness: 0.25, metalness: 0.15 }); shell.userData.role = 'helmet';
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.142, 26, 14, 0, TAU, 0, Math.PI * 0.6), shell);
    dome.position.copy(c).add(new THREE.Vector3(0, 0.01, -0.008)); dome.scale.set(1.0, 1.08, 1.18); dome.userData.role = 'helmet';
    attach(root, 'Head', dome);
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.014, 22, 1, false, -Math.PI / 2, Math.PI), shell);
    peak.position.copy(c).add(new THREE.Vector3(0, 0.035, 0.06)); peak.scale.set(1, 1, 0.8); peak.rotation.x = 0.15; peak.userData.role = 'helmet';
    attach(root, 'Head', peak);
    [-0.04, -0.08, -0.12].forEach((dy, i) => {
      const bar = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.004, 0.0055, 6, 22, Math.PI * 0.78), G.grille);
      bar.rotation.set(Math.PI / 2, 0, Math.PI + Math.PI * 0.11); bar.position.copy(c).add(new THREE.Vector3(0, dy + 0.02, 0.012));
      attach(root, 'Head', bar);
    });
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6), G.grille); v.position.copy(c).add(new THREE.Vector3(0, -0.05, 0.162)); v.rotation.x = 0.1; attach(root, 'Head', v);
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.135, 0.06, 18, 1, true, Math.PI * 0.55, Math.PI * 0.9), shell);
    guard.position.copy(c).add(new THREE.Vector3(0, -0.07, -0.01)); guard.userData.role = 'helmet'; attach(root, 'Head', guard);
  }
  function addCap(root) {
    const { c } = headFrame();
    const cm = new THREE.MeshStandardMaterial({ color: 0x1a2a40, roughness: 0.65 }); cm.userData.role = 'cap';
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.128, 24, 12, 0, TAU, 0, Math.PI * 0.46), cm);
    dome.position.copy(c).add(new THREE.Vector3(0, 0.02, -0.008)); dome.scale.set(1.0, 1.05, 1.12); dome.userData.role = 'cap';
    attach(root, 'Head', dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), cm);
    brim.position.copy(c).add(new THREE.Vector3(0, 0.055, 0.1)); brim.scale.set(0.95, 1, 1.3); brim.rotation.x = 0.16; brim.userData.role = 'cap';
    attach(root, 'Head', brim);
  }
  function buildTemplates() {
    gearMats();
    const SU = THREE.SkeletonUtils;
    const make = (kind) => {
      const t = SU.clone(A.base); t.updateMatrixWorld(true);
      if (kind === 'batter') { addHelmet(t); addPads(t); addGloves(t); }
      else if (kind === 'keeper') { addCap(t); addPads(t, true); addGloves(t, true); }
      else addCap(t);
      return t;
    };
    A.templates = { batter: make('batter'), keeper: make('keeper'), fielder: make('fielder') };
  }

  /* ---------- motion capture retargeting (Xbot clips onto this skeleton) ---------- */
  function retarget(clip, src) {
    const mixer = new THREE.AnimationMixer(src);
    src.updateMatrixWorld(true);
    const srcBone = n => src.getObjectByName('mixamorig' + n);
    const restSrc = {};
    const names = [];
    A.base.traverse(o => { if (o.isBone && srcBone(o.name)) names.push(o.name); });
    names.forEach(n => { restSrc[n] = srcBone(n).getWorldQuaternion(Q()); });
    const srcHipsY = wpos(srcBone('Hips')).y, dstHips = A.restLocalP.Hips, ratio = A.bp.Hips.y / srcHipsY;
    const act = mixer.clipAction(clip); act.play();
    const fps = 30, n = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(n), qv = {}, pv = new Float32Array(n * 3);
    names.forEach(nm => qv[nm] = new Float32Array(n * 4));
    const parentName = {}; A.base.traverse(o => { if (o.isBone) parentName[o.name] = o.parent && o.parent.isBone ? o.parent.name : null; });
    const armatureQ = (() => { const h = bone(A.base, 'Hips'); return h.parent.getWorldQuaternion(Q()); })();
    let x0 = null, z0 = null;
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / fps); times[f] = t;
      mixer.setTime(t); src.updateMatrixWorld(true);
      const Wt = {};
      names.forEach(nm => {
        const wx = srcBone(nm).getWorldQuaternion(Q());
        const w = wx.multiply(restSrc[nm].clone().invert()).multiply(A.restWorldQ[nm]);
        Wt[nm] = w;
        const pn = parentName[nm];
        const pw = pn ? (Wt[pn] || A.restWorldQ[pn]) : armatureQ;
        const local = pw.clone().invert().multiply(w);
        qv[nm].set([local.x, local.y, local.z, local.w], f * 4);
      });
      const hp = wpos(srcBone('Hips'));
      if (x0 === null) { x0 = hp.x; z0 = hp.z; }
      pv.set([dstHips.x + (hp.x - x0) * ratio * 0.3, hp.y * ratio, dstHips.z], f * 3);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(src);
    const tracks = names.map(nm => new THREE.QuaternionKeyframeTrack(nm + '.quaternion', times, qv[nm]));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, pv));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  /* ---------- per player ---------- */
  function create(P, kind) {
    const o = THREE.SkeletonUtils.clone(A.templates[kind]);
    o.traverse(n => {
      if (n.isMesh) {
        n.material = n.material.clone(); n.castShadow = true; n.frustumCulled = false;
        const role = n.userData.role || n.material.userData.role;
        n.userData.role = role;
      }
    });
    const bones = {}; o.traverse(n => { if (n.isBone) bones[n.name] = n; });
    P.g.add(o);
    // hide the primitive body but keep the bat
    P.g.traverse(n => { if (n.isMesh && !isUnder(n, o) && !(P.bat && isUnder(n, P.bat))) n.visible = false; });
    const mixer = new THREE.AnimationMixer(o);
    const acts = {};
    Object.entries(A.clips).forEach(([k, c]) => { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); acts[k] = a; });
    const S = { o, bones, mixer, acts, kind, w: 0, cur: null, proc: {}, moc: {} };
    MAIN.forEach(n => { S.proc[n] = Q(); S.moc[n] = Q(); });
    P.av = S;
    // skin tone variety
    const tone = [1, 0.86, 0.7, 0.58, 0.5, 0.92][Math.floor(Math.random() * 6)];
    o.traverse(n => { if (n.isMesh && n.userData.role === 'skin') n.material.color.setRGB(tone, tone * 0.93, tone * 0.88); if (n.isMesh && n.userData.role === 'beard') n.visible = Math.random() < 0.35; });
    return S;
  }
  function isUnder(n, root) { for (let p = n; p; p = p.parent) if (p === root) return true; return false; }
  function dress(P, team, number, name) {
    const S = P.av; if (!S) return;
    const tex = RIG.jerseyTex(team, number, name);
    S.o.traverse(n => {
      if (!n.isMesh) return;
      const r = n.userData.role, m = n.material;
      if (r === 'jersey') { if (m.map) m.map.dispose(); m.map = tex; m.needsUpdate = true; }
      else if (r === 'sleeves') { m.color.set(team.c1); }
      else if (r === 'pants') m.color.set(team.c2);
      else if (r === 'helmet' || r === 'cap') m.color.set(team.c2);
      else if (r === 'trim') m.color.set(team.c1);
    });
    if (P.bat && P.bat.userData.sticker) { const st = P.bat.userData.sticker; if (st.map) st.map.dispose(); st.map = RIG.stickerTex(team, team.abbr); st.needsUpdate = true; }
    if (P.trim) P.trim.color.set(team.c1);
  }

  /* ---------- driving the skeleton from the pose rig ---------- */
  const t1 = V(), t2 = V(), t3 = V(), t4 = V(), tq = Q(), tq2 = Q(), DOWN = new THREE.Vector3(0, -1, 0);
  function setWorldQ(b, w) { b.parent.getWorldQuaternion(tq2); b.quaternion.copy(tq2.invert().multiply(w)); b.updateMatrixWorld(true); }
  // world rotation of a pose-rig joint mapped onto a bone: R * restWorld where R is the joint's world rotation (rig faces +z at rest)
  function jointWorld(j, restName, out) { j.getWorldQuaternion(out); return out.multiply(A.restWorldQ[restName]); }
  function aimBone(b, childName, target) {
    b.quaternion.copy(A.restLocalQ[b.name]); b.updateMatrixWorld(true);
    const c = A.restLocalP[childName];
    const from = b.localToWorld(t3.copy(c)).sub(b.getWorldPosition(t4)).normalize();
    const to = t1.copy(target).sub(t4).normalize();
    tq.setFromUnitVectors(from, to);
    const w = b.getWorldQuaternion(Q()); setWorldQ(b, tq.multiply(w));
  }
  function limbIK(S, up, mid, end, target, pole) {
    const B = S.bones, b1 = B[up], b2 = B[mid];
    const L1 = A.restLocalP[mid].length(), L2 = A.restLocalP[end].length();
    const s = b1.getWorldPosition(V());
    const dir = V().subVectors(target, s); let d = dir.length(); d = Math.max(0.05, Math.min(L1 + L2 - 0.003, d)); dir.normalize();
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))), sinA = Math.sqrt(1 - cosA * cosA);
    const pv = V().subVectors(pole, s); pv.sub(dir.clone().multiplyScalar(pv.dot(dir))); if (pv.lengthSq() < 1e-6) pv.set(0, 0, 1); pv.normalize();
    const E = s.clone().addScaledVector(dir, L1 * cosA).addScaledVector(pv, L1 * sinA);
    aimBone(b1, mid, E);
    aimBone(b2, end, s.clone().addScaledVector(dir, d));
  }
  function procedural(P, S) {
    const j = P.j, B = S.bones;
    P.g.updateMatrixWorld(true);
    ['LeftToeBase', 'RightToeBase'].forEach(n => { if (B[n]) B[n].quaternion.copy(A.restLocalQ[n]); });
    // hips: rotation and height follow the rig's hips
    const hipsW = jointWorld(j.hips, 'Hips', Q());
    const hipTarget = j.hips.getWorldPosition(V()); hipTarget.y += A.bp.Hips.y - 0.98;
    B.Hips.position.copy(B.Hips.parent.worldToLocal(hipTarget.clone()));
    setWorldQ(B.Hips, hipsW);
    const chestW = jointWorld(j.chest, 'Spine2', Q());
    const hipsRot = j.hips.getWorldQuaternion(Q()), chestRot = j.chest.getWorldQuaternion(Q()), headRot = j.head.getWorldQuaternion(Q());
    setWorldQ(B.Spine, hipsRot.clone().slerp(chestRot, 0.35).multiply(A.restWorldQ.Spine));
    setWorldQ(B.Spine1, hipsRot.clone().slerp(chestRot, 0.7).multiply(A.restWorldQ.Spine1));
    setWorldQ(B.Spine2, chestW);
    setWorldQ(B.Neck, chestRot.clone().slerp(headRot, 0.45).multiply(A.restWorldQ.Neck));
    setWorldQ(B.Head, jointWorld(j.head, 'Head', Q()));
    ['Left', 'Right'].forEach(sd => { B[sd + 'Shoulder'].quaternion.copy(A.restLocalQ[sd + 'Shoulder']); B[sd + 'Shoulder'].updateMatrixWorld(true); });
    // arms reach for the rig's hands (which hold the bat for batters)
    const s = { L: 'Left', R: 'Right' };
    for (const k of ['L', 'R']) {
      const sd = s[k];
      const hand = j['ha' + k].getWorldPosition(V());
      if (P.bat) { /* hands meet the handle: aim the wrist slightly short of the grip */
        const elb = j['el' + k].getWorldPosition(V()); hand.addScaledVector(V().subVectors(hand, elb).normalize(), -0.03);
      }
      const pole = j['el' + k].getWorldPosition(V()).multiplyScalar(2).sub(V().addVectors(j['sh' + k].getWorldPosition(V()), hand).multiplyScalar(0.5));
      limbIK(S, sd + 'Arm', sd + 'ForeArm', sd + 'Hand', hand, pole);
      B[sd + 'Hand'].quaternion.copy(A.restLocalQ[sd + 'Hand']); B[sd + 'Hand'].updateMatrixWorld(true);
      // legs plant where the rig's ankles are
      const ank = j['ft' + k].getWorldPosition(V()); ank.y += A.bp[sd + 'Foot'].y - 0.1;
      const knee = j['kn' + k].getWorldPosition(V());
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(j.hips.getWorldQuaternion(Q())).multiplyScalar(0.6);
      const kpole = knee.clone().multiplyScalar(2).sub(V().addVectors(j['th' + k].getWorldPosition(V()), ank).multiplyScalar(0.5)).add(fwd);
      limbIK(S, sd + 'UpLeg', sd + 'Leg', sd + 'Foot', ank, kpole);
      setWorldQ(B[sd + 'Foot'], jointWorld(j['ft' + k], sd + 'Foot', Q()));
    }
  }
  const MOCAP = { idle: 'idle', run: 'run', jog: 'run', dejected: 'walk' };
  function drive(P, dt) {
    const S = P.av; if (!S) return;
    const name = P.anim.name;
    const want = (!P.o.batter && MOCAP[name] && A.clips[MOCAP[name]]) ? MOCAP[name] : null;
    S.w += ((want ? 1 : 0) - S.w) * Math.min(1, dt * 9);
    if (want) S.cur = want;
    // mocap pass
    if (S.w > 0.01 && S.cur) {
      const speed = P.target ? P.target.speed : 0;
      Object.entries(S.acts).forEach(([k, a]) => a.setEffectiveWeight(k === S.cur ? 1 : 0));
      const a = S.acts[S.cur];
      if (S.cur === 'run') a.timeScale = Math.max(0.55, Math.min(1.5, (speed || 5) / 5.2));
      else if (S.cur === 'walk') a.timeScale = Math.max(0.5, Math.min(1.4, (speed || 1.3) / 1.3));
      else a.timeScale = 1;
      S.mixer.update(dt);
      MAIN.forEach(n => S.moc[n].copy(S.bones[n].quaternion));
      S.mocHips = S.bones.Hips.position.clone();
    }
    if (S.w >= 0.99) { S.o.updateMatrixWorld(true); look(P, S); return; }
    procedural(P, S);
    if (S.w > 0.01) {
      MAIN.forEach(n => S.bones[n].quaternion.slerp(S.moc[n], S.w));
      S.bones.Hips.position.lerp(S.mocHips, S.w);
      S.o.updateMatrixWorld(true);
    }
    look(P, S);
  }
  // keep the eyes on a point (the ball, the batter) without breaking the neck
  const lm = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  function look(P, S) {
    const tgt = P.look; if (!tgt) return;
    const H = S.bones.Head, N = S.bones.Neck;
    const hp = H.getWorldPosition(V());
    const f = V().subVectors(tgt, hp); if (f.lengthSq() < 0.01) return; f.normalize();
    const chestF = new THREE.Vector3(0, 0, 1).applyQuaternion(S.bones.Spine2.getWorldQuaternion(Q()).multiply(A.restWorldQ.Spine2.clone().invert()));
    const along = f.dot(chestF);
    let w = (P.lookW == null ? 0.85 : P.lookW) * Math.max(0, Math.min(1, (along + 0.35) / 0.6));
    if (w <= 0.01) return;
    lm.lookAt(tgt, hp, UP);
    const want = Q().setFromRotationMatrix(lm).multiply(A.restWorldQ.Head);
    const cur = H.getWorldQuaternion(Q());
    setWorldQ(N, N.getWorldQuaternion(Q()).slerp(want.clone().multiply(A.restWorldQ.Head.clone().invert()).multiply(A.restWorldQ.Neck), w * 0.35));
    setWorldQ(H, cur.slerp(want, w));
  }
  function replayObjects(P) { const S = P.av; return S ? MAIN.map(n => S.bones[n]).filter(Boolean) : []; }
  function handWorld(P, side, out) { const S = P.av; if (!S) return null; return S.bones[(side === 'L' ? 'Left' : 'Right') + 'Hand'].getWorldPosition(out || V()); }

  Object.assign(A, { load, create, dress, drive, replayObjects, handWorld });
  return A;
})();
