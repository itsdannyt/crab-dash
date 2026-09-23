/* Crab Dash — game controller: save data, scenes, input, and the play scene. */
(function (G) {
  'use strict';
  const CD = G.CD;
  const A = CD.art, R = CD.render, AU = CD.audio, UI = CD.ui;
  const Game = (CD.game = {});
  const VH = 320;

  // ───────────────────────── save data ─────────────────────────
  const SAVE_KEY = 'crabdash.save.v1';
  function defaults() {
    return {
      v: 1,
      levels: {},
      stats: { jumps: 0, attempts: 0, deaths: 0, completed: 0, stars: 0, coins: 0, orbs: 0, time: 0 },
      icon: { forms: { cube: 0, ship: 0, ball: 0, ufo: 0, wave: 0, robot: 0, spider: 0 }, c1: '#d97757', c2: '#ffe4cc', glow: false },
      settings: { music: 0.75, sfx: 0.8, showPct: true, showBar: true, autoCP: true },
      custom: [],
    };
  }
  function merge(a, b) {
    if (!b || typeof b !== 'object') return a;
    for (const k of Object.keys(b)) {
      if (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && typeof b[k] === 'object') merge(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }
  Game.load = function () {
    let raw = null;
    try { raw = JSON.parse(G.localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { raw = null; }
    Game.save = merge(defaults(), raw);
  };
  Game.persist = function () { try { G.localStorage.setItem(SAVE_KEY, JSON.stringify(Game.save)); } catch (e) { /* storage unavailable: progress lives for this session */ } };
  Game.lvl = function (id) {
    const L = Game.save.levels;
    return L[id] || (L[id] = { best: 0, practice: 0, attempts: 0, jumps: 0, done: false, coins: [0, 0, 0] });
  };
  Game.icon = () => Game.save.icon;

  // ───────────────────────── scenes & transitions ─────────────────────────
  Game.scenes = {};
  Game.scene = null;
  Game.sceneName = '';
  Game.fade = { a: 1, target: 0, next: null, arg: null, speed: 3.2 };
  Game.go = function (name, arg, instant) {
    if (instant) { Game.enter(name, arg); Game.fade.a = 0; Game.fade.target = 0; return; }
    Game.fade.next = name; Game.fade.arg = arg; Game.fade.target = 1;
  };
  Game.enter = function (name, arg) {
    if (Game.scene && Game.scene.leave) Game.scene.leave();
    Game.sceneName = name;
    Game.scene = Game.scenes[name];
    UI.active = null; UI.drag = null;
    Game.popup = null;
    if (Game.scene.enter) Game.scene.enter(arg);
  };

  // ───────────────────────── input ─────────────────────────
  Game.input = { held: false, pressPending: false, holders: new Set() };
  function holdOn(src) {
    const I = Game.input;
    const was = I.holders.size > 0;
    I.holders.add(src);
    if (!was) { I.held = true; I.pressPending = true; }
  }
  function holdOff(src) {
    const I = Game.input;
    I.holders.delete(src);
    if (I.holders.size === 0) I.held = false;
  }
  Game.clearHold = function () { Game.input.holders.clear(); Game.input.held = false; Game.input.pressPending = false; };

  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
  function toScreen(e) {
    const r = R.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * R.VW, ((e.clientY - r.top) / r.height) * VH];
  }
  Game.bindInput = function (canvas) {
    G.addEventListener('keydown', (e) => {
      AU.init();
      if (JUMP_KEYS.has(e.code) || e.code === 'Escape' || e.code === 'Enter') e.preventDefault();
      if (Game.popup && Game.popup.key && Game.popup.key(e)) return;
      if (Game.scene && Game.scene.key && Game.scene.key(e, true)) return;
      if (JUMP_KEYS.has(e.code) && !e.repeat) holdOn('k:' + e.code);
    });
    G.addEventListener('keyup', (e) => {
      if (JUMP_KEYS.has(e.code)) holdOff('k:' + e.code);
      if (Game.scene && Game.scene.key) Game.scene.key(e, false);
    });
    canvas.addEventListener('pointerdown', (e) => {
      AU.init();
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
      const [x, y] = toScreen(e);
      UI.pointerMove(x, y);
      if (UI.pointerDown(x, y)) { Game.uiPointer = e.pointerId; return; }
      if (Game.popup) return;
      if (Game.scene && Game.scene.pointer && Game.scene.pointer(x, y, true)) return;
      holdOn('p:' + e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => { const [x, y] = toScreen(e); UI.pointerMove(x, y); if (Game.scene && Game.scene.move) Game.scene.move(x, y); });
    const up = (e) => {
      const [x, y] = toScreen(e);
      if (Game.uiPointer === e.pointerId) { Game.uiPointer = null; UI.pointerUp(x, y); return; }
      holdOff('p:' + e.pointerId);
      if (Game.scene && Game.scene.pointer) Game.scene.pointer(x, y, false);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { if (Game.scene && Game.scene.wheel) { e.preventDefault(); Game.scene.wheel(e.deltaY, e.deltaX); } }, { passive: false });
    G.addEventListener('blur', () => { Game.clearHold(); if (Game.sceneName === 'play' && Game.P && Game.P.phase === 'run' && !Game.P.paused) Game.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { Game.clearHold(); if (Game.sceneName === 'play' && Game.P && Game.P.phase === 'run' && !Game.P.paused) Game.pause(); } });
  };

  // ───────────────────────── play scene ─────────────────────────
  const CAM_GROUND = -GROUND_Y();
  function GROUND_Y() { return 87; }
  const ANCHOR = 102;   // player centre height on screen when standing on the ground (15 + 87)
  const TOPZONE = 183.6; // ANCHOR + the 2.22-block jump rise (66.6) + half a block: plain jumps never move the camera

  const levelCache = new Map();
  Game.compiled = function (def) {
    let L = levelCache.get(def);
    if (!L) { L = CD.compileLevel(def); R.prepareLevel(L); levelCache.set(def, L); }
    return L;
  };

  Game.startLevel = function (def, opts = {}) {
    const level = Game.compiled(def);
    // the new run takes over only when the play scene starts, so a level fading out keeps its own state
    Game.nextP = {
      def, level, practice: !!opts.practice, editor: opts.editor || null,
      attempt: 0, checkpoints: [], paused: false, phase: 'run', acc: 0,
      newBest: null, runCoins: 0, runJumps: 0, attemptT: 0,
    };
    Game.go('play');
  };

  function spawnState(P) {
    P.sim = CD.createSim(P.level);
    const p = P.sim.p;
    P.cam = { x: p.x - (R.VW / 2 - 75), y: CAM_GROUND };
    P.vis = { rot: 0, sq: 0, floor: p.floorY, ceil: isFinite(p.ceilY) ? p.ceilY : null, ceilA: 0, blink: 0 };
    P.colors = { bg: P.def.bg, gr: P.def.gr, fromBg: P.def.bg, fromGr: P.def.gr, toBg: P.def.bg, toGr: P.def.gr, t: 1, dur: 0 };
    P.colorIdx = 0;
    P.trail = [];
    P.attemptT = 0;
    P.runCoins = 0;
    P.usedSet = new Set();
  }

  function newAttempt(fresh) {
    const P = Game.P;
    const s = Game.lvl(P.def.id);
    P.phase = 'run';
    P.acc = 0;
    P.deathT = 0;
    R.particles.length = 0; R.rings.length = 0;
    if (P.practice && !fresh && P.checkpoints.length) {
      restoreCheckpoint(P, P.checkpoints[P.checkpoints.length - 1]);
    } else {
      spawnState(P);
      P.attempt++;
      if (!P.editor) { s.attempts++; Game.save.stats.attempts++; }
      if (!P.practice) {
        AU.playSong(P.def.song, P.def.bpm, P.def.sections, { tail: 3 });
      }
    }
    P.newBestT = P.newBest ? P.newBestT : 0;
    Game.clearHold();
  }

  function restoreCheckpoint(P, cp) {
    P.sim = CD.createSim(P.level);
    P.sim.p = CD.clonePlayer(cp.p);
    P.cam = Object.assign({}, cp.cam);
    P.vis = Object.assign({}, cp.vis);
    P.colors = Object.assign({}, cp.colors);
    P.colorIdx = cp.colorIdx;
    P.trail = cp.trail.slice();
    P.attemptT = cp.t;
    P.usedSet = new Set(cp.used);
  }

  function placeCheckpoint(auto) {
    const P = Game.P;
    if (!P.practice || P.phase !== 'run') return;
    const p = P.sim.p;
    P.checkpoints.push({ p: CD.clonePlayer(p), cam: Object.assign({}, P.cam), vis: Object.assign({}, P.vis), colors: Object.assign({}, P.colors), colorIdx: P.colorIdx, trail: P.trail.slice(-80), t: P.attemptT, used: Array.from(P.usedSet), x: p.x, y: p.y });
    P.lastCPT = P.attemptT;
    if (!auto) AU.sfx('checkpoint');
  }
  Game.placeCheckpoint = placeCheckpoint;
  Game.removeCheckpoint = function () { const P = Game.P; if (P && P.practice && P.checkpoints.length) { P.checkpoints.pop(); AU.sfx('back'); } };

  Game.pause = function () {
    const P = Game.P;
    if (!P || P.paused || P.phase === 'done') return;
    P.paused = true;
    AU.pause();
    Game.clearHold();
  };
  Game.resume = function () {
    const P = Game.P;
    if (!P) return;
    P.paused = false;
    AU.resume();
    Game.clearHold();
    P.acc = 0;
  };
  Game.restart = function (practice) {
    const P = Game.P;
    const wasPractice = P.practice;
    if (practice != null) P.practice = practice;
    P.paused = false;
    AU.resume();
    P.checkpoints = [];
    P.attempt = 0;
    P.newBest = null;
    if (P.practice && (!wasPractice || !AU.songTime())) AU.playSong('practice', 128, [{ bars: 8, part: 'ambient' }], { loop: true });
    if (!P.practice) AU.stopSong(0.05);
    newAttempt(true);
  };
  Game.exitLevel = function () {
    const P = Game.P;
    AU.resume();
    AU.stopSong(0.3);
    Game.persist();
    if (P && P.editor) Game.go('editor', { back: true });
    else Game.go('select', { index: CD.LEVELS.indexOf(P.def) });
  };

  function pct(P) { return Math.max(0, Math.min(100, (P.sim.p.x / P.level.endX) * 100)); }

  function lastUsed(p) { return p.lastUsed; }

  function handleEvents(P, ev) {
    const p = P.sim.p;
    const ic = Game.icon();
    const E = CD.EV;
    if (ev & E.JUMP) { P.runJumps++; if (!P.editor) { Game.save.stats.jumps++; Game.lvl(P.def.id).jumps++; } }
    if (p.mode === 'cube' || p.mode === 'robot') {
      if (ev & E.LAND) P.vis.sq = -1;
      if (ev & E.JUMP) P.vis.sq = 1;
    }
    if (ev & (E.PAD | E.ORB | E.PORTAL | E.COIN | E.SPEED)) {
      const id = lastUsed(p);
      const o = id >= 0 ? P.level.objs[id] : null;
      if (o) {
        P.usedSet.add(o.id);
        if (o.type === 'orb') {
          const col = A.ORB_COLORS[o.c];
          R.ring(o.cx, o.cy, 10, 42, 0.35, col, 3);
          R.burst(o.cx, o.cy, 10, col, 140, 0.35, 3);
          if (!P.editor) Game.save.stats.orbs++;
        } else if (o.type === 'pad') {
          const col = A.PAD_COLORS[o.c];
          for (let i = 0; i < 12; i++) R.spawn(o.x0 + Math.random() * 26, o.rot === 180 ? o.y1 : o.y0, (Math.random() - 0.5) * 40, (o.rot === 180 ? -1 : 1) * (80 + Math.random() * 160), 0.45, 3, col);
        } else if (o.type === 'coin') {
          AU.sfx('coin');
          P.runCoins |= 1 << o.i;
          R.burst(o.cx, o.cy, 18, '#ffd84a', 160, 0.6, 3.5);
          R.ring(o.cx, o.cy, 8, 50, 0.45, '#fff2a8', 3);
          P.coinFx = { x: o.cx, y: o.cy, t: 0, i: o.i };
        } else if (o.type === 'speed') {
          R.burst(o.cx, o.cy, 14, A.SPEED_COLORS[o.speed], 120, 0.4, 3);
        } else {
          const col = A.PORTAL_COLORS[o.p] || '#fff';
          R.burst(p.x, p.y, 16, col, 150, 0.45, 3.5);
          R.ring(o.cx, o.cy, 12, 55, 0.4, col, 2.5);
        }
      }
    }
    if (ev & E.LAND) {
      if (p.mode === 'cube' || p.mode === 'robot') for (let i = 0; i < 4; i++) R.spawn(p.x - 8 + Math.random() * 16, p.y - (p.flip ? -1 : 1) * CD.playerSize(p) / 2, (Math.random() - 0.5) * 60, (p.flip ? -1 : 1) * Math.random() * 40, 0.3, 2.5, ic.c2);
    }
    if (ev & E.TELEPORT) {
      P.teleFx = { x: p.x, y0: p.teleFrom, y1: p.y, t: 0 };
    }
    if (ev & (E.PORTAL | E.FLIP | E.TELEPORT)) P.trail.push({ x: p.x, y: p.y, gap: true });
    if (ev & E.DIE) die(P);
    if (ev & E.WIN) complete(P);
  }

  function die(P) {
    const p = P.sim.p;
    const ic = Game.icon();
    P.phase = 'dead';
    P.deathT = 0;
    Game.clearHold();
    if (!P.practice) AU.stopSong(0.02);
    AU.sfx('death');
    R.burst(p.x, p.y, 26, ic.c1, 280, 0.7, 6, { drag: 1.5 });
    R.burst(p.x, p.y, 16, ic.c2, 220, 0.6, 5, { drag: 1.5 });
    R.ring(p.x, p.y, 6, 75, 0.45, '#ffffff', 3);
    R.ring(p.x, p.y, 4, 40, 0.3, ic.c2, 2);
    if (P.editor) return;
    Game.save.stats.deaths++;
    const s = Game.lvl(P.def.id);
    const got = Math.floor(pct(P));
    if (P.practice) { if (got > s.practice) s.practice = got; }
    else if (got > s.best) {
      s.best = got;
      if (got >= 1) { P.newBest = got; P.newBestT = 0; AU.sfx('newbest'); }
    }
    Game.persist();
  }

  function complete(P) {
    const p = P.sim.p;
    P.phase = 'done';
    P.doneT = 0;
    P.endFrom = { x: p.x, y: p.y };
    Game.clearHold();
    AU.sfx('complete');
    if (P.editor) { P.editor.verified = !P.practice; return; }
    const s = Game.lvl(P.def.id);
    if (P.practice) { s.practice = 100; }
    else {
      const first = !s.done;
      s.best = 100;
      if (first) { s.done = true; Game.save.stats.completed++; Game.save.stats.stars += P.def.stars || 0; P.earnedStars = P.def.stars || 0; }
      let newCoins = 0;
      for (let i = 0; i < 3; i++) if ((P.runCoins >> i) & 1 && !s.coins[i]) { s.coins[i] = 1; newCoins++; }
      Game.save.stats.coins += newCoins;
      P.newCoins = newCoins;
    }
    Game.persist();
  }

  function simTick(P) {
    const I = Game.input;
    let pressed = I.pressPending;
    I.pressPending = false;
    let held = I.held || pressed;
    if (P.auto) {
      // debug autoplay: recorded 60 Hz inputs, 4 ticks each
      const f = Math.floor(P.autoTick / 4);
      held = !!P.auto[f];
      pressed = held && P.autoTick % 4 === 0 && !(f > 0 && P.auto[f - 1]);
      P.autoTick++;
    }
    const p = P.sim.p;
    const ev = CD.tick(P.sim, held, pressed);
    const g = p.flip ? -1 : 1;
    // cosmetic rotation
    const V = P.vis;
    if (p.mode === 'cube') {
      V.rot = 0; // the crab stays upright when it jumps
    } else if (p.mode === 'ship') {
      const tgt = -Math.atan2(p.vy, CD.xSpeed(p.speed)) * 0.9;
      V.rot += (tgt - V.rot) * 0.18;
    } else if (p.mode === 'wave') {
      V.rot = -Math.atan2(p.vy, CD.xSpeed(p.speed));
    } else if (p.mode === 'ball') {
      V.rot += g * (CD.xSpeed(p.speed) * CD.STEP) / (CD.playerSize(p) / 2);
    } else if (p.mode === 'ufo') {
      const tgt = Math.max(-0.35, Math.min(0.35, -p.vy * 0.035));
      V.rot += (tgt - V.rot) * 0.12;
    } else {
      V.rot *= 0.8;
    }
    if (p.mode === 'wave' && (P.tick = (P.tick || 0) + 1) % 2 === 0) {
      P.trail.push({ x: p.x, y: p.y });
      if (P.trail.length > 700) P.trail.splice(0, P.trail.length - 700);
    }
    if (ev) handleEvents(P, ev);
    P.attemptT += CD.STEP / 60;
    // practice auto-checkpoints: every 2.5 s of play while grounded or flying
    if (P.practice && Game.save.settings.autoCP && P.phase === 'run' && P.attemptT - (P.lastCPT || 0) > 2.5 && (p.onGround || CD.FLYING[p.mode])) placeCheckpoint(true);
  }

  function updateColors(P, dt) {
    const p = P.sim.p;
    const list = P.def.colors || [];
    while (P.colorIdx < list.length && p.x >= list[P.colorIdx].x * 30) {
      const c = list[P.colorIdx++];
      Object.assign(P.colors, { fromBg: P.colors.bg, fromGr: P.colors.gr, toBg: c.bg, toGr: c.gr, t: 0, dur: c.dur });
    }
    const C = P.colors;
    if (C.t < 1) {
      C.t = C.dur > 0 ? Math.min(1, C.t + dt / C.dur) : 1;
      C.bg = A.mix(C.fromBg, C.toBg, C.t);
      C.gr = A.mix(C.fromGr, C.toGr, C.t);
    }
  }

  function updateCamera(P, dt, snap) {
    const p = P.sim.p;
    const VW = R.VW;
    const maxX = P.level.endX - VW + 120;
    P.cam.x = Math.min(maxX, p.x - (VW / 2 - 75));
    let ty;
    const bounded = isFinite(p.ceilY);
    if (bounded) ty = (p.floorY + p.ceilY) / 2 - VH / 2;
    else {
      ty = P.cam.y;
      if (p.y - ty > TOPZONE) ty = p.y - TOPZONE;
      if (p.y - ty < ANCHOR) ty = p.y - ANCHOR;
      if (ty < CAM_GROUND) ty = CAM_GROUND;
    }
    const k = snap ? 1 : Math.min(1, dt * (bounded ? 5 : 6));
    P.cam.y += (ty - P.cam.y) * k;
    // play-area floor & ceiling visuals slide into place
    const V = P.vis;
    const kf = snap ? 1 : Math.min(1, dt * 7);
    V.floor += (p.floorY - V.floor) * kf;
    if (bounded) {
      if (V.ceil == null) V.ceil = P.cam.y + VH + 40;
      V.ceil += (p.ceilY - V.ceil) * kf;
    } else if (V.ceil != null) {
      V.ceil += (P.cam.y + VH + 60 - V.ceil) * kf;
      if (V.ceil - P.cam.y > VH + 50) V.ceil = null;
    }
  }

  function updateParticlesForPlayer(P, dt) {
    const p = P.sim.p;
    if (P.phase !== 'run') return;
    const ic = Game.icon();
    const g = p.flip ? -1 : 1;
    const h = CD.playerSize(p) / 2;
    P.emit = (P.emit || 0) + dt;
    const every = 1 / 45;
    while (P.emit > every) {
      P.emit -= every;
      if (p.onGround && (p.mode === 'cube' || p.mode === 'robot' || p.mode === 'ball' || p.mode === 'spider')) {
        R.spawn(p.x - h + Math.random() * 4, p.y - g * h + g * (Math.random() * 3), -30 - Math.random() * 60, g * (10 + Math.random() * 40), 0.3 + Math.random() * 0.2, 2 + Math.random() * 2.2, ic.c2);
      } else if (p.mode === 'ship' || p.mode === 'ufo') {
        const held = Game.input.held;
        R.spawn(p.x - h * 0.9, p.y - g * (p.mode === 'ufo' ? 8 : 3), -60 - Math.random() * 60, (Math.random() - 0.5) * 30 - g * (held ? 10 : 0), 0.3, (held ? 3 : 2) + Math.random() * 2, Math.random() < 0.5 ? ic.c2 : ic.c1);
      }
    }
  }

  const PLAY = (Game.scenes.play = {
    enter() {
      if (Game.nextP) { Game.P = Game.nextP; Game.nextP = null; }
      const P = Game.P;
      P.attempt = 0;
      AU.sfx('start');
      if (P.practice) AU.playSong('practice', 128, [{ bars: 8, part: 'ambient' }], { loop: true });
      newAttempt(true);
      updateCamera(P, 0, true);
    },
    leave() { AU.resume(); },
    key(e, down) {
      const P = Game.P;
      if (!down) return false;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (P.phase === 'done') { if (P.doneT > 1) Game.exitLevel(); return true; }
        if (P.paused) Game.resume(); else Game.pause();
        return true;
      }
      if (P.paused) {
        if (e.code === 'Space' || e.code === 'Enter') { Game.resume(); return true; }
        if (e.code === 'KeyR') { Game.restart(); return true; }
        return true;
      }
      if (e.code === 'KeyZ') { placeCheckpoint(false); return true; }
      if (e.code === 'KeyX') { Game.removeCheckpoint(); return true; }
      if (e.code === 'KeyR' && P.phase !== 'done') { Game.restart(); return true; }
      if (P.phase === 'done' && P.doneT > 2.2 && (e.code === 'Space' || e.code === 'Enter')) { Game.restart(); return true; }
      return false;
    },
    pointer(x, y, down) {
      const P = Game.P;
      if (down && P.paused) return true;
      if (down && P.phase === 'done') return true;
      return false;
    },
    update(dt) {
      const P = Game.P;
      if (!P || !P.sim) return;
      R.updateParticles(P.paused ? 0 : dt);
      if (P.paused) return;
      if (P.newBest) { P.newBestT += dt; if (P.newBestT > 1.6) P.newBest = null; }
      if (P.coinFx) { P.coinFx.t += dt; if (P.coinFx.t > 1) P.coinFx = null; }
      if (P.teleFx) { P.teleFx.t += dt; if (P.teleFx.t > 0.25) P.teleFx = null; }
      if (P.phase === 'run') {
        P.acc += dt * CD.TPS;
        let n = Math.floor(P.acc);
        P.acc -= n;
        if (n > 48) n = 48;
        for (let i = 0; i < n && P.phase === 'run'; i++) simTick(P);
        if (!P.editor) Game.save.stats.time += dt;
      } else if (P.phase === 'dead') {
        P.deathT += dt;
        if (P.deathT >= (P.practice ? 0.75 : 1.0)) newAttempt(false);
      } else if (P.phase === 'done') {
        P.doneT += dt;
        const p = P.sim.p;
        // pulled into the end gate
        const k = Math.min(1, P.doneT / 0.6);
        p.x = P.endFrom.x + (P.level.endX + 40 - P.endFrom.x) * k;
        p.y = P.endFrom.y + (Math.max(p.floorY + 60, Math.min(p.floorY + 150, P.endFrom.y)) - P.endFrom.y) * k;
        if (P.doneT > 0.6 && !P.gateBurst) {
          P.gateBurst = true;
          const ic = Game.icon();
          R.burst(p.x, p.y, 30, ic.c1, 260, 0.8, 5);
          R.burst(p.x, p.y, 20, '#ffffff', 200, 0.6, 4);
        }
        if (P.doneT > 0.8 && P.doneT < 3.5 && Math.random() < dt * 6) {
          const cols = ['#ffe23a', '#ff4fd8', '#5cff4f', '#2fc8ff', '#ff8a1f'];
          const fx = P.cam.x + R.VW * (0.25 + Math.random() * 0.5), fy = P.cam.y + VH * (0.45 + Math.random() * 0.4);
          const col = cols[(Math.random() * cols.length) | 0];
          R.burst(fx, fy, 26, col, 180, 0.9, 3.5, { grav: 120 });
          R.ring(fx, fy, 4, 45, 0.5, col, 2);
        }
      }
      if (P.phase !== 'done' || P.doneT < 0.6) updateColors(P, dt);
      updateParticlesForPlayer(P, dt);
      updateCamera(P, dt, false);
      P.vis.blink = (Math.sin(performance.now() / 1000 * 0.7) > 0.985);
      P.vis.sq = (P.vis.sq || 0) * Math.exp(-dt * 14);
      R.beatPulse = P.practice ? 0 : Math.pow(1 - AU.beatPhase(), 4);
    },
    draw(ctx, dt) {
      const P = Game.P;
      if (!P || !P.sim) return;
      const p = P.sim.p;
      const { x: cx, y: cy } = P.cam;
      const t = performance.now() / 1000;
      const ic = Game.icon();
      R.drawBackground(ctx, P.colors.bg, cx, cy);
      // attempt label lives in the world
      if (!P.practice || P.attempt <= 1) {
        const ax = 3.5 * 30 - cx, ay = VH - (5.5 * 30 - cy);
        if (ax > -300) A.text(ctx, P.practice ? 'Practice Mode' : `Attempt ${P.attempt}`, ax + 60, ay, 30);
      }
      R.drawObjects(ctx, P.level, cx, cy, t, p, 'back', P.usedSet);
      R.drawEnd(ctx, P.level.endX, cx, cy, t);
      // practice checkpoints
      if (P.practice) for (const c of P.checkpoints) {
        const sx = c.x - cx, sy = VH - (c.y - cy);
        if (sx < -20 || sx > R.VW + 20) continue;
        A.glyph(ctx, 'diamond', sx, sy, 16, '#5cff4f');
      }
      if (p.mode === 'wave' || P.trail.length) {
        const pts = P.trail.filter((q) => q.x > cx - 40);
        if (P.phase === 'run' && p.mode === 'wave') pts.push({ x: p.x, y: p.y });
        R.drawTrail(ctx, pts, cx, cy, ic.c1, p.mini ? 3.5 : 6);
        P.trail = pts.filter((q, i) => i < pts.length - (P.phase === 'run' && p.mode === 'wave' ? 1 : 0));
      }
      if (P.teleFx) {
        const k = P.teleFx.t / 0.25;
        ctx.fillStyle = A.rgba(ic.c2, 0.6 * (1 - k));
        const sx = P.teleFx.x - cx;
        const y0 = VH - (P.teleFx.y0 - cy), y1 = VH - (P.teleFx.y1 - cy);
        ctx.fillRect(sx - 8, Math.min(y0, y1), 16, Math.abs(y1 - y0));
      }
      // ground and ceiling
      R.drawGround(ctx, P.colors.gr, '#ffffff', cx, VH - (P.vis.floor - cy), 1);
      if (P.vis.ceil != null) R.drawGround(ctx, P.colors.gr, '#ffffff', cx, VH - (P.vis.ceil - cy), -1);
      if (P.phase === 'run' || (P.phase === 'done' && P.doneT < 0.6)) R.drawPlayer(ctx, p, P.vis, ic, cx, cy, t);
      R.drawObjects(ctx, P.level, cx, cy, t, p, 'front', P.usedSet);
      R.drawParticles(ctx, cx, cy);
      if (P.coinFx) {
        const k = P.coinFx.t;
        A.drawCoin(ctx, P.coinFx.x - cx, VH - (P.coinFx.y - cy) - k * 60, t * 3, false);
      }
      // HUD
      const S = Game.save.settings;
      if (S.showBar || S.showPct) {
        if (S.showBar) R.drawProgress(ctx, P.phase === 'done' ? 100 : pct(P), S.showPct, P.practice);
        else A.text(ctx, `${Math.floor(pct(P))}%`, R.VW / 2, 14, 12);
      }
      if (P.phase !== 'done') {
        UI.button(ctx, 'pause', R.VW - 20, 20, 30, 30, () => { ctx.translate(-(R.VW - 20), -20); R.drawPauseButton(ctx, UI.hover === 'pause'); }, () => Game.pause(), { circle: true });
      }
      if (P.practice && P.phase !== 'done') {
        UI.button(ctx, 'cp-add', R.VW / 2 - 24, VH - 24, 34, 34, UI.circleBtn(UI.GREEN, 15, 'diamond', 18), () => placeCheckpoint(false), { circle: true });
        UI.button(ctx, 'cp-del', R.VW / 2 + 24, VH - 24, 34, 34, UI.circleBtn(UI.RED, 15, 'x', 13), () => Game.removeCheckpoint(), { circle: true });
      }
      if (P.newBest) {
        const k = P.newBestT;
        const s = k < 0.2 ? k / 0.2 * 1.15 : k < 0.3 ? 1.15 - (k - 0.2) * 1.5 : 1;
        const a = k > 1.3 ? Math.max(0, 1 - (k - 1.3) / 0.3) : 1;
        ctx.save(); ctx.translate(R.VW / 2, VH * 0.42); ctx.scale(s, s); ctx.globalAlpha = a;
        A.text(ctx, 'NEW BEST!', 0, -16, 30, { grad: ['#fff7a8', '#ffb31a'] });
        A.text(ctx, `${P.newBest}%`, 0, 18, 30);
        ctx.restore();
      }
      if (P.phase === 'done') Game.drawComplete(ctx, P, dt);
      if (P.paused) Game.drawPause(ctx, P);
    },
  });

  // Debug helpers (used while testing; harmless in normal play).
  CD.debug = {
    autoplay(inputs) { const P = Game.P; if (!P) return 'not playing'; Game.restart(P.practice); P.auto = inputs; P.autoTick = 0; return 'ok'; },
    ff(seconds) {
      const P = Game.P;
      if (!P) return 'not playing';
      const n = Math.round(seconds * CD.TPS);
      for (let i = 0; i < n && P.phase === 'run'; i++) simTick(P);
      updateCamera(P, 0, true);
      return P.sim.p.x / 30;
    },
  };

  // exposed for scenes.js
  Game.pct = pct;
  Game.CAM_GROUND = CAM_GROUND;
})(typeof globalThis !== 'undefined' ? globalThis : window);
