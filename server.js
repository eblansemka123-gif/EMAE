const http = require('http');
const WebSocket = require('ws');

// ============ HTML КЛИЕНТ (ПОЛНОСТЬЮ ВНУТРИ) ============
const HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Elite Voxel V4 | MP Combat</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; -webkit-tap-highlight-color: transparent; }
        body { width: 100vw; height: 100vh; overflow: hidden; background: #87CEEB; color: #0ff; font-family: Consolas, monospace; }
        #game-interface { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; pointer-events: none; }
        #joystick-area { position: absolute; bottom: 10px; left: 50px; width: 160px; height: 160px; background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0) 70%); border: 1px solid rgba(255,255,255,0.3); border-radius: 50%; pointer-events: auto; }
        #joystick-handle { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; background: rgba(255,255,255,0.6); box-shadow: 0 0 15px #fff; border-radius: 50%; transform: translate(-50%, -50%); }
        #sprint-btn { position: absolute; bottom: 60px; right: 50px; width: 80px; height: 80px; background: rgba(0,255,204,0.2); border: 2px solid #0ff; border-radius: 50%; pointer-events: auto; display: flex; align-items: center; justify-content: center; color: #0ff; font-weight: bold; text-shadow: 0 0 5px #0ff; cursor: pointer; }
        #aim-btn { position: absolute; bottom: 160px; right: 50px; width: 70px; height: 70px; background: rgba(255,100,100,0.2); border: 2px solid #f66; border-radius: 50%; pointer-events: auto; display: flex; align-items: center; justify-content: center; color: #faa; font-weight: bold; cursor: pointer; transition: background 0.1s; }
        #aim-btn.active { background: rgba(255,100,100,0.6); }
        #fire-btn { position: absolute; top: 20px; left: 30px; width: 140px; height: 140px; background: rgba(255,215,0,0.15); border: 3px solid #fa0; border-radius: 50%; pointer-events: auto; display: flex; align-items: center; justify-content: center; color: #fd4; font-weight: bold; font-size: 24px; cursor: pointer; }
        #camera-touch-surface { position: absolute; top: 0; right: 0; width: 70%; height: 100%; pointer-events: auto; }
        #hud-terminal { position: absolute; top: 20px; right: 20px; text-align: right; font-size: 10px; color: #000; font-weight: bold; }
        #render-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
        #crosshair { position: absolute; top: 50%; left: 50%; width: 6px; height: 6px; background: rgba(255,255,255,0.9); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 30; display: none; }
        #edit-mode-toggle { position: absolute; top: 20px; left: 20px; width: 50px; height: 50px; background: rgba(0,0,0,0.5); border: 2px solid #0ff; border-radius: 12px; color: #0ff; font-size: 28px; display: flex; align-items: center; justify-content: center; pointer-events: auto; z-index: 100; cursor: pointer; }
        #edit-mode-toggle.active { background: #0ff; color: #000; }
        .edit-mode .draggable { outline: 3px dashed #0ff; cursor: move; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
    <div id="render-container"></div>
    <div id="crosshair"><div style="position:absolute;top:-12px;left:50%;width:2px;height:10px;background:#fff;transform:translateX(-50%);box-shadow:0 0 4px red;"></div><div style="position:absolute;bottom:-12px;left:50%;width:2px;height:10px;background:#fff;transform:translateX(-50%);box-shadow:0 0 4px red;"></div></div>
    <div id="game-interface">
        <div id="edit-mode-toggle">⚙️</div>
        <div id="hud-terminal">
            OS: VOXEL_ARCH_V4_MP<br>
            HEALTH: <span id="health-value">100</span>/100
        </div>
        <div id="fire-btn" class="draggable">FIRE</div>
        <div id="joystick-area" class="draggable"><div id="joystick-handle"></div></div>
        <div id="aim-btn" class="draggable">AIM</div>
        <div id="sprint-btn" class="draggable">RUN</div>
        <div id="camera-touch-surface"></div>
    </div>
    <script>
        // ========== АУДИОСИСТЕМА ==========
        class TacticalAudioSystem {
            constructor() {
                this.ctx = null;
                document.addEventListener('touchstart', () => {
                    if (!this.ctx) {
                        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                        if (this.ctx.state === 'suspended') this.ctx.resume();
                    }
                });
            }
            playGunshot() {
                if (!this.ctx || this.ctx.state !== 'running') return;
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(180, t);
                osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.12);
                gain.gain.setValueAtTime(0.9, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
                osc.connect(gain).connect(this.ctx.destination);
                osc.start(t); osc.stop(t + 0.12);
                const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
                for (let i = 0; i < buf.length; i++) buf.getChannelData(0)[i] = Math.random() * 2 - 1;
                const noise = this.ctx.createBufferSource(); noise.buffer = buf;
                const gn = this.ctx.createGain(), filt = this.ctx.createBiquadFilter();
                filt.type = 'highpass'; filt.frequency.value = 1000;
                gn.gain.setValueAtTime(0.7, t);
                gn.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
                noise.connect(filt).connect(gn).connect(this.ctx.destination);
                noise.start(t);
            }
        }

        // ========== МЕНЕДЖЕР ЭФФЕКТОВ ==========
        class CombatFXManager {
            constructor(scene) {
                this.scene = scene;
                this.tracers = []; this.particles = []; this.decals = [];
                this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 });
                this.tracerGeom = new THREE.CylinderGeometry(0.03, 0.03, 1, 6).rotateX(Math.PI / 2);
                this.particleMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
                this.particleGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
                this.smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.4 });
                this.smokeGeom = new THREE.SphereGeometry(0.15, 3);
                this.decalMat = new THREE.MeshBasicMaterial({ color: 0x111111, depthWrite: false });
                this.decalGeom = new THREE.PlaneGeometry(0.25, 0.25);
            }
            spawnTracer(start, end) {
                const d = start.distanceTo(end);
                const m = new THREE.Mesh(this.tracerGeom, this.tracerMat.clone());
                m.scale.set(1, 1, Math.min(d, 12));
                m.position.copy(start.clone().add(end).multiplyScalar(0.5));
                m.lookAt(end);
                this.scene.add(m);
                this.tracers.push({ mesh: m, life: 1.0 });
            }
            spawnImpact(pos, normal) {
                for (let i = 0; i < 8 + Math.floor(Math.random() * 6); i++) {
                    const p = new THREE.Mesh(this.particleGeom, this.particleMat);
                    p.position.copy(pos.clone().add(normal.clone().multiplyScalar(0.1)));
                    const vel = normal.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5)).normalize().multiplyScalar(Math.random() * 6 + 4);
                    this.scene.add(p);
                    this.particles.push({ mesh: p, vel, life: 1.0 });
                }
                for (let i = 0; i < 3; i++) {
                    const s = new THREE.Mesh(this.smokeGeom, this.smokeMat.clone());
                    s.position.copy(pos.clone().add(normal.clone().multiplyScalar(0.2)));
                    s.scale.setScalar(0.8);
                    this.scene.add(s);
                    this.particles.push({ mesh: s, vel: new THREE.Vector3(0, 0.5 + Math.random(), 0), life: 1.0, isSmoke: true });
                }
            }
            spawnBulletHole(pos, normal) {
                const d = new THREE.Mesh(this.decalGeom, this.decalMat);
                d.position.copy(pos).add(normal.clone().multiplyScalar(0.02));
                d.lookAt(pos.clone().add(normal));
                d.rotation.z = Math.random() * Math.PI * 2;
                this.scene.add(d);
                this.decals.push(d);
                if (this.decals.length > 60) { const old = this.decals.shift(); this.scene.remove(old); }
            }
            update(dt) {
                for (let i = this.tracers.length - 1; i >= 0; i--) {
                    const t = this.tracers[i];
                    t.life -= dt * 12;
                    t.mesh.material.opacity = t.life * 0.9;
                    t.mesh.translateZ(dt * 70);
                    if (t.life <= 0) { this.scene.remove(t.mesh); this.tracers.splice(i, 1); }
                }
                for (let i = this.particles.length - 1; i >= 0; i--) {
                    const p = this.particles[i];
                    if (p.isSmoke) {
                        p.vel.y += dt * 1.5;
                        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
                        p.life -= dt * 0.8;
                        p.mesh.scale.setScalar(1 + (1 - p.life) * 2);
                        p.mesh.material.opacity = p.life * 0.4;
                    } else {
                        p.vel.y -= 12 * dt;
                        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
                        p.mesh.rotation.x += dt * p.vel.z;
                        p.mesh.rotation.y += dt * p.vel.x;
                        p.life -= dt * 2.2;
                        p.mesh.scale.setScalar(p.life);
                    }
                    if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); }
                }
            }
        }

        // ========== МУЛЬТИТАЧ-КОНТРОЛЛЕР ==========
        class MultiTouchController {
            constructor() {
                this.moveDir = new THREE.Vector2(0, 0);
                this.camDelta = new THREE.Vector2(0, 0);
                this.isSprinting = false;
                this.isAiming = false;
                this.isFiring = false;
                this.joyTouchId = null;
                this.camTouchId = null;
                this.lastCamPos = { x: 0, y: 0 };
                this.editModeActive = false;
                this.initListeners();
            }
            setEditMode(active) { this.editModeActive = active; }
            initListeners() {
                const joy = document.getElementById('joystick-area');
                const cam = document.getElementById('camera-touch-surface');
                const sprint = document.getElementById('sprint-btn');
                const aim = document.getElementById('aim-btn');
                const fire = document.getElementById('fire-btn');
                const handle = document.getElementById('joystick-handle');
                window.addEventListener('touchstart', (e) => {
                    if (this.editModeActive) return;
                    e.preventDefault();
                    for (let t of e.changedTouches) {
                        const target = t.target;
                        if (this.joyTouchId === null && (target === joy || target === handle)) {
                            this.joyTouchId = t.identifier;
                            this.updateJoystick(t, joy, handle);
                        } else if (sprint.contains(target)) { this.isSprinting = true; }
                          else if (aim.contains(target)) { this.isAiming = !this.isAiming; aim.classList.toggle('active', this.isAiming); }
                          else if (fire.contains(target)) { this.isFiring = true; }
                          else if (this.camTouchId === null && cam.contains(target)) {
                              this.camTouchId = t.identifier;
                              this.lastCamPos = { x: t.clientX, y: t.clientY };
                          }
                    }
                }, { passive: false });
                window.addEventListener('touchmove', (e) => {
                    if (this.editModeActive) return;
                    e.preventDefault();
                    for (let t of e.changedTouches) {
                        if (t.identifier === this.joyTouchId) this.updateJoystick(t, joy, handle);
                        else if (t.identifier === this.camTouchId) {
                            this.camDelta.x = t.clientX - this.lastCamPos.x;
                            this.camDelta.y = t.clientY - this.lastCamPos.y;
                            this.lastCamPos = { x: t.clientX, y: t.clientY };
                        }
                    }
                }, { passive: false });
                window.addEventListener('touchend', (e) => {
                    if (this.editModeActive) return;
                    e.preventDefault();
                    for (let t of e.changedTouches) {
                        if (t.identifier === this.joyTouchId) { this.joyTouchId = null; this.moveDir.set(0, 0); handle.style.transform = 'translate(-50%, -50%)'; }
                        else if (t.identifier === this.camTouchId) { this.camTouchId = null; }
                        else if (t.identifier === this.sprintTouchId) { this.isSprinting = false; }
                        else if (t.identifier === this.fireTouchId) { this.isFiring = false; }
                    }
                });
            }
            updateJoystick(touch, area, handle) {
                const rect = area.getBoundingClientRect();
                const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
                const maxD = rect.width / 2;
                let dx = touch.clientX - cx, dy = touch.clientY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxD) { dx = (dx / dist) * maxD; dy = (dy / dist) * maxD; }
                handle.style.transform = \`translate(calc(-50% + \${dx}px), calc(-50% + \${dy}px))\`;
                this.moveDir.set(dx / maxD, dy / maxD);
            }
        }

        // ========== МЕНЕДЖЕР РЕДАКТИРОВАНИЯ КНОПОК ==========
        class EditModeManager {
            constructor(container, controller) {
                this.container = container;
                this.controller = controller;
                this.active = false;
                this.currentDrag = null;
                this.startX = 0; this.startY = 0; this.startLeft = 0; this.startTop = 0;
                document.getElementById('edit-mode-toggle').addEventListener('click', () => this.toggle());
            }
            toggle() {
                this.active = !this.active;
                this.controller.setEditMode(this.active);
                if (this.active) {
                    this.container.classList.add('edit-mode');
                    document.getElementById('edit-mode-toggle').classList.add('active');
                    this.container.addEventListener('touchstart', this.onTouchStart, { passive: false });
                    this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
                    this.container.addEventListener('touchend', this.onTouchEnd);
                } else {
                    this.container.classList.remove('edit-mode');
                    document.getElementById('edit-mode-toggle').classList.remove('active');
                    this.container.removeEventListener('touchstart', this.onTouchStart);
                    this.container.removeEventListener('touchmove', this.onTouchMove);
                    this.container.removeEventListener('touchend', this.onTouchEnd);
                    this.currentDrag = null;
                }
            }
            onTouchStart(e) {
                if (!this.active) return;
                const target = e.touches[0].target.closest('.draggable');
                if (!target) return;
                e.preventDefault(); e.stopPropagation();
                this.currentDrag = target;
                const rect = target.getBoundingClientRect();
                this.startX = e.touches[0].clientX; this.startY = e.touches[0].clientY;
                this.startLeft = rect.left; this.startTop = rect.top;
                target.style.transition = 'none';
            }
            onTouchMove(e) {
                if (!this.active || !this.currentDrag) return;
                e.preventDefault(); e.stopPropagation();
                const dx = e.touches[0].clientX - this.startX, dy = e.touches[0].clientY - this.startY;
                let nl = this.startLeft + dx, nt = this.startTop + dy;
                const r = this.currentDrag.getBoundingClientRect();
                nl = Math.max(0, Math.min(nl, window.innerWidth - r.width));
                nt = Math.max(0, Math.min(nt, window.innerHeight - r.height));
                this.currentDrag.style.left = nl + 'px';
                this.currentDrag.style.top = nt + 'px';
                this.currentDrag.style.right = 'auto';
                this.currentDrag.style.bottom = 'auto';
            }
            onTouchEnd(e) {
                if (!this.active || !this.currentDrag) return;
                e.preventDefault(); this.currentDrag.style.transition = ''; this.currentDrag = null;
            }
        }

        // ========== ВОКСЕЛЬНЫЙ ГЕРОЙ ==========
        class AdvancedVoxelHero {
            constructor(scene, customMats) {
                this.root = new THREE.Group();
                this.mats = customMats || {
                    skin: new THREE.MeshLambertMaterial({ color: 0xffdbac }),
                    cloth: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
                    accent: new THREE.MeshLambertMaterial({ color: 0x00ffcc }),
                    hair: new THREE.MeshLambertMaterial({ color: 0x331100 }),
                    white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
                    black: new THREE.MeshLambertMaterial({ color: 0x000000 }),
                    shoe: new THREE.MeshLambertMaterial({ color: 0x111111 }),
                    gunMetal: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.8 }),
                    gunGrip: new THREE.MeshStandardMaterial({ color: 0x3a1e0a, roughness: 0.9 }),
                    gunSlide: new THREE.MeshStandardMaterial({ color: 0x444444 }),
                    muzzleFlash: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.95 })
                };
                this.buildModel();
                scene.add(this.root);
                this.animTimer = 0;
                this.weaponGroup = new THREE.Group();
                this.armR.add(this.weaponGroup);
                this.createDetailedWeapon();
                this.slideOffset = 0;
                this.originalSlidePos = new THREE.Vector3(0, 0.33, 0.1);
            }
            box(w, h, d, mat, x = 0, y = 0, z = 0) {
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
                return m;
            }
            createDetailedWeapon() {
                const frame = this.box(0.2, 0.3, 0.7, this.mats.gunMetal, 0, 0.2, 0.1);
                this.slideMesh = this.box(0.18, 0.14, 0.65, this.mats.gunSlide, 0, 0.35, 0.1);
                const grip = this.box(0.18, 0.45, 0.25, this.mats.gunGrip, 0, -0.12, -0.05);
                const barrel = this.box(0.1, 0.1, 0.5, this.mats.gunMetal, 0, 0.3, 0.4);
                const front = this.box(0.04, 0.06, 0.04, this.mats.black, 0, 0.42, 0.5);
                const rear = this.box(0.06, 0.08, 0.06, this.mats.black, 0, 0.42, 0.25);
                const trigger = this.box(0.04, 0.12, 0.04, this.mats.gunMetal, 0, 0.15, -0.1);
                const mag = this.box(0.16, 0.3, 0.22, this.mats.black, 0, -0.25, -0.05);
                this.weaponGroup.add(frame, this.slideMesh, grip, barrel, front, rear, trigger, mag);
                this.muzzleFlashObj = this.box(0.3, 0.25, 0.4, this.mats.muzzleFlash, 0, 0.3, 0.8);
                this.muzzleFlashObj.visible = false;
                this.weaponGroup.add(this.muzzleFlashObj);
                this.muzzlePoint = new THREE.Object3D();
                this.muzzlePoint.position.set(0, 0.3, 0.7);
                this.weaponGroup.add(this.muzzlePoint);
                this.weaponGroup.position.set(0.05, -0.85, 0.25);
                this.weaponGroup.rotation.set(-Math.PI / 2.2, 0.05, -0.05);
            }
            buildModel() {
                this.torso = this.box(0.95, 1.3, 0.55, this.mats.cloth, 0, 1.4, 0);
                this.torso.add(this.box(1, 0.15, 0.6, this.mats.accent, 0, -0.5, 0));
                this.root.add(this.torso);
                this.headContainer = new THREE.Group(); this.headContainer.position.y = 0.65;
                this.torso.add(this.headContainer);
                const skull = this.box(0.75, 0.75, 0.75, this.mats.skin, 0, 0.35, 0);
                this.headContainer.add(skull);
                skull.add(this.box(0.8, 0.3, 0.8, this.mats.hair, 0, 0.3, 0));
                const eyeL = this.box(0.16, 0.16, 0.05, this.mats.white, -0.22, 0.1, 0.38);
                eyeL.add(this.box(0.08, 0.08, 0.02, this.mats.black, 0, 0, 0.03));
                const eyeR = this.box(0.16, 0.16, 0.05, this.mats.white, 0.22, 0.1, 0.38);
                eyeR.add(this.box(0.08, 0.08, 0.02, this.mats.black, 0, 0, 0.03));
                skull.add(eyeL, eyeR);
                skull.add(this.box(0.1, 0.14, 0.1, this.mats.skin, 0, 0, 0.4));
                skull.add(this.box(0.25, 0.05, 0.05, this.mats.black, 0, -0.15, 0.38));
                this.armL = this.createHand(-1); this.armR = this.createHand(1);
                this.torso.add(this.armL, this.armR);
                this.legL = this.createLeg(-1); this.legR = this.createLeg(1);
                this.torso.add(this.legL, this.legR);
            }
            createHand(side) {
                const g = new THREE.Group(); g.position.set(side * 0.7, 0.4, 0);
                g.add(this.box(0.32, 0.95, 0.32, this.mats.skin, 0, -0.35, 0));
                const palm = this.box(0.34, 0.22, 0.34, this.mats.skin, 0, -0.85, 0);
                palm.add(this.box(0.06, 0.12, 0.06, this.mats.skin, 0.12, -0.1, 0.12));
                palm.add(this.box(0.06, 0.12, 0.06, this.mats.skin, -0.12, -0.1, 0.12));
                g.add(palm); return g;
            }
            createLeg(side) {
                const g = new THREE.Group(); g.position.set(side * 0.28, -0.6, 0);
                g.add(this.box(0.4, 1.05, 0.4, this.mats.cloth, 0, -0.4, 0));
                const shoe = this.box(0.45, 0.28, 0.65, this.mats.shoe, 0, -0.95, 0.12);
                shoe.add(this.box(0.45, 0.06, 0.65, this.mats.accent, 0, -0.1, 0));
                g.add(shoe); return g;
            }
            animate(moving, dt, sprint) {
                const mult = sprint ? 1.8 : 1;
                if (moving) {
                    this.animTimer += dt * 8 * mult;
                    const s = Math.sin(this.animTimer);
                    this.armL.rotation.x = s * 0.8;
                    if (!document.getElementById('aim-btn').classList.contains('active')) this.armR.rotation.x = -s * 0.8;
                    this.legL.rotation.x = -s * 0.7; this.legR.rotation.x = s * 0.7;
                    this.root.position.y = Math.abs(Math.cos(this.animTimer)) * (0.15 * mult);
                } else {
                    const l = 0.15;
                    this.animTimer = 0;
                    this.armL.rotation.x += (0 - this.armL.rotation.x) * l;
                    if (!document.getElementById('aim-btn').classList.contains('active')) this.armR.rotation.x += (0 - this.armR.rotation.x) * l;
                    this.legL.rotation.x += (0 - this.legL.rotation.x) * l;
                    this.legR.rotation.x += (0 - this.legR.rotation.x) * l;
                    this.root.position.y += (0 - this.root.position.y) * l;
                }
                if (this.slideMesh) {
                    this.slideOffset *= 0.7;
                    this.slideMesh.position.z = this.originalSlidePos.z - this.slideOffset * 0.3;
                }
            }
            showMuzzleFlash() {
                if (this.muzzleFlashObj) {
                    this.muzzleFlashObj.visible = true;
                    this.muzzleFlashObj.rotation.z = Math.random() * Math.PI;
                    this.muzzleFlashObj.scale.setScalar(1 + Math.random() * 0.5);
                    setTimeout(() => { if (this.muzzleFlashObj) this.muzzleFlashObj.visible = false; }, 70);
                }
                this.slideOffset = 0.25;
            }
        }

        // ========== МУЛЬТИПЛЕЕР МЕНЕДЖЕР ==========
        class MultiplayerManager {
            constructor(game) {
                this.game = game;
                this.socket = null;
                this.playerId = null;
                this.health = 100;
                this.remotePlayers = new Map();
                this.remoteHitboxes = [];
                this.updateInterval = 50;
                this.lastUpdateTime = 0;
                this.connect();
            }
            connect() {
                this.socket = new WebSocket('ws://' + location.host);
                this.socket.onopen = () => {
                    document.getElementById('health-value').textContent = this.health;
                };
                this.socket.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
                this.socket.onclose = () => setTimeout(() => this.connect(), 2000);
            }
            send(data) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(data)); }
            handleMessage(msg) {
                switch (msg.type) {
                    case 'init':
                        this.playerId = msg.id;
                        this.health = msg.health;
                        document.getElementById('health-value').textContent = this.health;
                        this.game.hero.root.position.set(msg.position.x, msg.position.y, msg.position.z);
                        break;
                    case 'players':
                        msg.list.forEach(p => this.addRemotePlayer(p));
                        break;
                    case 'player_joined':
                        this.addRemotePlayer(msg);
                        break;
                    case 'player_update':
                        this.updateRemotePlayer(msg);
                        break;
                    case 'player_left':
                        this.removeRemotePlayer(msg.id);
                        break;
                    case 'health_update':
                        this.health = msg.health;
                        document.getElementById('health-value').textContent = this.health;
                        break;
                    case 'player_damaged':
                        if (this.remotePlayers.has(msg.id)) this.remotePlayers.get(msg.id).health = msg.health;
                        break;
                    case 'player_killed': /* можно эффект */ break;
                    case 'player_respawned':
                        if (msg.id === this.playerId) {
                            this.health = msg.health;
                            document.getElementById('health-value').textContent = this.health;
                            this.game.hero.root.position.set(msg.position.x, msg.position.y, msg.position.z);
                        } else if (this.remotePlayers.has(msg.id)) {
                            const rp = this.remotePlayers.get(msg.id);
                            rp.targetPosition.set(msg.position.x, msg.position.y, msg.position.z);
                            rp.hero.root.position.copy(rp.targetPosition);
                            rp.health = msg.health;
                        }
                        break;
                    case 'respawn':
                        this.health = msg.health;
                        document.getElementById('health-value').textContent = this.health;
                        this.game.hero.root.position.set(msg.position.x, msg.position.y, msg.position.z);
                        break;
                }
            }
            addRemotePlayer(data) {
                if (data.id === this.playerId || this.remotePlayers.has(data.id)) return;
                const mats = {
                    skin: new THREE.MeshLambertMaterial({ color: 0xffccaa }),
                    cloth: new THREE.MeshLambertMaterial({ color: 0x552222 }),
                    accent: new THREE.MeshLambertMaterial({ color: 0xff6666 }),
                    hair: new THREE.MeshLambertMaterial({ color: 0x331100 }),
                    white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
                    black: new THREE.MeshLambertMaterial({ color: 0x000000 }),
                    shoe: new THREE.MeshLambertMaterial({ color: 0x111111 }),
                    gunMetal: new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
                    gunGrip: new THREE.MeshStandardMaterial({ color: 0x3a1e0a }),
                    gunSlide: new THREE.MeshStandardMaterial({ color: 0x444444 }),
                    muzzleFlash: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.95 })
                };
                const hero = new AdvancedVoxelHero(this.game.scene, mats);
                hero.root.position.set(data.position.x, data.position.y, data.position.z);
                hero.root.rotation.y = data.rotationY || 0;
                const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1), new THREE.MeshBasicMaterial({ visible: false }));
                hitbox.position.y = 1.1;
                hero.root.add(hitbox);
                this.remoteHitboxes.push(hitbox);
                this.remotePlayers.set(data.id, {
                    hero, hitbox,
                    targetPosition: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
                    targetRotationY: data.rotationY || 0,
                    isMoving: data.isMoving || false,
                    aiming: data.aiming || false,
                    health: data.health || 100
                });
            }
            updateRemotePlayer(data) {
                const rp = this.remotePlayers.get(data.id);
                if (!rp) return;
                rp.targetPosition.set(data.position.x, data.position.y, data.position.z);
                rp.targetRotationY = data.rotationY;
                rp.isMoving = data.isMoving;
                rp.aiming = data.aiming;
                rp.health = data.health;
            }
            removeRemotePlayer(id) {
                const rp = this.remotePlayers.get(id);
                if (!rp) return;
                this.game.scene.remove(rp.hero.root);
                const idx = this.remoteHitboxes.indexOf(rp.hitbox);
                if (idx !== -1) this.remoteHitboxes.splice(idx, 1);
                this.remotePlayers.delete(id);
            }
            update(dt) {
                this.remotePlayers.forEach(rp => {
                    rp.hero.root.position.lerp(rp.targetPosition, 0.2);
                    let diff = rp.targetRotationY - rp.hero.root.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    rp.hero.root.rotation.y += diff * 0.2;
                    rp.hero.animate(rp.isMoving, dt, false);
                });
                const now = performance.now();
                if (now - this.lastUpdateTime > this.updateInterval && this.playerId) {
                    this.lastUpdateTime = now;
                    const pos = this.game.hero.root.position;
                    this.send({
                        type: 'update',
                        position: { x: pos.x, y: pos.y, z: pos.z },
                        rotationY: this.game.hero.root.rotation.y,
                        isMoving: this.game.input.moveDir.length() > 0.1,
                        aiming: this.game.input.isAiming
                    });
                }
            }
            checkHit(origin, direction) {
                if (!this.playerId) return false;
                const rc = new THREE.Raycaster(origin, direction);
                const hits = rc.intersectObjects(this.remoteHitboxes);
                if (hits.length > 0) {
                    const hit = hits[0].object;
                    for (let [id, rp] of this.remotePlayers) {
                        if (rp.hitbox === hit) {
                            this.send({ type: 'hit', targetId: id });
                            this.game.fxManager.spawnImpact(hits[0].point, hits[0].face.normal);
                            return true;
                        }
                    }
                }
                return false;
            }
        }

        // ========== ОСНОВНАЯ ИГРА ==========
        class Game {
            constructor() {
                this.scene = new THREE.Scene();
                this.scene.background = new THREE.Color(0x87CEEB);
                this.scene.fog = new THREE.Fog(0x87CEEB, 35, 90);
                this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
                this.renderer = new THREE.WebGLRenderer({ antialias: true });
                this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
                this.renderer.setSize(innerWidth, innerHeight);
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                document.getElementById('render-container').appendChild(this.renderer.domElement);
                this.camRadius = 12; this.camTheta = 0; this.camPhi = Math.PI / 3;
                this.collidables = []; this.shootableMeshes = [];
                this.initLights();
                this.initWorld();
                this.input = new MultiTouchController();
                this.hero = new AdvancedVoxelHero(this.scene);
                this.fxManager = new CombatFXManager(this.scene);
                this.audioSystem = new TacticalAudioSystem();
                this.spawnPlayerSafe();
                this.clock = new THREE.Clock();
                this.crosshair = document.getElementById('crosshair');
                this.aimFov = 50; this.normalFov = 70;
                this.aimOffset = new THREE.Vector3(-1, 0.65, 0.5);
                this.shakeIntensity = 0; this.recoilRotation = new THREE.Vector2();
                this.fireCooldown = 0; this.fireRate = 0.18;
                this.editManager = new EditModeManager(document.getElementById('game-interface'), this.input);
                this.multiplayer = new MultiplayerManager(this);
                window.addEventListener('resize', () => this.onResize());
                this.loop();
            }
            spawnPlayerSafe() {
                for (let i = 0; i < 100; i++) {
                    const x = (Math.random() - 0.5) * 160, z = (Math.random() - 0.5) * 160;
                    if (!this.checkCollision(new THREE.Vector3(x, 0, z), 1.2)) {
                        this.hero.root.position.set(x, 0, z); return;
                    }
                }
                this.hero.root.position.set(20, 0, 20);
            }
            initLights() {
                const sun = new THREE.DirectionalLight(0xfff5e6, 1.3);
                sun.position.set(25, 30, 20); sun.castShadow = true;
                sun.shadow.mapSize.set(2048, 2048);
                const d = 20;
                sun.shadow.camera = new THREE.OrthographicCamera(-d, d, d, -d, 1, 50);
                this.scene.add(sun, new THREE.AmbientLight(0x404060, 0.5));
                const back = new THREE.DirectionalLight(0xccddff, 0.5);
                back.position.set(-15, 18, -15); this.scene.add(back);
            }
            initWorld() {
                const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x4a8e3e }));
                ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
                this.scene.add(ground); this.shootableMeshes.push(ground);
                const createWall = (w, h, d, color, pos, ry = 0) => {
                    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
                    m.position.set(pos.x, pos.y, pos.z); m.rotation.y = ry;
                    m.castShadow = m.receiveShadow = true;
                    this.scene.add(m);
                    this.collidables.push({ min: new THREE.Vector3(pos.x - w/2, 0, pos.z - d/2), max: new THREE.Vector3(pos.x + w/2, h, pos.z + d/2) });
                    this.shootableMeshes.push(m);
                };
                const wh = 5.5, wt = 2, bo = 120 - wt/2;
                createWall(240, wh, wt, 0x8a9098, new THREE.Vector3(0, wh/2, -bo));
                createWall(240, wh, wt, 0x8a9098, new THREE.Vector3(0, wh/2, bo));
                createWall(wt, wh, 240, 0x8a9098, new THREE.Vector3(-bo, wh/2, 0));
                createWall(wt, wh, 240, 0x8a9098, new THREE.Vector3(bo, wh/2, 0));
                const addPillar = (x, z) => {
                    const w = 2.5, h = wh + 0.8;
                    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: 0x6a7078 }));
                    p.position.set(x, h/2, z); p.castShadow = true; this.scene.add(p);
                    this.collidables.push({ min: new THREE.Vector3(x-w/2,0,z-w/2), max: new THREE.Vector3(x+w/2,h,z+w/2) });
                    this.shootableMeshes.push(p);
                };
                addPillar(-bo, -bo); addPillar(bo, -bo); addPillar(-bo, bo); addPillar(bo, bo);
                createWall(1.8, 4, 50, 0x6e7a82, new THREE.Vector3(0, 2, 15));
                createWall(1.8, 4, 50, 0x6e7a82, new THREE.Vector3(0, 2, -35));
                createWall(65, 4, 1.8, 0x6e7a82, new THREE.Vector3(-20, 2, -15));
                createWall(30, 4, 1.8, 0x6e7a82, new THREE.Vector3(40, 2, 25), 0.4);
                createWall(30, 4, 1.8, 0x6e7a82, new THREE.Vector3(-40, 2, -25), -0.3);
                for (let i = 0; i < 10; i++) {
                    const bx = -45 + i * 14, bz = -55 + (i % 4) * 18;
                    const block = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x5d6a75 }));
                    block.position.set(bx, 0.7, bz); block.castShadow = true; this.scene.add(block);
                    this.collidables.push({ min: new THREE.Vector3(bx-2,0,bz-2), max: new THREE.Vector3(bx+2,1.4,bz+2) });
                    this.shootableMeshes.push(block);
                }
            }
            checkCollision(pos, r = 0.9) {
                for (let c of this.collidables) {
                    const cl = new THREE.Vector3(Math.max(c.min.x, Math.min(pos.x, c.max.x)), Math.max(c.min.y, Math.min(pos.y, c.max.y)), Math.max(c.min.z, Math.min(pos.z, c.max.z)));
                    if (cl.distanceToSquared(pos) < r * r) return true;
                }
                return false;
            }
            onResize() {
                this.camera.aspect = innerWidth / innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(innerWidth, innerHeight);
            }
            fireWeapon() {
                this.hero.showMuzzleFlash();
                this.audioSystem.playGunshot();
                this.shakeIntensity = 0.35;
                this.recoilRotation.y += (Math.random() - 0.5) * 0.08;
                this.recoilRotation.x += 0.04 + Math.random() * 0.06;
                const muzzle = new THREE.Vector3();
                this.hero.muzzlePoint.getWorldPosition(muzzle);
                const rc = new THREE.Raycaster();
                rc.setFromCamera(new THREE.Vector2(0, 0), this.camera);
                const hitRemote = this.multiplayer.checkHit(muzzle, rc.ray.direction);
                const hits = rc.intersectObjects(this.shootableMeshes);
                let target = hits.length ? hits[0].point : rc.ray.at(120, new THREE.Vector3());
                if (!hitRemote && hits.length) {
                    this.fxManager.spawnImpact(hits[0].point, hits[0].face.normal);
                    this.fxManager.spawnBulletHole(hits[0].point, hits[0].face.normal);
                }
                this.fxManager.spawnTracer(muzzle, target);
            }
            update(dt) {
                if (this.input.camDelta.lengthSq() > 0) {
                    this.camTheta -= this.input.camDelta.x * 0.006;
                    this.camPhi -= this.input.camDelta.y * 0.006;
                    this.camPhi = Math.max(0.05, Math.min(Math.PI - 0.05, this.camPhi));
                    this.input.camDelta.set(0, 0);
                }
                const moving = this.input.moveDir.length() > 0.1;
                const speed = (this.input.isSprinting ? 9.5 : 5.8) * dt;
                if (moving) {
                    const ang = this.camTheta + Math.atan2(this.input.moveDir.x, this.input.moveDir.y);
                    const dx = Math.sin(ang) * speed, dz = Math.cos(ang) * speed;
                    const pos = this.hero.root.position;
                    if (!this.checkCollision(new THREE.Vector3(pos.x + dx, pos.y, pos.z))) pos.x += dx;
                    if (!this.checkCollision(new THREE.Vector3(pos.x, pos.y, pos.z + dz))) pos.z += dz;
                    let diff = ang - this.hero.root.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    this.hero.root.rotation.y += diff * 0.2;
                }
                this.hero.animate(moving, dt, this.input.isSprinting);
                const aiming = this.input.isAiming;
                this.crosshair.style.display = aiming ? 'block' : 'none';
                this.camera.fov += ((aiming ? this.aimFov : this.normalFov) - this.camera.fov) * 0.12;
                this.camera.updateProjectionMatrix();
                if (aiming) {
                    let diff = this.camTheta + Math.PI - this.hero.root.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    this.hero.root.rotation.y += diff * 0.15;
                }
                if (this.fireCooldown > 0) this.fireCooldown -= dt;
                if (this.input.isFiring && this.fireCooldown <= 0 && this.multiplayer.health > 0) {
                    this.fireCooldown = this.fireRate;
                    this.fireWeapon();
                }
                this.fxManager.update(dt);
                this.shakeIntensity *= 0.75;
                this.recoilRotation.lerp(new THREE.Vector2(0, 0), 0.2);
                const hPos = this.hero.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
                const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
                const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
                if (aiming) {
                    const fwd = new THREE.Vector3(-Math.sin(this.camTheta) * Math.sin(this.camPhi), -Math.cos(this.camPhi), -Math.cos(this.camTheta) * Math.sin(this.camPhi)).normalize();
                    const right = new THREE.Vector3(-Math.cos(this.camTheta), 0, Math.sin(this.camTheta));
                    const up = new THREE.Vector3(0, 1, 0);
                    const recoil = fwd.clone().add(right.clone().multiplyScalar(this.recoilRotation.y)).add(up.clone().multiplyScalar(this.recoilRotation.x)).normalize();
                    const off = right.clone().multiplyScalar(this.aimOffset.x).add(up.clone().multiplyScalar(this.aimOffset.y)).add(fwd.clone().multiplyScalar(this.aimOffset.z));
                    const camPos = hPos.clone().add(off);
                    camPos.x += shakeX; camPos.y += shakeY;
                    this.camera.position.copy(camPos);
                    this.camera.lookAt(hPos.clone().add(recoil.clone().multiplyScalar(15)));
                } else {
                    const ox = this.camRadius * Math.sin(this.camPhi) * Math.sin(this.camTheta);
                    const oy = this.camRadius * Math.cos(this.camPhi);
                    const oz = this.camRadius * Math.sin(this.camPhi) * Math.cos(this.camTheta);
                    const camPos = new THREE.Vector3(hPos.x + ox, hPos.y + oy + 1.8, hPos.z + oz);
                    camPos.x += shakeX; camPos.y += shakeY;
                    this.camera.position.copy(camPos);
                    this.camera.lookAt(hPos.x, hPos.y + 0.9, hPos.z);
                }
                this.multiplayer.update(dt);
            }
            loop() {
                requestAnimationFrame(() => this.loop());
                this.update(this.clock.getDelta());
                this.renderer.render(this.scene, this.camera);
            }
        }

        // ЗАПУСК
        new Game();
    </script>
</body>
</html>`;

// ============ HTTP СЕРВЕР (отдаёт HTML) ============
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
});

