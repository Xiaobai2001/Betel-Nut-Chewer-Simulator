// Generated from src/immersive-scene.js. Do not edit.
module.exports=function(THREE,platform){
const document={createElement:platform.createCanvas};
const performance={now:platform.now};
const devicePixelRatio=platform.pixelRatio;
const matchMedia=()=>({matches:platform.reduced});


const random = n => { const a = Math.sin(n * 127.1 + 31.7) * 43758.5453; return a - Math.floor(a); };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const canvasTexture = (width, height, draw) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

class ImmersiveScene {
  constructor(host, state, flatVisuals, announce) {
    this.host = host; this.state = state; this.flat = flatVisuals; this.announce = announce;
    this.smokePosition = null; this.smokeBounds = null;
    this.zoom = 1; this.yaw = -.3; this.pitch = .2;
    this.host.dataset.sceneView = 'first';
    this.lastChew = -10000; this.lastInhale = -10000; this.lastExhale = -10000;
    this.lastTime = 0; this.flights = []; this.smokeParticles = []; this.fallbackFlights = [];
    this.emission = 0; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.width = 0; this.height = 0; this.pointer = null; this.active = false;
    this.newCanvas();
    try { this.init3D(); this.host.dataset.renderer = 'webgl'; }
    catch (error) { this.enableFallback(); }
    this.bindPointer();
  }
  newCanvas() {
    this.canvas = document.createElement('canvas'); this.canvas.id = 'immersive-canvas'; this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '三维场景。拖动槟榔旋转，拖动香烟移动；滚轮缩放槟榔，方向键旋转，R 复位。');
    this.canvas.setAttribute('role', 'img'); this.host.replaceChildren(this.canvas);
  }
  enableFallback() {
    this.fallback = true; this.renderer?.dispose(); this.renderer = null;
    this.newCanvas(); this.ctx = this.canvas.getContext('2d');
    this.host.dataset.renderer = 'canvas';
    this.announce('当前设备使用兼容画面，咀嚼、旋转和吐渣仍可使用。');
  }
  bindPointer() {
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointer) return;
      const rect = this.canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top, box = this.smokeBounds;
      const smoke = box && x >= box.x - 18 && x <= box.x + box.width + 18 && y >= box.y - 18 && y <= box.y + box.height + 18;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, smoke };
      this.host.dataset.dragTarget = smoke ? 'cigarette' : 'nut';
      this.canvas.setPointerCapture(event.pointerId); this.canvas.classList.add('dragging');
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const dx = event.clientX - this.pointer.x, dy = event.clientY - this.pointer.y;
      if (this.pointer.smoke) {
        const position = this.smokePosition || this.defaultSmokePosition();
        this.smokePosition = { x: clamp(position.x + dx / this.host.clientWidth, .16, .84), y: clamp(position.y + dy / this.host.clientHeight, .18, .80) };
        this.host.dataset.smokePosition = JSON.stringify(this.smokePosition);
      } else this.rotate(dx * .009, dy * .008);
      this.pointer.x = event.clientX; this.pointer.y = event.clientY;
    });
    const release = () => { this.host.dataset.dragTarget = ''; this.pointer = null; this.canvas.classList.remove('dragging'); };
    this.canvas.addEventListener('pointerup', release); this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('lostpointercapture', release);
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault(); this.setZoom(this.zoom - event.deltaY * .001);
      this.host.dispatchEvent(new CustomEvent('scenezoom', { detail: this.zoom }));
    }, { passive: false });
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.enableFallback(); this.bindPointer();
    });
  }
  rotate(yaw, pitch) {
    this.yaw += yaw; this.pitch = clamp(this.pitch + pitch, -Math.PI, Math.PI);
    this.host.dataset.rotation = `${this.yaw.toFixed(3)},${this.pitch.toFixed(3)}`;
  }
  setZoom(value) { this.zoom = clamp(Number(value) || 1, .65, 1.8); }
  resetRotation() { this.smokePosition = null; this.host.dataset.smokePosition = ''; this.yaw = -.3; this.pitch = .2; this.setZoom(1); this.host.dataset.rotation = '-0.300,0.200'; }
  defaultSmokePosition() { return { x: this.host.clientWidth / this.host.clientHeight < 1 ? .76 : .78, y: .66 }; }
  screenPoint(x, y, z) {
    const point = new THREE.Vector3(x * 2 - 1, 1 - y * 2, .5).unproject(this.camera);
    const direction = point.sub(this.camera.position);
    return direction.multiplyScalar((z - this.camera.position.z) / direction.z).add(this.camera.position);
  }
  publishSmokeBounds(box) { this.smokeBounds = box; this.host.dataset.cigaretteBounds = JSON.stringify(box); }
  measureCigarette() {
    this.cigarette.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.cigarette), points = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(this.camera); points.push({ x: (p.x + 1) * this.width / 2, y: (1 - p.y) * this.height / 2 });
    }
    const left = Math.min(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y));
    this.publishSmokeBounds({ x: left, y: top, width: Math.max(...points.map(p => p.x)) - left, height: Math.max(...points.map(p => p.y)) - top });
  }
  init3D() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    this.renderer.setClearColor(0xf7f8f4, 1);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xf7f8f4); this.scene.fog = new THREE.FogExp2(0xf7f8f4, .075);
    this.camera = new THREE.PerspectiveCamera(43, 1, .1, 60);
    this.scene.add(new THREE.HemisphereLight(0xf1f4e9, 0xe0dfd8, 2.3));
    const key = new THREE.DirectionalLight(0xfff5e4, 2.7); key.position.set(-3, 6, 5);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7;
    key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; key.shadow.bias = -.001; key.shadow.intensity = .22; this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe9f0e4, 1.4); rim.position.set(4, 2, -4); this.scene.add(rim);
    const texture = canvasTexture(1024, 512, (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#72502e'); gradient.addColorStop(.45, '#b58a52'); gradient.addColorStop(1, '#674026');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2800; i++) {
        const y = random(i + 4) * h; const x = random(i + 9000) * w;
        ctx.strokeStyle = i % 3 ? `rgba(45,24,11,${.1 + random(i) * .5})` : `rgba(242,206,139,${.12 + random(i) * .4})`;
        ctx.lineWidth = .4 + random(i + 600) * 2.5; ctx.beginPath(); ctx.moveTo(x - 70, y);
        ctx.bezierCurveTo(x + 20, y - 7, x + 90, y + 12, x + 210, y - 5); ctx.stroke();
      }
      for (let i = 0; i < 7000; i++) { ctx.fillStyle = i % 2 ? '#36201544' : '#ecd29c44'; ctx.fillRect(random(i + 80) * w, random(i + 500) * h, 1 + random(i) * 2, 1); }
    });
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.nutTexture = texture;
    this.nutGeometry = new THREE.SphereGeometry(1, 80, 48);
    const positions = this.nutGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const noise = 1 + .025 * Math.sin(x * 37 + y * 19) * Math.cos(z * 31 - y * 22);
      const groove = Math.exp(-Math.pow(y / .10, 2)) * Math.max(0, z) * .15;
      positions.setXYZ(i, x * 1.11 * noise, y * .48 * noise, z * .55 * noise - groove);
    }
    this.nutGeometry.computeVertexNormals();
    const fiberPoints = [];
    for (let i = 0; i < 95; i++) {
      const angle = random(i + 30) * Math.PI * 2; const start = new THREE.Vector3(Math.cos(angle) * .89, Math.sin(angle) * .28, (random(i + 3) - .5) * .65);
      const end = start.clone().multiplyScalar(1.35 + random(i + 22) * .4);
      end.y += (random(i + 94) - .5) * .25;
      const curve = new THREE.QuadraticBezierCurve3(start, start.clone().lerp(end, .5).add(new THREE.Vector3(.06, .1, .08)), end);
      const samples = curve.getPoints(7); for (let j = 0; j < samples.length - 1; j++) fiberPoints.push(samples[j], samples[j + 1]);
    }
    this.fiberGeometry = new THREE.BufferGeometry().setFromPoints(fiberPoints);
    this.nut = this.createNut(); this.scene.add(this.nut);
    this.makeCigarette(); this.makeFloor();
    this.fragmentGeometry = new THREE.SphereGeometry(1, 7, 5);
    this.fragmentMaterial = new THREE.MeshStandardMaterial({ color: 0x79502e, roughness: .75 });
    this.dropMaterial = new THREE.MeshStandardMaterial({ color: 0x956a3e, roughness: .3, transparent: true, opacity: .6 });
    this.smokeMap = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(230,237,231,.7)'); g.addColorStop(.3, 'rgba(219,229,222,.3)'); g.addColorStop(1, 'rgba(210,224,214,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  }
  createNut(wear = 0, fiberAmount = 0) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ map: this.nutTexture, bumpMap: this.nutTexture, bumpScale: .045, color: 0xffffff, roughness: .86 });
    const mesh = new THREE.Mesh(this.nutGeometry, material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xb88b54, transparent: true, opacity: 0 });
    const fibers = new THREE.LineSegments(this.fiberGeometry, lineMaterial); group.add(fibers);
    group.userData.body = mesh; group.userData.fibers = fibers; this.updateNut(group, wear, fiberAmount);
    return group;
  }
  updateNut(group, wear, fibers) {
    const progress = wear / 100;
    group.userData.body.scale.set(1 + progress * .24, 1 - progress * .62, 1 - progress * .25);
    group.userData.body.material.color.setRGB(1 - progress * .40, 1 - progress * .45, 1 - progress * .43);
    group.userData.fibers.scale.set(1 + progress * .24, .8 - progress * .2, 1);
    group.userData.fibers.material.opacity = progress * .8 + fibers / 500;
    group.userData.fibers.visible = progress > .05;
  }
  makeFloor() {
    const texture = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#eceee7'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 30000; i++) { ctx.fillStyle = i % 2 ? '#ffffff18' : '#8d9a7a08'; ctx.fillRect(random(i + 40) * w, random(i + 8000) * h, 1.3, 1); }
      ctx.strokeStyle = '#b4bba608'; ctx.strokeRect(0, 0, w, h);
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(10, 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: .96 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.45; ground.receiveShadow = true; this.scene.add(ground);
  }
  makeCigarette() {
    this.cigarette = new THREE.Group();
    const cylinder = new THREE.CylinderGeometry(.075, .075, 1, 28); cylinder.rotateZ(Math.PI / 2);
    this.paper = new THREE.Mesh(cylinder, new THREE.MeshStandardMaterial({ color: 0xebe9db, roughness: .9 }));
    const filterMap = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#d1a16a'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = '#7d502733'; ctx.fillRect(random(i) * w, random(i + 6) * h, 1.5, 1.5); }
    });
    this.filter = new THREE.Mesh(cylinder, new THREE.MeshStandardMaterial({ map: filterMap, roughness: .85 })); this.filter.scale.x = .55; this.filter.position.x = .8;
    this.ash = new THREE.Mesh(cylinder, new THREE.MeshStandardMaterial({ color: 0x77716b, roughness: 1 })); this.ash.scale.x = .09;
    this.ember = new THREE.Mesh(cylinder, new THREE.MeshStandardMaterial({ color: 0xcc6630, emissive: 0xe95c16, emissiveIntensity: .8, roughness: .95 })); this.ember.scale.x = .025;
    this.emberLight = new THREE.PointLight(0xff8b38, .4, 1.5);
    this.cigarette.add(this.paper, this.filter, this.ash, this.ember, this.emberLight);
    this.cigarette.rotation.set(.12, -.38, .35); this.scene.add(this.cigarette);
  }
  chew() { this.lastChew = performance.now(); }
  inhale() { this.lastInhale = performance.now(); }
  exhale() {
    this.lastExhale = performance.now();
    if (!this.active || this.fallback) return;
    for (let i = 0; i < 46; i++) {
      const position = new THREE.Vector3((random(i + 1) - .5) * .15, -.15 + random(i) * .1, 3.3);
      this.addSmoke(position, new THREE.Vector3((random(i + 3) - .5) * .7, .13 + random(i) * .32, -1.6 - random(i + 20)), true, i * -.012);
    }
  }
  addSmoke(position, velocity, exhale, age = 0) {
    if (this.smokeParticles.length >= 150) { const old = this.smokeParticles.shift(); this.scene.remove(old.mesh); old.mesh.material.dispose(); }
    const material = new THREE.SpriteMaterial({ map: this.smokeMap, transparent: true, opacity: 0, depthWrite: false, color: 0x7b8477, rotation: random(this.smokeParticles.length) * 5 });
    const mesh = new THREE.Sprite(material); mesh.position.copy(position); this.scene.add(mesh);
    this.smokeParticles.push({ mesh, velocity, age, exhale });
  }
  spit(whole, nut) {
    if (!this.active) return;
    if (this.fallback) {
      for (let i = 0; i < (whole ? 12 : 30); i++) this.fallbackFlights.push({ time: performance.now(), x: random(i + this.fallbackFlights.length), whole: whole && i === 0, nut: { ...nut } });
      this.fallbackFlights = this.fallbackFlights.slice(-100); return;
    }
    const count = whole ? 16 : 35;
    for (let i = 0; i < count; i++) {
      const seed = i + this.flights.length * 51;
      const isNut = whole && i === 0;
      const object = isNut ? this.createNut(nut.wear, nut.fibers) : new THREE.Mesh(this.fragmentGeometry, i % 4 === 0 ? this.dropMaterial : this.fragmentMaterial);
      if (isNut) object.scale.setScalar(.50);
      else { const size = .025 + random(seed) * .045; object.scale.set(size * (i % 4 ? 2.2 : 1), size * .65, size); }
      object.position.set((random(seed + 4) - .5) * .12, .25 + random(seed + 10) * .15, 2.5);
      const velocity = new THREE.Vector3((random(seed + 5) - .5) * 2.0, 1 + random(seed + 34) * .8, -3.2 - random(seed + 53) * 2.4);
      this.scene.add(object); this.flights.push({ object, velocity, age: 0, bounce: 0, isNut, landed: false, spin: random(seed + 9) * 5 });
    }
    while (this.flights.length > 110) this.removeFlight(this.flights.shift());
  }
  removeFlight(flight) {
    this.scene.remove(flight.object);
    if (flight.isNut) { flight.object.userData.body.material.dispose(); flight.object.userData.fibers.material.dispose(); }
  }
  clearFloor() {
    for (const flight of this.flights) this.removeFlight(flight);
    this.flights = []; this.fallbackFlights = [];
  }
  tickParticles(dt) {
    for (const flight of this.flights) {
      flight.age += dt;
      if (!flight.landed) {
        flight.velocity.y -= 5.2 * dt; flight.object.position.addScaledVector(flight.velocity, dt);
        flight.object.rotation.x += dt * flight.spin; flight.object.rotation.z += dt * 2;
        if (flight.object.position.y < -1.40) {
          flight.object.position.y = -1.40;
          if (flight.bounce++ < 1 && flight.isNut) { flight.velocity.y *= -.22; flight.velocity.x *= .5; flight.velocity.z *= .45; }
          else { flight.landed = true; flight.object.rotation.x = 0; if (!flight.isNut) flight.object.scale.y *= .4; }
        }
      }
    }
    this.host.dataset.landed = String(this.flights.filter(p => p.landed).length);
    this.host.dataset.airborne = String(this.flights.filter(p => !p.landed).length);
    this.smokeParticles = this.smokeParticles.filter(p => {
      p.age += dt;
      if (p.age > (p.exhale ? 4.4 : 3)) { this.scene.remove(p.mesh); p.mesh.material.dispose(); return false; }
      if (p.age < 0) return true;
      p.mesh.position.addScaledVector(p.velocity, dt); p.velocity.x += Math.sin(p.age * 2) * dt * .035;
      const size = p.exhale ? .16 + p.age * .7 : .04 + p.age * .15; p.mesh.scale.setScalar(size);
      p.mesh.material.opacity = (p.exhale ? .2 : .22) * Math.min(1, p.age * 4) * Math.max(0, 1 - p.age / (p.exhale ? 4.4 : 3));
      return true;
    });
  }
  render(now) {
    const dt = this.lastTime ? Math.min(.05, (now - this.lastTime) / 1000) : 0; this.lastTime = now;
    if (this.fallback) { this.renderFallback(now); return; }
    const width = Math.round(this.host.clientWidth), height = Math.round(this.host.clientHeight);
    if (!width || !height) return;
    if (width !== this.width || height !== this.height) { this.width = width; this.height = height; this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
    const small = width / height < 1;
    const time = (now - this.lastChew) / 500;
    const bite = time > 0 && time < 1 ? Math.sin(time * Math.PI) : 0;
    this.camera.position.set(0, 1.25, small ? 7.5 : 6.5); this.camera.lookAt(0, -.05, 0);
    if (!this.reduced) this.camera.position.y += bite * .035;
    this.camera.updateMatrixWorld();
    const unit = Math.abs(this.screenPoint(.5, 0, .7).y - this.screenPoint(.5, 1, .7).y) / height;
    const nutScale = Math.min(height * .49, width * .48) * unit / 2.22;
    this.nut.visible = !!this.state.nut;
    if (this.state.nut) {
      this.updateNut(this.nut, this.state.nut.wear, this.state.nut.fibers);
      this.nut.position.copy(this.screenPoint(small ? .36 : .40, small ? .36 : .42, .7)); this.nut.position.y -= bite * .05;
      this.nut.rotation.set(this.pitch, this.yaw, -.12 + (this.reduced ? 0 : Math.sin(now / 3200) * .015));
      this.nut.scale.set(nutScale * this.zoom * (1 + bite * .05), nutScale * this.zoom * (1 - bite * .16), nutScale * this.zoom);
    }
    const c = this.state.cigarette;
    const hold = c.holding ? .6 : 0; const inhaleAge = now - this.lastInhale;
    const lift = inhaleAge < 900 ? Math.sin(inhaleAge / 900 * Math.PI) * .3 : 0;
    const smokePosition = this.smokePosition || this.defaultSmokePosition();
    this.cigarette.position.copy(this.screenPoint(smokePosition.x, smokePosition.y, 1.3));
    if (!this.reduced && !this.pointer?.smoke) this.cigarette.position.y += lift * .15;
    this.cigarette.rotation.y = -.5 - hold; this.cigarette.rotation.z = .32;
    const smokeUnit = Math.abs(this.screenPoint(.5, 0, 1.3).y - this.screenPoint(.5, 1, 1.3).y) / height;
    this.cigarette.scale.setScalar(Math.min(height * .44, width * .27) * smokeUnit / 2);
    const length = 1.45 * (1 - c.used) + .03;
    this.paper.scale.x = length; this.paper.position.x = .51 - length / 2;
    const tip = .51 - length;
    this.ash.position.x = tip; this.ash.visible = c.used > .01 || c.lit;
    this.ember.position.x = tip + .045; this.ember.visible = c.lit;
    this.emberLight.position.set(tip, 0, 0); this.emberLight.intensity = c.lit ? .35 + (c.holding ? 1.0 : 0) : 0;
    this.ember.material.emissiveIntensity = c.holding ? 2.6 : .7;
    if (c.lit) {
      this.emission += dt;
      if (this.emission > .095) {
        this.emission = 0; this.cigarette.updateMatrixWorld(); const position = this.cigarette.localToWorld(new THREE.Vector3(tip, .07, 0));
        this.addSmoke(position, new THREE.Vector3(-.08, .26, -.12), false);
      }
    }
    this.measureCigarette(); this.tickParticles(dt); this.renderer.render(this.scene, this.camera);
  }
  renderFallback(now) {
    const width = this.host.clientWidth, height = this.host.clientHeight, ratio = Math.min(devicePixelRatio || 1, 1.5);
    if (!width || !height) return;
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) { this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio); }
    const ctx = this.ctx; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const small = width / height < 1, cx = width * (small ? .36 : .40), cy = height * (small ? .36 : .42), scale = Math.min(width / 470, height / 390);
    const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, width * .65); gradient.addColorStop(0, '#eaf0df80'); gradient.addColorStop(1, '#f7f8f400'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const biteAge = (now - this.lastChew) / 500; const bite = biteAge > 0 && biteAge < 1 ? Math.sin(biteAge * Math.PI) : 0;
    if (this.state.nut) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, .4 + Math.abs(Math.cos(this.pitch)) * .6);
      this.flat.nut(ctx, 0, 0, this.state.nut, Math.min(height * .49, width * .48) / 180 * this.zoom, bite, this.yaw); ctx.restore();
    }
    const c = this.state.cigarette, position = this.smokePosition || this.defaultSmokePosition(), cigX = width * position.x, cigY = height * position.y;
    const smokeScale = Math.min(height * .44, width * .27) / 142;
    const corners = [];
    for (const x of [-100 + c.used * 95, 42]) for (const y of [-6, 7]) corners.push({ x: cigX + (x * Math.cos(.25) - y * Math.sin(.25)) * smokeScale, y: cigY + (x * Math.sin(.25) + y * Math.cos(.25)) * smokeScale });
    const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
    this.publishSmokeBounds({ x: left, y: top, width: Math.max(...corners.map(p => p.x)) - left, height: Math.max(...corners.map(p => p.y)) - top });
    ctx.save(); ctx.translate(cigX, cigY); ctx.rotate(.25); ctx.scale(smokeScale, smokeScale);
    ctx.fillStyle = '#e6e3d5'; ctx.fillRect(-100 + c.used * 95, -6, 105 - c.used * 95, 13); ctx.fillStyle = '#cda372'; ctx.fillRect(5, -6, 37, 13);
    if (c.lit) { ctx.fillStyle = '#ed9251'; ctx.shadowBlur = 12; ctx.shadowColor = '#ff9e4f'; ctx.fillRect(-100 + c.used * 95, -6, 4, 13); }
    ctx.restore();
    const smokeAge = (now - this.lastExhale) / 1000;
    if (smokeAge < 4) { ctx.save(); ctx.globalAlpha = Math.max(0, .18 * (1 - smokeAge / 4)); ctx.fillStyle = '#939d88'; ctx.beginPath(); ctx.ellipse(cx, cy - smokeAge * 35, 30 + smokeAge * 60, 20 + smokeAge * 40, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    let landed = 0, airborne = 0;
    for (const p of this.fallbackFlights) {
      const t = Math.min(1.3, (now - p.time) / 1000), x = cx + (p.x - .5) * width * .5 * t, y = cy - Math.sin(t / 1.3 * Math.PI) * 100 + t / 1.3 * height * .32;
      const s = Math.max(.08, 1 - t * .6); if (t >= 1.3) landed++; else airborne++;
      if (p.whole) this.flat.nut(ctx, x, y, p.nut, s * scale * .5, 0, t * 4);
      else { ctx.fillStyle = '#a27c4e'; ctx.beginPath(); ctx.ellipse(x, y, 6 * s, 2 * s, p.x * 9, 0, Math.PI * 2); ctx.fill(); }
    }
    this.host.dataset.landed = String(landed); this.host.dataset.airborne = String(airborne);
  }
}
return ImmersiveScene;

};
