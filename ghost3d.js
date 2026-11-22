/* ============================================================
   FALLING GHOST – 3D-Renderer (three.js)
   ------------------------------------------------------------
   Die Spiellogik bleibt 2D (Kollision in der Ebene z=0). Dieser
   Renderer zeichnet die Tinten-Waende als echte 3D-Koerper, die
   von z=0 zum Betrachter hin extrudiert sind, plus Papier-Rueck-
   wand mit Schatten, schwebende Tintentropfen und Lichter.

   Fairness: Die Kamera nutzt eine Off-Axis-Projektion. Die Ebene
   z=0 wird dadurch IMMER pixelgenau auf den Bildschirm abgebildet
   (exakt wie das alte 2D-Bild), egal wo das "Auge" gerade steht.
   Der sichtbare Spaltrand = Kollisionsrand. Nur die Tiefe drumherum
   bewegt sich (Parallaxe).

   Koordinaten: 1 Welteinheit = 1 CSS-Pixel. Spiel-y zeigt nach
   unten, three-y nach oben -> three.y = -spiel.y
   ============================================================ */
import * as THREE from './vendor/three.min.js';

export function createRenderer3D({ stage, images }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'g';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.insertBefore(canvas, stage.firstChild);

  const PAPER = new THREE.Color('#eae2cf');
  const scene = new THREE.Scene();
  scene.background = PAPER.clone();
  scene.fog = new THREE.Fog(PAPER.clone(), 1000, 2000);

  const camera = new THREE.PerspectiveCamera();
  camera.matrixAutoUpdate = true;

  /* ---------------- Texturen ---------------- */
  const TEX = 512;
  const wallCv = document.createElement('canvas'); wallCv.width = wallCv.height = TEX;
  const wctx = wallCv.getContext('2d');
  const wallTex = new THREE.CanvasTexture(wallCv);
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Bump-Map = gleiche Textur, aber linear (Helligkeit = Hoehe der Tintenschlieren)
  const bumpTex = new THREE.CanvasTexture(wallCv);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  let wallKey = '';
  function updateWallTex(f2, f3) {
    const [a, b, c] = images.wall;
    if (!a.complete || !a.naturalWidth) return;
    const key = a.complete + '|' + (b.complete && b.naturalWidth ? f2.toFixed(2) : 'x') + '|' + (c.complete && c.naturalWidth ? f3.toFixed(2) : 'x');
    if (key === wallKey) return;
    wallKey = key;
    wctx.globalAlpha = 1; wctx.drawImage(a, 0, 0, TEX, TEX);
    if (f2 > 0 && b.complete && b.naturalWidth) { wctx.globalAlpha = f2; wctx.drawImage(b, 0, 0, TEX, TEX); }
    if (f3 > 0 && c.complete && c.naturalWidth) { wctx.globalAlpha = f3; wctx.drawImage(c, 0, 0, TEX, TEX); }
    wctx.globalAlpha = 1;
    wallTex.needsUpdate = true; bumpTex.needsUpdate = true;
  }

  let paperTex = null;
  function ensurePaper() {
    if (paperTex || !images.bg.complete || !images.bg.naturalWidth) return;
    paperTex = new THREE.Texture(images.bg);
    paperTex.colorSpace = THREE.SRGBColorSpace;
    paperTex.wrapS = THREE.MirroredRepeatWrapping;
    paperTex.wrapT = THREE.ClampToEdgeWrapping;
    paperTex.needsUpdate = true;
    paperMat.map = paperTex; paperMat.color.set('#ffffff'); paperMat.needsUpdate = true;
  }

  /* ---------------- Materialien ---------------- */
  // Nasse Tinte: dunkle Basis, Klarlack-Glanz, Relief aus der Textur
  const inkMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: wallTex, bumpMap: bumpTex, bumpScale: 2.2,
    emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.38,
    roughness: 0.62, metalness: 0.0, clearcoat: 0.85, clearcoatRoughness: 0.22,
    side: THREE.FrontSide,
  });
  const paperMat = new THREE.MeshBasicMaterial({ color: PAPER, fog: false, toneMapped: false });
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.24, fog: false });
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0d12, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });

  /* ---------------- Lichter ---------------- */
  const hemi = new THREE.HemisphereLight(0xfff4e2, 0x08060a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0008;
  sun.shadow.radius = 6;
  scene.add(sun, sun.target);
  const ghostLight = new THREE.PointLight(0xff2a48, 0, 0, 1.25);
  const nearLight = new THREE.PointLight(0x2a9fe6, 0, 0, 1.25);
  scene.add(ghostLight, nearLight);

  /* ---------------- Papier-Rueckwand ---------------- */
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paperMat);
  const paperShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  paperShadow.receiveShadow = true;
  scene.add(paper, paperShadow);

  /* ---------------- Waende (dynamische Geometrie) ---------------- */
  // Profil quer zur Wandkante: Unterseite (z=0..D-r), runde Lippe (Radius r), Frontflaeche (z=D)
  const BEVEL = 6;
  const K = 2 + BEVEL + 1;           // Punkte pro Spalte (inkl. weit entferntem Frontpunkt)
  const MAXCOL = 900;
  function makeWall() {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(MAXCOL * K * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const nor = new THREE.BufferAttribute(new Float32Array(MAXCOL * K * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const uv = new THREE.BufferAttribute(new Float32Array(MAXCOL * K * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pos); g.setAttribute('normal', nor); g.setAttribute('uv', uv);
    const m = new THREE.Mesh(g, inkMat);
    m.castShadow = true; m.frustumCulled = false;
    scene.add(m);
    return { g, pos, nor, uv, m, cols: 0, side: 0 };
  }
  const wallTop = makeWall(); wallTop.side = -1;
  const wallBot = makeWall(); wallBot.side = 1;
  function setIndex(w, cols, flip) {
    if (w.cols === cols && w.flip === flip) return;
    w.cols = cols; w.flip = flip;
    const idx = [];
    for (let i = 0; i < cols - 1; i++) for (let k = 0; k < K - 1; k++) {
      const a = i * K + k, b = (i + 1) * K + k, c = (i + 1) * K + k + 1, d = i * K + k + 1;
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    w.g.setIndex(idx);
  }

  // Profil (s = Einzug in die Wand, z = Tiefe, ns/nz = Normale)
  const prof = [];
  function buildProfile(D, r) {
    prof.length = 0;
    prof.push({ s: 0, z: 0, ns: 1, nz: 0, len: 0 });
    for (let j = 0; j <= BEVEL; j++) {
      const th = (j / BEVEL) * Math.PI * 0.5;
      prof.push({ s: r - r * Math.cos(th), z: D - r + r * Math.sin(th), ns: Math.cos(th), nz: Math.sin(th) });
    }
    let L = 0;
    for (let k = 1; k < prof.length; k++) { L += Math.hypot(prof[k].s - prof[k - 1].s, prof[k].z - prof[k - 1].z); prof[k].len = L; }
  }

  const ex = new Float32Array(MAXCOL), et = new Float32Array(MAXCOL), eb = new Float32Array(MAXCOL);
  function fillWall(w, cols, scroll, tile, D, yFar) {
    const P = w.pos.array, N = w.nor.array, U = w.uv.array;
    const ys = w.side < 0 ? et : eb;
    const nP = prof.length, sg = w.side < 0 ? -1 : 1;
    for (let i = 0; i < cols; i++) {
      const x = ex[i], y = ys[i];
      const i0 = Math.max(0, i - 1), i1 = Math.min(cols - 1, i + 1);
      let tx = ex[i1] - ex[i0], ty = ys[i1] - ys[i0];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      // Normale in den Spalt hinein (Spielkoordinaten)
      let nx, ny;
      if (w.side < 0) { nx = -ty; ny = tx; } else { nx = ty; ny = -tx; }
      let o = i * K;
      for (let k = 0; k < nP; k++, o++) {
        const p = prof[k];
        const gx = x - nx * p.s, gy = y - ny * p.s;
        P[o * 3] = gx; P[o * 3 + 1] = -gy; P[o * 3 + 2] = p.z;
        const cx = nx * p.ns, cy = -ny * p.ns, cz = p.nz;
        N[o * 3] = cx; N[o * 3 + 1] = cy; N[o * 3 + 2] = cz;
        U[o * 2] = (gx + scroll) / tile; U[o * 2 + 1] = (y + sg * p.len) / tile;   // weltverankert -> keine Verzerrung
      }
      // Frontflaeche bis weit ausserhalb des Bildes
      const last = prof[nP - 1];
      const fy = yFar;
      const lx = x - nx * last.s;
      P[o * 3] = lx; P[o * 3 + 1] = -fy; P[o * 3 + 2] = D;
      N[o * 3] = 0; N[o * 3 + 1] = 0; N[o * 3 + 2] = 1;
      U[o * 2] = (lx + scroll) / tile; U[o * 2 + 1] = (y + sg * last.len + (fy - (y - ny * last.s))) / tile;
    }
    w.pos.needsUpdate = true; w.nor.needsUpdate = true; w.uv.needsUpdate = true;
    w.g.setDrawRange(0, (cols - 1) * (K - 1) * 6);
    setIndex(w, cols, w.side > 0);
  }

  /* ---------------- Schwebende Tintentropfen (Tiefe/Parallaxe) ---------------- */
  const NDROP = 22;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), dropMat, NDROP);
  drops.castShadow = false;
  drops.frustumCulled = false;
  scene.add(drops);
  const dropData = [];
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dummy = new THREE.Object3D();

  /* ---------------- Groesse / Qualitaet ---------------- */
  let W = 1, H = 1, dpr = 1, maxDpr = 2, frameAvg = 16, lastT = 0, lowCount = 0;
  function setSize(w, h, d) {
    W = w; H = h; maxDpr = Math.min(d || 1, 2); dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    dropData.length = 0;
    for (let i = 0; i < NDROP; i++) dropData.push(newDrop(true));
  }
  function newDrop(anywhere) {
    const depth = 0.12 + rand() * 0.85;                 // 0 = Spielebene, 1 = Papier
    return {
      x: anywhere ? -0.5 * W + rand() * 2.2 * W : 1.6 * W + rand() * 0.6 * W,
      y: rand() * H, depth, r: (2.5 + rand() * 8) * (H / 800), ph: rand() * 6.28, sq: 0.75 + rand() * 0.5,
    };
  }
  // Adaptive Qualitaet: bei dauerhaft langsamen Frames Aufloesung senken
  function adapt(now) {
    if (lastT) { const dt = Math.min(100, now - lastT); frameAvg += (dt - frameAvg) * 0.05; }
    lastT = now;
    if (frameAvg > 24 && dpr > 1) { if (++lowCount > 90) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); lowCount = 0; } }
    else lowCount = 0;
  }

  /* ---------------- Render ---------------- */
  let lastScroll = null, time = 0;
  function render(v) {
    const now = performance.now();
    adapt(now);
    time += 1 / 60;
    const S = H / 800;
    updateWallTex(v.fade2 || 0, v.fade3 || 0);
    ensurePaper();

    // Kamera: Abstand so, dass die Szene natuerlich wirkt (~48 Grad vertikal)
    const dist = H * 1.12;
    const D = H * 0.19;                       // Wandtiefe (zum Betrachter hin)
    const r = Math.min(D * 0.45, 14 * S);     // Lippenradius
    const back = dist * 0.42;                 // Abstand Papier hinter der Spielebene
    buildProfile(D, r);

    // sichtbares Rechteck der Spielebene (inkl. Shake/Kamerafuehrung aus dem Spiel)
    const xL = -v.tx, xR = W - v.tx, yT = v.ty, yB = -(H - v.ty);
    // Auge: leicht links, folgt der Flugbahn vertikal -> lebendige Parallaxe
    const eyeX = (xL + xR) * 0.5 - W * 0.16 + Math.sin(time * 0.23) * W * 0.03;
    const eyeY = (yT + yB) * 0.5 + Math.max(-0.16 * H, Math.min(0.16 * H, -(v.vy || 0) * 9 * S)) + H * 0.04;
    camera.position.set(eyeX, eyeY, dist);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    const near = 5, far = dist + back + 400;
    const k = near / dist;
    camera.projectionMatrix.makePerspective((xL - eyeX) * k, (xR - eyeX) * k, (yT - eyeY) * k, (yB - eyeY) * k, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    scene.fog.near = dist + 20; scene.fog.far = dist + back * 1.35;

    // Papier hinten, gross genug fuer den Kegel
    const sc = (dist + back) / dist;
    const pw = W * sc * 1.6 + 200, ph = H * sc * 1.6 + 200;
    const pcx = W * 0.5 - v.tx, pcy = -H * 0.5 + v.ty;
    paper.position.set(pcx, pcy, -back); paper.scale.set(pw, ph, 1);
    paperShadow.position.set(pcx, pcy, -back + 0.5); paperShadow.scale.set(pw, ph, 1);
    if (paperTex) {
      const img = images.bg, dW = ph * (img.naturalWidth / img.naturalHeight);
      paperTex.repeat.set(pw / dW, 1);
      paperTex.offset.set(((v.scroll * 0.42) / dW) % 2, 0);
    }

    // Sonne (Schattenwurf von oben links vorne auf das Papier)
    sun.position.set(pcx - W * 0.4, pcy + H * 1.1, dist * 0.45);
    sun.target.position.set(pcx, pcy, -back);
    const sc2 = sun.shadow.camera;
    const ext = Math.max(pw, ph) * 0.6;
    sc2.left = -ext; sc2.right = ext; sc2.top = ext; sc2.bottom = -ext; sc2.near = 10; sc2.far = dist * 3; sc2.updateProjectionMatrix();

    // Waende: Spalten ueber den sichtbaren Bereich (+Rand)
    const step = Math.max(3, Math.round(4 * Math.max(1, W / 520)));
    const x0 = xL - 24, x1 = xR + 24;
    let cols = 0;
    for (let x = x0; x <= x1 && cols < MAXCOL; x += step, cols++) {
      const e = v.edgeFn(v.scroll + (x - v.refX));
      ex[cols] = x; et[cols] = e.t; eb[cols] = e.b;
    }
    const tile = 240;
    fillWall(wallTop, cols, v.scroll, tile, D, -v.ty - H * 0.7);
    fillWall(wallBot, cols, v.scroll, tile, D, H - v.ty + H * 0.7);

    // Geisterlicht: rote Tinte leuchtet die Waende von innen an
    const gx = v.ghostX, gy = -v.ghostY;
    const on = v.menu ? 0.7 : (v.dead ? 0.2 : 1);
    ghostLight.position.set(gx, gy, D * 0.55);
    ghostLight.intensity = (520 + (v.held ? 160 : 0) + Math.sin(time * 5) * 30) * on * S;
    nearLight.position.set(gx + 10 * S, gy, D * 0.4);
    nearLight.intensity = Math.max(0, (v.nearGlow || 0) - 0.2) * 1400 * S;

    // Tropfen: driften mit der Welt; Perspektive erzeugt automatisch Parallaxe
    const dS = lastScroll == null ? 0 : Math.max(-50, Math.min(50, v.scroll - lastScroll));
    lastScroll = v.scroll;
    for (let i = 0; i < NDROP; i++) {
      const d = dropData[i];
      d.x -= dS * (0.55 + 0.45 * (1 - d.depth));
      if (d.x < xL - W * 0.8) dropData[i] = newDrop(false), dropData[i].x += xL;
      const z = -back * d.depth * 0.92;
      const yy = d.y + Math.sin(time * 0.8 + d.ph) * 6 * S;
      dummy.position.set(d.x, -yy, z);
      const st = 1 + Math.min(0.6, Math.abs(dS) * 0.04);
      dummy.scale.set(d.r * st, d.r * d.sq, d.r);
      dummy.rotation.set(0, 0, Math.sin(time * 0.5 + d.ph) * 0.3);
      dummy.updateMatrix();
      drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  }

  function setVisible(on) { canvas.style.display = on ? 'block' : 'none'; }
  function dispose() { renderer.dispose(); canvas.remove(); }

  return { setSize, render, setVisible, dispose, canvas };
}