// ============ WEBSOCKET СЕРВЕР (мультиплеер) ============
const wss = new WebSocket.Server({ server });
const players = new Map();

function genId() {
    return 'p_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}
function spawn() {
    return { x: (Math.random() - 0.5) * 100, y: 0, z: (Math.random() - 0.5) * 100 };
}

wss.on('connection', (ws) => {
    const id = genId();
    const s = spawn();
    const player = { ws, position: s, rotationY: 0, isMoving: false, aiming: false, health: 100, dead: false };
    players.set(id, player);

    ws.send(JSON.stringify({ type: 'init', id, position: player.position, health: 100 }));

    // отправляем список остальных
    const others = [];
    players.forEach((p, pid) => {
        if (pid !== id) others.push({ id: pid, position: p.position, rotationY: p.rotationY, isMoving: p.isMoving, aiming: p.aiming, health: p.health });
    });
    if (others.length) ws.send(JSON.stringify({ type: 'players', list: others }));

    // оповещаем всех о новом
    broadcast({ type: 'player_joined', id, position: player.position, health: 100 }, ws);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        if (!players.has(id)) return;

        switch (msg.type) {
            case 'update':
                player.position = msg.position;
                player.rotationY = msg.rotationY;
                player.isMoving = msg.isMoving;
                player.aiming = msg.aiming;
                broadcast({ type: 'player_update', id, ...msg }, ws);
                break;
            case 'hit':
                if (!players.has(msg.targetId)) return;
                const target = players.get(msg.targetId);
                if (target.dead) return;
                const dx = player.position.x - target.position.x;
                const dz = player.position.z - target.position.z;
                if (Math.sqrt(dx*dx+dz*dz) > 80) return;
                target.health -= 50;
                target.ws.send(JSON.stringify({ type: 'health_update', health: target.health }));
                broadcast({ type: 'player_damaged', id: msg.targetId, health: target.health });
                if (target.health <= 0) {
                    target.dead = true;
                    broadcast({ type: 'player_killed', id: msg.targetId, by: id });
                    setTimeout(() => {
                        if (!players.has(msg.targetId)) return;
                        const r = spawn();
                        target.position = r;
                        target.health = 100;
                        target.dead = false;
                        target.ws.send(JSON.stringify({ type: 'respawn', position: target.position, health: 100 }));
                        broadcast({ type: 'player_respawned', id: msg.targetId, position: target.position, health: 100 });
                    }, 3000);
                }
                break;
        }
    });

    ws.on('close', () => {
        players.delete(id);
        broadcast({ type: 'player_left', id });
    });
});

function broadcast(data, exclude) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(c => {
        if (c !== exclude && c.readyState === WebSocket.OPEN) c.send(msg);
    });
}

server.listen(8080, () => console.log('Сервер игры запущен на порту 8080'));
