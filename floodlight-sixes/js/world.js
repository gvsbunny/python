/* ===== Stadium, lighting, post-processing, effects and replay recording ===== */
const WORLD = (() => {
  const W = {};
  let renderer, scene, camera, composer, bloom, fxaa, grade;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    t.userData = { canvas: c };
    return t;
  }
  function glowTex(inner, outer) {
    return canvasTex(128, 128, (g, w) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, inner); r.addColorStop(0.22, outer); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
  }

  /* ---------- renderer + post ---------- */
  function init(canvas, quality) {
    W.quality = quality;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !hasPost(), powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1.25));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1500);
    W.renderer = renderer; W.scene = scene; W.camera = camera;
    if (THREE.RoomEnvironment) {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = W.roomEnv = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    if (hasPost()) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.7, 0.55, 0.8);
      composer.addPass(bloom);
      grade = new THREE.ShaderPass({
        uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.08 }, uLift: { value: new THREE.Vector3(0, 0, 0) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform float uVig; uniform float uSat; uniform vec3 uLift; varying vec2 vUv;',
          'vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }',
          'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; c = toSRGB(max(c, 0.0));',
          ' float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, uSat) + uLift;',
          ' vec2 d = vUv - 0.5; c *= 1.0 - uVig * dot(d, d) * 2.2;',
          ' gl_FragColor = vec4(c, 1.0); }'].join('\n'),
      });
      composer.addPass(grade);
      fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      composer.addPass(fxaa);
      setFxaa();
    }
    buildSky(); buildLights(); buildGround(); buildStands(); buildTowers(); buildBoards(); buildScreens(); buildStumps(); buildBall(); buildFx();
    addEventListener('resize', resize);
    return W;
  }
  function hasPost() { return W.quality !== 'low' && !!(THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass && THREE.ShaderPass && THREE.FXAAShader); }
  function setFxaa() { const pr = renderer.getPixelRatio(); fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr)); }
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    if (composer) { composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth / 2, innerHeight / 2); setFxaa(); }
  }
  function render() { if (composer) composer.render(); else renderer.render(scene, camera); }

  /* ---------- sky, day/night ---------- */
  function buildSky() {
    W.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() }, uDay: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform float uDay; uniform float uTime; varying vec3 vP;',
        'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
        'float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }',
        'float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<5;i++){ s += a*n(p); p *= 2.03; a *= 0.5; } return s; }',
        'void main(){ float y = vP.y; vec3 c = y > 0.1 ? mix(mid, top, smoothstep(0.1, 0.75, y)) : mix(low, mid, smoothstep(-0.05, 0.1, y));',
        ' if (uDay > 0.5 && y > 0.02) { vec2 uv = vP.xz / (y + 0.25) * 1.6 + vec2(uTime * 0.01, 0.0); float cl = smoothstep(0.5, 0.82, fbm(uv)); c = mix(c, vec3(1.0, 1.0, 1.0), cl * 0.85 * smoothstep(0.02, 0.25, y)); }',
        ' gl_FragColor = vec4(c, 1.0); }'].join('\n'),
    });
    W.skySphere = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), W.skyMat); scene.add(W.skySphere);
    const sp = [];
    for (let i = 0; i < 900; i++) { const a = Math.random() * Math.PI * 2, e = 0.2 + Math.random() * 1.25; sp.push(Math.cos(a) * Math.cos(e) * 650, Math.sin(e) * 650, Math.sin(a) * Math.cos(e) * 650); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    W.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xc8d8ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false }));
    scene.add(W.stars);
    // distant city glow / hills ring
    W.skyline = new THREE.Mesh(new THREE.CylinderGeometry(420, 420, 40, 64, 1, true), new THREE.MeshBasicMaterial({ map: canvasTex(2048, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let x = 0; x < w;) { const bw = 8 + Math.random() * 30, bh = 10 + Math.random() * 46; g.fillStyle = '#0a1120'; g.fillRect(x, h - bh, bw, bh); for (let k = 0; k < bw * bh / 60; k++) { g.fillStyle = Math.random() < 0.6 ? 'rgba(255,214,150,.75)' : 'rgba(160,200,255,.6)'; g.fillRect(x + 2 + Math.random() * (bw - 4), h - bh + 2 + Math.random() * (bh - 4), 1.5, 1.5); } x += bw + Math.random() * 6; }
    }), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    W.skyline.material.map.wrapS = THREE.RepeatWrapping; W.skyline.material.map.repeat.x = 3;
    W.skyline.position.y = 18; scene.add(W.skyline);
  }
  function buildLights() {
    W.hemi = new THREE.HemisphereLight(0xa9bdff, 0x1c3a20, 0.55); scene.add(W.hemi);
    W.key = new THREE.DirectionalLight(0xfff0d8, 1.2);
    W.key.castShadow = true;
    Object.assign(W.key.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 20, far: 260 });
    W.key.shadow.mapSize.set(W.quality === 'high' ? 2048 : 1024, W.quality === 'high' ? 2048 : 1024);
    W.key.shadow.bias = -0.0004; W.key.shadow.normalBias = 0.02;
    scene.add(W.key); scene.add(W.key.target);
    W.fill = new THREE.DirectionalLight(0xcfe0ff, 0.5); W.fill.position.set(45, 60, 40); scene.add(W.fill);
    W.fill2 = new THREE.DirectionalLight(0xffe8c8, 0.35); W.fill2.position.set(40, 50, -60); scene.add(W.fill2);
    scene.fog = new THREE.Fog(0x0b1528, 160, 600);
  }
  /* ---------- photographic sky + grass ---------- */
  function loadEnv(base) {
    const jobs = [];
    if (THREE.RGBELoader && W.useHdr) {
      const pm = new THREE.PMREMGenerator(renderer); pm.compileEquirectangularShader();
      W.hdr = {};
      ['day'].forEach(k => jobs.push(new Promise(res => {
        new THREE.RGBELoader().setDataType(THREE.UnsignedByteType).load(base + 'sky-' + k + '.hdr', t => {
          W.hdr[k] = { env: pm.fromEquirectangular(t).texture, bg: t };
          t.mapping = THREE.EquirectangularReflectionMapping; res();
        }, undefined, () => res());
      })));
    }
    jobs.push(new Promise(res => new THREE.TextureLoader().load(base + 'grass.jpg', t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
      const m = W.groundMat, marks = m.map;
      marks.wrapS = marks.wrapT = THREE.ClampToEdgeWrapping;
      m.map = t; m.userData.marks = marks;
      m.onBeforeCompile = sh => {
        sh.uniforms.uMarks = { value: marks };
        sh.vertexShader = 'varying vec2 vRawUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvRawUv = uv;');
        sh.fragmentShader = 'uniform sampler2D uMarks;\nvarying vec2 vRawUv;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          '#include <map_fragment>\nvec4 mk = texture2D(uMarks, vRawUv);\nfloat lum = dot(mk.rgb, vec3(0.333));\n diffuseColor.rgb = diffuseColor.rgb * vec3(0.62, 0.86, 0.5) * (0.55 + lum * 1.25);\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), smoothstep(0.62, 0.8, mk.g - mk.r * 0.2) * step(0.9, mk.a));');
      };
      m.needsUpdate = true; res();
    }, undefined, () => res())));
    return Promise.all(jobs);
  }
  function setTime(mode) {
    const day = mode === 'day';
    W.day = day;
    const u = W.skyMat.uniforms;
    u.uDay.value = day ? 1 : 0;
    u.top.value.copy(lin(day ? 0x2f6fcb : 0x02050d)); u.mid.value.copy(lin(day ? 0x7fb4ea : 0x0d1a36)); u.low.value.copy(lin(day ? 0xd8e8f4 : 0x2b2a4a));
    W.stars.visible = !day;
    const h = W.hdr && W.hdr[day ? 'day' : 'night'];
    scene.environment = (day && h) ? h.env : W.roomEnv;
    W.skyline.material.opacity = day ? 0.0 : 1;
    scene.fog.color.set(day ? 0xc3d8ec : 0x0b1528); scene.fog.near = day ? 260 : 160; scene.fog.far = day ? 900 : 600;
    W.hemi.color.set(day ? 0xe4f0ff : 0xa9bdff); W.hemi.groundColor.set(day ? 0x4e7040 : 0x1c3a20); W.hemi.intensity = day ? 0.8 : 0.55;
    W.key.color.set(day ? 0xfff2dc : 0xfff0d8); W.key.intensity = day ? 2.1 : 1.25;
    W.key.position.set(day ? 55 : -40, day ? 95 : 75, day ? 35 : -30);
    W.fill.intensity = day ? 0.25 : 0.5; W.fill2.intensity = day ? 0.15 : 0.35;
    renderer.toneMappingExposure = day ? 0.95 : 1.05;
    if (bloom) { bloom.strength = day ? 0.18 : 0.7; bloom.threshold = day ? 0.93 : 0.86; bloom.radius = day ? 0.3 : 0.55; }
    if (grade) { grade.uniforms.uVig.value = day ? 0.22 : 0.34; grade.uniforms.uSat.value = day ? 1.1 : 1.06; }
    W.glows.forEach(s => s.visible = !day);
    W.beams.forEach(b => b.visible = !day && W.quality === 'high');
    W.lampMat.color.setScalar(day ? 0.55 : 1);
    W.rimMat.color.set(day ? 0x557088 : 0x8fd8ff);
  }

  /* ---------- ground + pitch ---------- */
  function buildGround() {
    const R = 78, S = 2048, PX = S / (R * 2);
    const tex = canvasTex(S, S, (g, w) => {
      const st = 6.5 * PX;
      for (let i = 0; i * st < w; i++) { g.fillStyle = i % 2 ? '#2f8a3c' : '#287a34'; g.fillRect(i * st, 0, st + 1, w); }
      for (let i = 0; i * st < w; i++) { if (i % 2) { g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(0, i * st, w, st); } }
      for (let i = 0; i < 40000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,20,0' : '170,230,150'},${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * w, 2 + Math.random() * 3, 2); }
      const c = w / 2;
      g.fillStyle = '#3a9446'; g.fillRect(c - 12 * PX, c - 16 * PX, 24 * PX, 32 * PX);
      g.fillStyle = 'rgba(255,255,255,.04)'; for (let i = -5; i < 5; i++) g.fillRect(c + i * 2.4 * PX, c - 16 * PX, 1.2 * PX, 32 * PX);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3.5; g.setLineDash([2.4 * PX, 2.0 * PX]);
      g.beginPath(); g.arc(c, c, 27.4 * PX, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      // painted outfield logos
      g.save(); g.globalAlpha = 0.22; g.fillStyle = '#ffffff'; g.font = `800 ${5 * PX}px "Saira Condensed","Arial Narrow",sans-serif`; g.textAlign = 'center';
      [[0, -42, 0], [0, 42, Math.PI], [42, 0, Math.PI / 2], [-42, 0, -Math.PI / 2]].forEach(([x, y, r]) => { g.save(); g.translate(c + x * PX, c + y * PX); g.rotate(r); g.fillText('FLOODLIGHT SIXES', 0, 0); g.restore(); });
      g.restore();
      const vg = g.createRadialGradient(c, c, 30 * PX, c, c, R * PX); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,15,0,.3)'); g.fillStyle = vg; g.fillRect(0, 0, w, w);
    });
    W.groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, envMapIntensity: 0.3 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R, 160), W.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    // pitch
    const ptex = canvasTex(256, 2080, (g, w, h) => {
      const m = h / 26, cx = w / 2, mx = w / 3.2;
      const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#bda477'); grd.addColorStop(0.5, '#d2bd90'); grd.addColorStop(1, '#bda477');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,70,40' : '250,235,200'},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(110,85,50,.18)'; g.lineWidth = 1; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 20; y += (Math.random() - 0.5) * 20; g.lineTo(x, y); } g.stroke(); }
      [h / 2 - 7.8 * m, h / 2 + 7.8 * m].forEach(y => { const r = g.createRadialGradient(cx, y, 2, cx, y, 3 * m); r.addColorStop(0, 'rgba(120,90,50,.42)'); r.addColorStop(1, 'rgba(120,90,50,0)'); g.fillStyle = r; g.fillRect(0, y - 3.5 * m, w, 7 * m); });
      g.fillStyle = 'rgba(255,255,255,.95)';
      [-1, 1].forEach(sg => {
        const yp = h / 2 + sg * 8.84 * m, yb = h / 2 + sg * 10.06 * m;
        g.fillRect(0, yp - 2.5, w, 5);
        g.fillRect(cx - 1.32 * mx, yb - 2.5, 2.64 * mx, 5);
        [-1.32, 1.32].forEach(x => { const X = cx + x * mx; g.fillRect(X - 2.5, Math.min(yp, h / 2 + sg * 11.3 * m), 5, Math.abs(11.3 - 8.84) * m); });
        [-0.6, 0.6].forEach(x => { g.fillRect(cx + x * mx - 2, Math.min(yp, h / 2 + sg * 9.6 * m) , 4, 0.76 * m); });
      });
    });
    const pitch = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 26), [null, null, new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.95, envMapIntensity: 0.2 }), null, null, null].map(m => m || new THREE.MeshStandardMaterial({ color: 0xa8916a, roughness: 1 })));
    pitch.position.y = 0.0; pitch.receiveShadow = true; scene.add(pitch);
    // boundary cushion
    W.ropeMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, roughness: 0.5, emissive: 0x332200 });
    const rope = new THREE.Mesh(new THREE.TorusGeometry(SIM.BOUNDARY, 0.2, 10, 260), W.ropeMat);
    rope.rotation.x = Math.PI / 2; rope.position.y = 0.16; rope.scale.z = 1.4; rope.castShadow = false; scene.add(rope);
    // perimeter beyond the boards: darker run-off
    const apron = new THREE.Mesh(new THREE.RingGeometry(R - 0.2, 82, 160), new THREE.MeshStandardMaterial({ color: 0x1d4a26, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = 0.01; scene.add(apron);
  }

  /* ---------- stands, crowd ---------- */
  function buildStands() {
    const prof = [], step = (r0, y0, n, dr, dy) => { for (let k = 0; k < n; k++) { prof.push([r0 + k * dr, y0 + k * dy], [r0 + (k + 1) * dr, y0 + k * dy], [r0 + (k + 1) * dr, y0 + (k + 1) * dy]); } };
    prof.push([79.5, -0.5], [79.5, 2.2]);
    step(79.5, 2.2, 9, 1.75, 1.15);                 // lower tier
    prof.push([95.3, 12.6], [95.3, 15.5], [96.5, 15.5]); // concourse wall
    step(96.5, 15.5, 11, 1.6, 1.55);                // upper tier
    prof.push([114.5, 32.6], [116, 40], [116, -1]);
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 160), new THREE.MeshStandardMaterial({ color: 0x252f45, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.2 }));
    bowl.receiveShadow = false; scene.add(bowl);
    // fascia LED ribbons
    W.rimMat = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, toneMapped: false });
    [[79.6, 2.25], [95.4, 14.8]].forEach(([r, y]) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 200, 1, true), W.rimMat); t.position.y = y; t.material.side = THREE.DoubleSide; scene.add(t); });
    // roof canopy with underside lights
    const roofProf = [[108, 38.5], [126, 42.5], [126, 43.2], [108, 39.2]].map(p => new THREE.Vector2(p[0], p[1]));
    const roof = new THREE.Mesh(new THREE.LatheGeometry(roofProf, 160), new THREE.MeshStandardMaterial({ color: 0xc9d2de, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }));
    scene.add(roof);
    const roofEdge = new THREE.Mesh(new THREE.TorusGeometry(108, 0.35, 6, 200), W.rimMat); roofEdge.rotation.x = Math.PI / 2; roofEdge.position.y = 38.7; scene.add(roofEdge);
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 26, 0.8), new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6, metalness: 0.4 })); col.position.set(Math.sin(a) * 116.5, 28, Math.cos(a) * 116.5); scene.add(col); }

    // crowd billboards (people drawn into an atlas)
    W.crowdAtlas = canvasTex(1024, 128, () => {});
    const seats = [];
    const rows = [];
    for (let k = 0; k < 9; k++) rows.push([79.5 + k * 1.75 + 0.95, 2.2 + (k + 1) * 1.15]);
    for (let k = 0; k < 11; k++) rows.push([96.5 + k * 1.6 + 0.85, 15.5 + (k + 1) * 1.55]);
    rows.forEach(([r, y], ri) => {
      const n = Math.floor(Math.PI * 2 * r / 0.62);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (ri % 2) * 0.003;
        const near = Math.min(Math.abs(Math.atan2(Math.sin(a), Math.cos(a))), Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))));
        if (near < (ri < 9 ? 0.13 : 0.11) || Math.random() < 0.1) continue;
        seats.push(Math.sin(a) * r, y + 0.5, Math.cos(a) * r, a);
      }
    });
    const N = seats.length / 4;
    const geo = new THREE.PlaneGeometry(0.62, 1.05);
    const idx = new Float32Array(N);
    for (let i = 0; i < N; i++) idx[i] = Math.floor(Math.random() * 16);
    geo.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1));
    W.crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ map: W.crowdAtlas, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = W.crowdU.uTime; sh.uniforms.uCheer = W.crowdU.uCheer;
      sh.vertexShader = 'uniform float uTime;\nuniform float uCheer;\nattribute float aIdx;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = vec2((uv.x + aIdx) / 16.0, uv.y);\n#endif')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23 + aIdx;\ntransformed.y += 0.03 * sin(uTime * 1.4 + ph) + uCheer * abs(sin(uTime * 8.5 + ph * 3.0)) * 0.55;\ntransformed.x += uCheer * sin(uTime * 4.0 + ph) * 0.05;\n#endif');
    };
    W.crowd = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      q.setFromAxisAngle(up, seats[i * 4 + 3] + Math.PI);
      const s = 0.92 + Math.random() * 0.2; sc.set(s, s, s);
      m4.compose(p.set(seats[i * 4], seats[i * 4 + 1], seats[i * 4 + 2]), q, sc);
      W.crowd.setMatrixAt(i, m4);
    }
    scene.add(W.crowd);
    paintCrowd('#1fb7cc', '#ff6f5e');
    // sightscreens
    [0, Math.PI].forEach(a => { const s = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 0.6), new THREE.MeshStandardMaterial({ color: 0x06080d, roughness: 0.9 })); s.position.set(0, 6, Math.cos(a) * 82); scene.add(s); });
  }
  function paintCrowd(c1, c2) {
    const c = W.crowdAtlas.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const shirts = [c1, c1, c1, c1, c1, c2, c2, c2, c2, '#f2f2f2', '#20232b', '#c23b3b', '#e0b84a', '#3c6fb4', c1, c2];
    const skins = ['#8a5638', '#a8714b', '#6a3f27', '#c69067', '#5a3420', '#d4a07a'];
    for (let i = 0; i < 16; i++) {
      const x0 = i * 64, cx = x0 + 32;
      const sk = skins[i % skins.length];
      g.fillStyle = shirts[i];
      const sw = 25 + (i % 3) * 2;
      g.beginPath(); g.moveTo(cx - sw, 128); g.lineTo(cx - sw, 80); g.quadraticCurveTo(cx - sw, 66, cx - sw + 12, 65); g.lineTo(cx + sw - 12, 65); g.quadraticCurveTo(cx + sw, 66, cx + sw, 80); g.lineTo(cx + sw, 128); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(cx - sw, 112, sw * 2, 16);
      if (i % 3 === 0) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(cx - 24, 92, 48, 6); }
      g.fillStyle = sk; g.beginPath(); g.ellipse(cx, 50, 12, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = i % 4 === 1 ? shirts[(i + 5) % 16] : '#17110d';
      g.beginPath(); g.ellipse(cx, 41, 13, 8, 0, Math.PI, Math.PI * 2); g.fill();
      if (i % 5 === 2) { g.fillStyle = sk; g.save(); g.translate(cx + 20, 70); g.rotate(-0.4); g.fillRect(-4, -36, 8, 38); g.restore(); }
      if (i % 7 === 3) { g.fillStyle = shirts[(i + 3) % 16]; g.fillRect(cx - 30, 4, 22, 14); g.fillStyle = '#ddd'; g.fillRect(cx - 9, 4, 2, 36); }
    }
    W.crowdAtlas.needsUpdate = true;
  }

  /* ---------- floodlight towers ---------- */
  function buildTowers() {
    W.glows = []; W.beams = [];
    const glow = glowTex('rgba(255,252,240,1)', 'rgba(255,220,160,.38)');
    W.lampMat = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = '#1d2027'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 7; x++) { const r = g.createRadialGradient(20 + x * 36, 22 + y * 38, 1, 20 + x * 36, 22 + y * 38, 16); r.addColorStop(0, '#ffffff'); r.addColorStop(0.55, '#fff3d4'); r.addColorStop(1, '#5a4a30'); g.fillStyle = r; g.beginPath(); g.arc(20 + x * 36, 22 + y * 38, 15, 0, 7); g.fill(); }
    }) });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a94a6, roughness: 0.5, metalness: 0.6 });
    [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4].forEach(a => {
      const r = 128, x = Math.sin(a) * r, z = Math.cos(a) * r;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 66, 10), steel); pole.position.set(x, 33, z); scene.add(pole);
      const head = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), W.lampMat); head.position.set(x * 0.985, 68, z * 0.985); head.lookAt(0, 0, 0); scene.add(head);
      const back = new THREE.Mesh(new THREE.BoxGeometry(14.6, 9.6, 0.8), steel); back.position.set(x, 68, z); back.lookAt(0, 0, 0); back.translateZ(-0.5); scene.add(back);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
      sp.scale.set(58, 58, 1); sp.position.set(x * 0.965, 68, z * 0.965); scene.add(sp); W.glows.push(sp);
      const len = Math.hypot(x, z, 68) * 0.9;
      const beamGeo = new THREE.ConeGeometry(28, len, 24, 1, true); beamGeo.translate(0, -len / 2, 0); beamGeo.rotateX(-Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.set(x * 0.96, 68, z * 0.96); beam.lookAt(0, 0, 0); beam.rotateY(Math.PI); scene.add(beam); W.beams.push(beam);
    });
  }

  /* ---------- LED boards ---------- */
  function boardTex(lines, colors, bg) {
    const t = canvasTex(2048, 64, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.font = '800 44px "Saira Condensed","Arial Narrow",sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
      const n = lines.length, seg = w / n;
      lines.forEach((s, i) => { g.fillStyle = colors[i % colors.length]; g.fillText(s, seg * i + seg / 2, h / 2 + 2, seg - 30); });
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
    });
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(-6, 1);
    return t;
  }
  function buildBoards() {
    W.boardTex = {
      idle: boardTex(['FLOODLIGHT SIXES', '•', 'HIT IT INTO THE NIGHT', '•', 'QUICK MATCH T20', '•'], ['#ffe0a0', '#ffffff', '#7fe3ff', '#ffffff', '#ffffff', '#ffffff'], ['#0b1734', '#13285a']),
      four: boardTex(['FOUR', 'FOUR', 'FOUR', 'FOUR'], ['#ffffff'], ['#0a6d9c', '#0b4a78']),
      six: boardTex(['SIX', 'SIX', 'SIX', 'SIX', 'SIX'], ['#2a1d00'], ['#ffd34d', '#f2a51c']),
      out: boardTex(['WICKET', 'WICKET', 'WICKET', 'WICKET'], ['#ffffff'], ['#d42a43', '#8f1427']),
    };
    W.boardMat = new THREE.MeshBasicMaterial({ map: W.boardTex.idle, side: THREE.DoubleSide, toneMapped: false });
    W.boards = new THREE.Mesh(new THREE.CylinderGeometry(65, 65, 1.1, 220, 1, true), W.boardMat);
    W.boards.position.y = 0.55; scene.add(W.boards);
    W.boardMode = 'idle'; W.boardT = 0;
  }
  function boardFlash(mode, dur = 3.2) { W.boardMode = mode; W.boardT = dur; W.boardMat.map = W.boardTex[mode]; W.boardMat.needsUpdate = true; }

  /* ---------- big screens ---------- */
  function buildScreens() {
    W.screenTex = canvasTex(1024, 512, () => {});
    const mat = new THREE.MeshBasicMaterial({ map: W.screenTex, toneMapped: false });
    W.screens = [];
    [0.42, Math.PI + 0.42].forEach(a => {
      const r = 104, x = Math.sin(a) * r, z = Math.cos(a) * r;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(27, 14, 0.5), new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.6, metalness: 0.4 }));
      frame.position.set(x, 47, z); frame.lookAt(0, 30, 0); scene.add(frame);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(25.5, 12.75), mat); scr.position.copy(frame.position); scr.lookAt(0, 30, 0); scr.translateZ(0.9); scene.add(scr);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), frame.material); leg.position.set(x * 1.01, 36, z * 1.01); scene.add(leg);
      W.screens.push(scr);
    });
  }
  function drawScreen(d) {
    const c = W.screenTex.userData.canvas, g = c.getContext('2d'), w = c.width, h = c.height;
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#0b1430'); bg.addColorStop(1, '#16244a');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textBaseline = 'middle';
    if (d.event) {
      const ev = d.event;
      const cols = { SIX: ['#ffd34d', '#f29a12', '#2a1d00'], FOUR: ['#36c6ff', '#0a6d9c', '#ffffff'], OUT: ['#ff4d64', '#8f1427', '#ffffff'], WIN: [d.c1 || '#ffe0a0', '#222', '#ffffff'] }[ev.kind] || ['#fff', '#888', '#000'];
      const eg = g.createLinearGradient(0, 0, 0, h); eg.addColorStop(0, cols[0]); eg.addColorStop(1, cols[1]);
      g.fillStyle = eg; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = -4; i < 14; i++) { g.beginPath(); g.moveTo(i * 90, 0); g.lineTo(i * 90 + 45, 0); g.lineTo(i * 90 - 155, h); g.lineTo(i * 90 - 200, h); g.fill(); }
      g.fillStyle = cols[2]; g.textAlign = 'center';
      g.font = '800 250px "Saira Condensed","Arial Narrow",sans-serif'; g.fillText(ev.text, w / 2, h / 2 - 20, w - 60);
      g.font = '700 54px "Saira Condensed","Arial Narrow",sans-serif'; g.fillText(ev.sub || '', w / 2, h - 60, w - 60);
    } else {
      g.fillStyle = d.c1 || '#1fb7cc'; g.fillRect(0, 0, 18, h);
      g.textAlign = 'left'; g.fillStyle = '#ffffff';
      g.font = '800 70px "Saira Condensed","Arial Narrow",sans-serif'; g.fillText(d.team || 'FLOODLIGHT SIXES', 60, 80, w - 120);
      g.font = '800 200px "Saira Condensed","Arial Narrow",sans-serif'; g.fillText(d.score || '', 60, 250);
      g.font = '600 64px "Saira Condensed","Arial Narrow",sans-serif'; g.fillStyle = '#9fb3d4'; g.fillText(d.overs || '', 620, 270);
      g.fillStyle = '#ffe0a0'; g.font = '700 54px "Saira Condensed","Arial Narrow",sans-serif'; g.fillText(d.line || '', 60, 430, w - 120);
    }
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    W.screenTex.needsUpdate = true;
  }

  /* ---------- stumps with LED bails ---------- */
  function buildStumps() {
    W.stumpMat = new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: 0.4, emissive: 0x000000 });
    W.bailMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, roughness: 0.3, emissive: 0x000000 });
    W.stumps = [];
    [-10.06, 10.06].forEach((zz, e) => {
      const set = [];
      [-0.114, 0, 0.114].forEach(x => {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.71, 10), e === 0 ? W.stumpMat : W.stumpMat.clone());
        st.position.set(x, 0.355, zz); st.castShadow = true; scene.add(st); set.push(st);
      });
      [-0.057, 0.057].forEach(x => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.108, 8), e === 0 ? W.bailMat : W.bailMat.clone());
        b.rotation.z = Math.PI / 2; b.position.set(x, 0.722, zz); scene.add(b); set.push(b);
      });
      W.stumps.push(set);
    });
    W.stumpHome = W.stumps[0].map(m => ({ p: m.position.clone(), r: m.rotation.clone() }));
    W.ledT = 0;
  }
  function resetStumps() {
    W.stumps[0].forEach((m, i) => { m.position.copy(W.stumpHome[i].p); m.rotation.copy(W.stumpHome[i].r); m.userData.v = null; });
    W.ledT = 0; W.stumpMat.emissive.setRGB(0, 0, 0); W.bailMat.emissive.setRGB(0, 0, 0);
  }
  function breakStumps(power) {
    W.stumps[0].forEach((m, i) => {
      const bail = i >= 3;
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * (bail ? 4 : 2), (bail ? 3 : 1.5) + Math.random() * 2.5, -(bail ? 4 : 2.5) * power - Math.random() * 2);
      m.userData.w = new THREE.Vector3(Math.random() * 10, Math.random() * 4, Math.random() * 10);
    });
    W.ledT = 2.4;
  }
  function tickStumps(dt) {
    W.stumps[0].forEach(m => {
      const v = m.userData.v; if (!v) return;
      v.y -= 9.8 * dt; m.position.addScaledVector(v, dt);
      if (m.position.y < 0.03) { m.position.y = 0.03; v.multiplyScalar(0.45); v.y = Math.abs(v.y) * 0.3; m.userData.w.multiplyScalar(0.6); }
      m.rotation.x += m.userData.w.x * dt; m.rotation.y += m.userData.w.y * dt; m.rotation.z += m.userData.w.z * dt;
    });
    if (W.ledT > 0) {
      W.ledT -= dt;
      const on = Math.floor(W.ledT * 10) % 2 === 0;
      const c = on ? [1.4, 0.15, 0.1] : [1.2, 0.8, 0.0];
      W.stumpMat.emissive.setRGB(c[0], c[1], c[2]); W.bailMat.emissive.setRGB(c[0], c[1] * 1.2, c[2]);
      if (W.ledT <= 0) { W.stumpMat.emissive.setRGB(0, 0, 0); W.bailMat.emissive.setRGB(0, 0, 0); }
    }
  }

  /* ---------- ball ---------- */
  function buildBall() {
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8c939c'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      g.strokeStyle = '#7b818a'; g.lineWidth = 1.5; for (let x = 0; x < w; x += 6) { g.beginPath(); g.moveTo(x, h / 2 - 6); g.lineTo(x + 3, h / 2 + 6); g.stroke(); }
    });
    W.ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, emissive: 0x2a2a2a, emissiveMap: tex }));
    W.ball.castShadow = true;
    W.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,255,1)', 'rgba(200,230,255,.3)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    W.ballGlow.scale.set(0.3, 0.3, 1); W.ballGlow.material.opacity = 0.55; W.ball.add(W.ballGlow); scene.add(W.ball);
    const blob = canvasTex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.65)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    W.blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
    W.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), W.blobMat.clone());
    W.ballShadow.rotation.x = -Math.PI / 2; W.ballShadow.position.y = 0.03; scene.add(W.ballShadow);
    W.trailN = 22; W.trailPos = new Float32Array(W.trailN * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(W.trailPos, 3));
    W.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.5, toneMapped: false }));
    W.trail.frustumCulled = false; scene.add(W.trail);
    W.marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    W.marker.rotation.x = -Math.PI / 2; W.marker.position.y = 0.035; W.marker.visible = false; scene.add(W.marker);
    W.markerDot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), W.marker.material); W.markerDot.rotation.x = -Math.PI / 2; W.marker.add(W.markerDot); W.markerDot.rotation.x = 0;
    W.bands = new THREE.Group();
    [[-10.06, -7.86, 0xffc93c], [-7.86, -5.56, 0x9be37a], [-5.56, -2.56, 0x4fd3ff], [-2.56, 2, 0xff5468]].forEach(([a, b, c]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, b - a - 0.06), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, (a + b) / 2); W.bands.add(m);
    });
    W.bands.visible = false; scene.add(W.bands);
    hideBall();
  }
  function hideBall() { W.ball.visible = false; W.ballShadow.visible = false; W.trail.visible = false; }
  function placeBall(p, reset) {
    W.ball.visible = true; W.ballShadow.visible = true; W.trail.visible = true;
    W.ball.position.set(p.x, Math.max(p.y, 0.06), p.z);
    W.ball.rotation.x -= 0.4; W.ball.rotation.z += 0.2;
    W.ballShadow.position.set(p.x, 0.03, p.z);
    W.ballShadow.material.opacity = clamp(1 - p.y / 10, 0.12, 1);
    const tp = W.trailPos;
    if (reset) { for (let i = 0; i < W.trailN; i++) { tp[i * 3] = p.x; tp[i * 3 + 1] = Math.max(p.y, 0.06); tp[i * 3 + 2] = p.z; } }
    else { tp.copyWithin(3, 0, (W.trailN - 1) * 3); tp[0] = p.x; tp[1] = Math.max(p.y, 0.06); tp[2] = p.z; }
    W.trail.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- fireworks + confetti ---------- */
  function buildFx() {
    W.fwN = 1400; W.fwPos = new Float32Array(W.fwN * 3).fill(-999); W.fwVel = new Float32Array(W.fwN * 3); W.fwCol = new Float32Array(W.fwN * 3); W.fwLife = new Float32Array(W.fwN);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(W.fwPos, 3)); fg.setAttribute('color', new THREE.BufferAttribute(W.fwCol, 3));
    W.fw = new THREE.Points(fg, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,.4)') }));
    W.fw.frustumCulled = false; scene.add(W.fw); W.fwNext = 0;
    // confetti
    W.cfN = 600;
    const cg = new THREE.PlaneGeometry(0.35, 0.22);
    W.cf = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), W.cfN);
    W.cf.frustumCulled = false; W.cfData = []; const m = new THREE.Matrix4().makeTranslation(0, -999, 0);
    for (let i = 0; i < W.cfN; i++) { W.cf.setMatrixAt(i, m); W.cf.setColorAt(i, new THREE.Color(1, 1, 1)); W.cfData.push({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }); }
    scene.add(W.cf);
  }
  function fireworks(x, y, z, colors, count = 260) {
    for (let i = 0; i < count; i++) {
      const k = W.fwNext; W.fwNext = (W.fwNext + 1) % W.fwN;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), s = 12 + Math.random() * 10;
      W.fwPos[k * 3] = x; W.fwPos[k * 3 + 1] = y; W.fwPos[k * 3 + 2] = z;
      W.fwVel[k * 3] = Math.sin(ph) * Math.cos(th) * s; W.fwVel[k * 3 + 1] = Math.cos(ph) * s; W.fwVel[k * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
      const c = colors[i % colors.length]; W.fwCol[k * 3] = c.r; W.fwCol[k * 3 + 1] = c.g; W.fwCol[k * 3 + 2] = c.b;
      W.fwLife[k] = 1.6 + Math.random() * 0.9;
    }
  }
  function confetti(colors, center, n = 300) {
    const col = new THREE.Color();
    for (let i = 0, k = 0; i < W.cfN && k < n; i++) {
      const d = W.cfData[i]; if (d.life > 0) continue; k++;
      d.p.set(center.x + (Math.random() - 0.5) * 30, 14 + Math.random() * 12, center.z + (Math.random() - 0.5) * 30);
      d.v.set((Math.random() - 0.5) * 3, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 3);
      d.w.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); d.life = 6 + Math.random() * 3;
      W.cf.setColorAt(i, col.set(colors[k % colors.length]));
    }
    if (W.cf.instanceColor) W.cf.instanceColor.needsUpdate = true;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  function tickFx(dt, t) {
    for (let k = 0; k < W.fwN; k++) {
      if (W.fwLife[k] <= 0) { if (W.fwPos[k * 3 + 1] > -900) W.fwPos[k * 3 + 1] = -999; continue; }
      W.fwLife[k] -= dt; W.fwVel[k * 3 + 1] -= 7 * dt;
      for (let a = 0; a < 3; a++) { W.fwVel[k * 3 + a] *= 0.982; W.fwPos[k * 3 + a] += W.fwVel[k * 3 + a] * dt; }
      if (W.fwLife[k] < 0.6) { W.fwCol[k * 3] *= 0.94; W.fwCol[k * 3 + 1] *= 0.94; W.fwCol[k * 3 + 2] *= 0.94; }
    }
    W.fw.geometry.attributes.position.needsUpdate = true; W.fw.geometry.attributes.color.needsUpdate = true;
    let any = false;
    for (let i = 0; i < W.cfN; i++) {
      const d = W.cfData[i]; if (d.life <= 0) continue; any = true;
      d.life -= dt; d.p.addScaledVector(d.v, dt); d.p.x += Math.sin(t * 2 + i) * dt * 0.8;
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      if (d.p.y < 0.05) { d.p.y = 0.05; d.v.set(0, 0, 0); d.w.set(0, 0, 0); }
      if (d.life <= 0) d.p.y = -999;
      W.cf.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(d.r), _s));
    }
    if (any) W.cf.instanceMatrix.needsUpdate = true;
    // boards
    W.boardMat.map.offset.x = (W.boardMat.map.offset.x + dt * (W.boardMode === 'idle' ? 0.012 : 0.05)) % 1;
    if (W.boardT > 0) { W.boardT -= dt; if (W.boardT <= 0) boardFlash('idle', 0); }
    W.crowdU.uTime.value = t;
    W.crowdU.uCheer.value = Math.max(0, W.crowdU.uCheer.value - dt * 0.3);
    W.skyMat.uniforms.uTime.value = t;
    tickStumps(dt);
  }

  /* ---------- replay recorder ---------- */
  const REC = { objs: [], frames: 0, max: 720, t: null, data: null, head: 0, count: 0, vis: null };
  function recTrack(objs) {
    REC.objs = objs; REC.data = new Float32Array(REC.max * objs.length * 7); REC.t = new Float32Array(REC.max); REC.vis = new Uint8Array(REC.max); REC.head = 0; REC.count = 0;
  }
  function recClear() { REC.head = 0; REC.count = 0; }
  function recCapture(time) {
    const n = REC.objs.length, base = REC.head * n * 7, d = REC.data;
    for (let i = 0; i < n; i++) { const o = REC.objs[i], k = base + i * 7; d[k] = o.position.x; d[k + 1] = o.position.y; d[k + 2] = o.position.z; d[k + 3] = o.quaternion.x; d[k + 4] = o.quaternion.y; d[k + 5] = o.quaternion.z; d[k + 6] = o.quaternion.w; }
    REC.t[REC.head] = time; REC.vis[REC.head] = W.ball.visible ? 1 : 0;
    REC.head = (REC.head + 1) % REC.max; REC.count = Math.min(REC.count + 1, REC.max);
  }
  function recRange() { if (!REC.count) return null; const first = (REC.head - REC.count + REC.max) % REC.max, last = (REC.head - 1 + REC.max) % REC.max; return [REC.t[first], REC.t[last]]; }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function recApply(time) {
    if (!REC.count) return;
    const n = REC.objs.length, d = REC.data;
    let lo = (REC.head - REC.count + REC.max) % REC.max, idx = lo;
    for (let c = 0; c < REC.count - 1; c++) { const nx = (idx + 1) % REC.max; if (REC.t[nx] > time) break; idx = nx; }
    const nx = (idx + 1) % REC.max;
    const span = REC.t[nx] - REC.t[idx];
    const w = span > 0 && REC.t[nx] > REC.t[idx] ? clamp((time - REC.t[idx]) / span, 0, 1) : 0;
    const A = idx * n * 7, B = nx * n * 7;
    for (let i = 0; i < n; i++) {
      const o = REC.objs[i], a = A + i * 7, b = B + i * 7;
      o.position.set(d[a] + (d[b] - d[a]) * w, d[a + 1] + (d[b + 1] - d[a + 1]) * w, d[a + 2] + (d[b + 2] - d[a + 2]) * w);
      qa.set(d[a + 3], d[a + 4], d[a + 5], d[a + 6]); qb.set(d[b + 3], d[b + 4], d[b + 5], d[b + 6]);
      o.quaternion.copy(qa.slerp(qb, w));
    }
    const vis = !!REC.vis[idx];
    W.ball.visible = vis; W.ballShadow.visible = vis; W.trail.visible = false;
    W.ballShadow.position.set(W.ball.position.x, 0.03, W.ball.position.z);
  }

  Object.assign(W, { loadEnv, init, render, resize, setTime, paintCrowd, boardFlash, drawScreen, resetStumps, breakStumps, placeBall, hideBall, fireworks, confetti, tickFx, recTrack, recClear, recCapture, recRange, recApply, canvasTex, hasPost });
  return W;
})();
