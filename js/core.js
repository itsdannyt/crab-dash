/* Crab Dash — simulation core.
 * DOM-free and deterministic, so the browser game and the Node level solver run the exact same physics.
 *
 * Units: 1 block = 30 world units, y points up, the ground surface is y = 0.
 * Velocities are in units per frame, where one frame = 1/60 s. Physics runs at 240 ticks/s (STEP = 0.25 frame).
 *
 * Sources for the numbers (all gameplay-critical constants are cited here):
 *  [GDP]  camila314/gdp — decompiled Geometry Dash physics (PlayerObject::updateJump, updateTimeMod,
 *         collidedWithObjectInternal, boostPlayer, GJBaseGameLayer::update).
 *  [WIKI] geometrydash.wiki.gg — Portals (play-area heights), Transporters (pad/orb launch heights per mode).
 *  [SPD]  GD wiki speed-portal table: 8.382 / 10.386 / 12.914 / 15.6 / 19.2 blocks per second.
 *  [SHOT] the reference screenshot supplied with the request (2000x1125, 16:9).
 * Values marked UNVERIFIED are recollections of GD behaviour that no source I could read confirmed.
 */
(function (G) {
  'use strict';
  const CD = G.CD || (G.CD = {});

  const BLOCK = 30;
  const STEP = 0.25;          // [GDP] GJBaseGameLayer::update: stepCount = delta*240, dt passed in frames
  const TPS = 240;

  // [GDP] updateTimeMod. x speed = ps*mult units/frame → 0.9*5.77*60/30 = 10.386 blocks/s, matching [SPD].
  const SPEEDS = [
    { label: '0.5x', ps: 0.7, jump: 10.620032, grav: 0.940199, mult: 5.980002 },
    { label: '1x', ps: 0.9, jump: 11.1800318, grav: 0.958199024, mult: 5.77000189 },
    { label: '2x', ps: 1.1, jump: 11.420032, grav: 0.957199, mult: 5.870002 },
    { label: '3x', ps: 1.3, jump: 11.230032, grav: 0.961199, mult: 6.000002 },
    { label: '4x', ps: 1.6, jump: 11.230032, grav: 0.961199, mult: 6.000002 },
  ];
  const xSpeed = (si) => SPEEDS[si].ps * SPEEDS[si].mult;

  const FLY_GRAV = 0.9582;    // [GDP] ball, spider and flying modes use 0.9582 instead of the speed's gravity
  const TERMINAL = 15;        // [GDP] non-flying fall speed clamp
  const MINI = 0.6;           // mini icon scale (UNVERIFIED: GD's mini icon is drawn at 60%)
  const INNER = 0.3;          // [GDP] solid-death hitbox is getObjectRect(0.3, 0.3)
  const SNAP = 10, SNAP_FLY = 6; // [GDP] snapUpThreshold: 10, flying modes 6
  const MODES = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider'];
  const FLYING = { ship: true, ufo: true, wave: true };
  const BOUNDS = { ship: 10, ufo: 10, wave: 10, ball: 8, spider: 9 }; // [WIKI] Portals: play-area height in blocks
  const WAVE_HITBOX = 10;     // UNVERIFIED: GD's wave hitbox is roughly a third of a block
  const FLIP_KEEP = 0.5;      // UNVERIFIED: velocity kept through a gravity portal / game-mode portal
  const BLUE_PUSH = 0.8;      // UNVERIFIED: blue pad/orb push = 0.8 × the speed's jump velocity

  // Event bit flags returned by tick() — the renderer/audio react to these.
  const EV = { JUMP: 1, LAND: 2, DIE: 4, WIN: 8, PAD: 16, ORB: 32, PORTAL: 64, COIN: 128, FLIP: 256, TELEPORT: 512, SPEED: 1024, CHECK: 2048 };

  function playerSize(p) {
    if (p.mode === 'wave') return p.mini ? WAVE_HITBOX * MINI : WAVE_HITBOX;
    return p.mini ? BLOCK * MINI : BLOCK;
  }

  // ───────────────────────── Launch strengths (pads & orbs) ─────────────────────────
  // [WIKI] Transporters: rise in blocks for each pad/orb, per game mode, [normal, mini].
  // The launch velocity for each is derived at startup by simulating this engine's own physics
  // and bisecting on velocity until the rise matches the table (see deriveLaunches below).
  const LAUNCH_HEIGHTS = {
    padY: { cube: [4.533, 3.133], ship: [2.6166, 3.166], ball: [2.85, 1.66], ufo: [2, 2.5166], robot: [4.533, 3.6166], spider: [2.75, 1.6166] },
    padP: { cube: [1.933, 1.166], ship: [1.166, 0.65], ball: [1.2833, 1.8166], ufo: [1.2, 0.65], robot: [2.1366, 1.3], spider: [1.1833, 0.75] },
    padR: { cube: [6.533, 4.533], ship: [4.233, 2.2833], ball: [4.533, 2.9], ufo: [2.95, 1.466], robot: [7.433, 4.533], spider: [4.533, 2.833] },
    orbY: { cube: [2.3833, 1.35], ship: [2.85, 3.5], ball: [1.733, 1.1], ufo: [2.1, 2.2], robot: [2.1, 1.2166], spider: [1.633, 1.05] },
    orbP: { cube: [1.0833, 0.6833], ship: [0.9, 0.566], ball: [1.0166, 0.65], ufo: [0.66, 0.366], robot: [1.2166, 0.766], spider: [0.7833, 0.5] },
    orbR: { cube: [4.533, 2.866], ship: [4.533, 3.5], ball: [3.66, 2.266], ufo: [4.3, 2.3166], robot: [4.433, 2.75], spider: [3.566, 2.133] },
    // Green orb: the wiki lists cube and ship only; other modes use the cube's green/yellow velocity ratio.
    orbG: { cube: [1.9583, 1.2125], ship: [2.03, 1.1167] },
  };
  let LAUNCH = null; // LAUNCH[kind][mode][mini?1:0][speedIndex] = velocity (units/frame)

  // ───────────────────────── Player ─────────────────────────
  function newPlayer(level) {
    return {
      x: 0, y: BLOCK / 2, vy: 0, prevX: 0, prevY: BLOCK / 2,
      mode: level.startMode || 'cube', mini: !!level.startMini, flip: false, speed: level.startSpeed == null ? 1 : level.startSpeed,
      onGround: true, rising: false, accel: false, robotT: 0, touchedPad: false,
      buffer: false, lock: false,
      floorY: 0, ceilY: Infinity,
      dead: false, done: false,
      used: [], lastUsed: -1,
      coins: 0, jumps: 0, t: 0,
    };
  }

  function clonePlayer(p) {
    const c = Object.assign({}, p);
    c.used = p.used.slice();
    return c;
  }

  // Triggers already fired this attempt. Only entries still near the player matter (the player only moves
  // forward), so a slot is recycled once its object is behind — nothing the player still touches is forgotten.
  function markUsed(sim, p, id) {
    p.lastUsed = id;
    const u = p.used, objs = sim.level.objs, behind = p.x - 60;
    for (let i = 0; i < u.length; i++) if (objs[u[i]].x1 < behind) { u[i] = id; return; }
    u.push(id);
  }
  function isUsed(p, id) { const u = p.used; for (let i = 0; i < u.length; i++) if (u[i] === id) return true; return false; }

  function setBounds(p, mode, floorBlocks) {
    const H = BOUNDS[mode];
    if (H) {
      p.floorY = Math.max(0, floorBlocks || 0) * BLOCK;
      p.ceilY = p.floorY + H * BLOCK;
    } else {
      p.floorY = 0;
      p.ceilY = Infinity;
    }
  }

  // ───────────────────────── Velocity update (per tick) ─────────────────────────
  function updateVelocity(sim, p, hold) {
    const g = p.flip ? -1 : 1;
    let vr = p.vy * g; // velocity relative to gravity: + means moving away from the gravity side
    const S = SPEEDS[p.speed];
    const m = p.mode;
    let ev = 0;

    if (FLYING[m]) {
      const v16 = p.mini ? 0.85 : 1; // [GDP] flying mini factor
      const up = 8 / v16, down = -6.4 / v16; // [GDP] fall/rise caps (8, -0.8*8)
      if (p.accel && ((vr >= 0 && vr < up) || (vr <= 0 && vr > down))) p.accel = false;
      const falling = vr < 0;
      if (m === 'wave') {
        const X = xSpeed(p.speed) * (p.mini ? 2 : 1); // 45° slope; mini wave is 2:1
        vr = hold ? X : -X;
      } else if (m === 'ufo') {
        if (p.buffer && hold) {
          p.buffer = false;
          const f = (p.mini ? 8 : 7) * v16; // [GDP] UFO flap velocity
          if (f > vr) vr = f;
          p.jumps++;
          ev |= EV.JUMP;
        }
        vr -= FLY_GRAV * STEP * (vr < 0 ? 0.8 : 1.2) * 0.5 / v16; // [GDP]
      } else { // ship
        let a;
        if (hold) {
          a = (p.accel && vr >= 0) ? -0.8 * FLY_GRAV * (falling ? 0.5 : 0.4) / v16 : FLY_GRAV * (falling ? 0.5 : 0.4) / v16;
        } else {
          a = -(falling ? 0.8 : 1.2) * FLY_GRAV * (p.accel ? (falling ? 0.5 : 0.4) : 0.4) / v16;
        }
        vr += a * STEP;
      }
      if (!p.accel && m !== 'wave') {
        if (vr < down) vr = down;
        if (vr > up) vr = up;
      }
      p.vy = vr * g;
      return ev;
    }

    const v16 = p.mini ? 0.8 : 1; // [GDP] non-flying mini factor
    let gr, fb;
    if (m === 'ball' || m === 'spider') { gr = FLY_GRAV; fb = 0.6; }
    else if (m === 'robot') { gr = S.grav; fb = 0.9; }
    else { gr = S.grav; fb = 1; }

    const wantsJump = p.onGround && hold && (m === 'robot' ? p.buffer : true);
    if (wantsJump) {
      if (m === 'spider') {
        spiderTeleport(sim, p);
        p.lock = true; p.buffer = false; p.jumps++;
        return EV.TELEPORT | EV.JUMP;
      }
      p.onGround = false; p.rising = true; p.buffer = false; p.touchedPad = false; p.robotT = 0;
      vr = S.jump * (m === 'robot' ? 0.5 : 1) * v16; // [GDP] robot uses half the jump start velocity
      p.jumps++;
      ev |= EV.JUMP;
      if (m === 'ball') {
        // [GDP] the ball flips gravity and keeps 60% of the launch velocity; holding does not repeat.
        const vyWorld = vr * g;
        p.flip = !p.flip;
        p.vy = vyWorld * 0.6;
        p.lock = true;
        return ev | EV.FLIP;
      }
    } else if (p.rising) {
      if (m === 'robot' && hold && !p.touchedPad && p.robotT < 1.5) {
        p.robotT += STEP / 10; // [GDP] robot hold: gravity cancelled for up to 15 frames
      } else {
        vr -= gr * fb * STEP;
      }
      if (vr < 0) p.rising = false;
    } else {
      vr -= gr * fb * STEP;
      if (vr < -TERMINAL) vr = -TERMINAL;
    }
    p.vy = vr * g;
    return ev;
  }

  function spiderTeleport(sim, p) {
    const g = p.flip ? -1 : 1;
    const h = playerSize(p) / 2;
    let target = g > 0 ? p.ceilY : p.floorY;
    if (g < 0 && !isFinite(target)) target = 0;
    const x0 = p.x - h, x1 = p.x + h;
    forEachNear(sim.level, x0, x1, (o) => {
      if (o.k !== 'solid' || !(x1 > o.x0 && x0 < o.x1)) return;
      if (g > 0 && o.y0 >= p.y + h - 0.5 && o.y0 < target) target = o.y0;
      if (g < 0 && o.y1 <= p.y - h + 0.5 && o.y1 > target) target = o.y1;
    });
    p.flip = !p.flip;
    p.vy = 0;
    p.rising = false;
    if (isFinite(target)) {
      p.y = g > 0 ? target - h : target + h;
      p.onGround = true;
    } else {
      p.onGround = false;
    }
    p.teleFrom = p.prevY;
  }

  // ───────────────────────── Level spatial index ─────────────────────────
  // Objects are bucketed by 30-unit column so each tick only looks at a handful of them.
  let stamp = 1;
  function forEachNear(level, x0, x1, fn) {
    const c0 = Math.max(0, Math.floor(x0 / BLOCK) - level.colBase), c1 = Math.min(level.cols.length - 1, Math.floor(x1 / BLOCK) - level.colBase);
    const s = ++stamp;
    for (let c = c0; c <= c1; c++) {
      const col = level.cols[c];
      if (!col) continue;
      for (let i = 0; i < col.length; i++) {
        const o = col[i];
        if (o._s === s) continue;
        o._s = s;
        fn(o);
      }
    }
  }

  // ───────────────────────── Collision & triggers ─────────────────────────
  function rectHit(o, x0, y0, x1, y1) { return x1 > o.x0 && x0 < o.x1 && y1 > o.y0 && y0 < o.y1; }
  function circleRectHit(cx, cy, r, x0, y0, x1, y1) {
    const nx = cx < x0 ? x0 : cx > x1 ? x1 : cx, ny = cy < y0 ? y0 : cy > y1 ? y1 : cy;
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // Gather the objects near [x0, x1] into a reusable scratch list (one column scan per tick).
  const NEAR = [];
  function gather(level, x0, x1) {
    NEAR.length = 0;
    const c0 = Math.max(0, Math.floor(x0 / BLOCK) - level.colBase), c1 = Math.min(level.cols.length - 1, Math.floor(x1 / BLOCK) - level.colBase);
    const s = ++stamp;
    for (let c = c0; c <= c1; c++) {
      const col = level.cols[c];
      if (!col) continue;
      for (let i = 0; i < col.length; i++) {
        const o = col[i];
        if (o._s === s) continue;
        o._s = s;
        NEAR.push(o);
      }
    }
    return NEAR;
  }

  function collide(sim, p, hold) {
    const L = sim.level;
    let ev = 0;
    const s = playerSize(p), h = s / 2;
    const g = p.flip ? -1 : 1;
    const fly = !!FLYING[p.mode];
    const T = fly ? SNAP_FLY : SNAP;
    const canCeil = fly || p.mode === 'ball'; // [GDP] only flying modes and the ball snap under ceilings
    const dy = p.y - p.prevY;
    const wasGround = p.onGround;
    p.onGround = false;

    // Play-area floor and ceiling (the ground in cube/robot mode). These block but never kill.
    if (p.y - h < p.floorY) {
      p.y = p.floorY + h;
      if (p.vy < 0) p.vy = 0;
      if (g > 0) { p.onGround = true; p.rising = false; }
    }
    if (p.y + h > p.ceilY) {
      p.y = p.ceilY - h;
      if (p.vy > 0) p.vy = 0;
      if (g < 0) { p.onGround = true; p.rising = false; }
    }

    const near = gather(L, p.x - h - 45, p.x + h + 45);
    const n = near.length;

    // Solids — phase 1: find landing / ceiling snaps.
    const x0 = p.x - h, x1 = p.x + h;
    let landY = null, ceilY = null;
    const vr = p.vy * g;
    const by0 = p.y - h, by1 = p.y + h;
    // [GDP] the wave (dart) never snaps onto blocks: it only slides along the play-area floor and ceiling.
    const snaps = p.mode !== 'wave';
    for (let i = 0; i < n && snaps; i++) {
      const o = near[i];
      if (o.k !== 'solid') continue;
      if (!(x1 > o.x0 && x0 < o.x1 && by1 > o.y0 && by0 < o.y1)) continue;
      // a surface flush with (or beyond) the play-area edge cannot be stood on from inside it
      if (g > 0 ? o.y1 + 2 * h > p.ceilY + 0.01 : o.y0 - 2 * h < p.floorY - 0.01) {
        if (g > 0 ? o.y1 >= p.ceilY : o.y0 <= p.floorY) continue;
      }
      if (g > 0) {
        if (vr <= 0 && (by0 + T >= o.y1 || by0 - dy + T >= o.y1)) { if (landY === null || o.y1 > landY) landY = o.y1; continue; }
        if (canCeil && vr >= 0 && (by1 - T <= o.y0 || by1 - dy - T <= o.y0)) { if (ceilY === null || o.y0 < ceilY) ceilY = o.y0; }
      } else {
        if (vr <= 0 && (by1 - T <= o.y0 || by1 - dy - T <= o.y0)) { if (landY === null || o.y0 < landY) landY = o.y0; continue; }
        if (canCeil && vr >= 0 && (by0 + T >= o.y1 || by0 - dy + T >= o.y1)) { if (ceilY === null || o.y1 > ceilY) ceilY = o.y1; }
      }
    }
    if (landY !== null) {
      p.y = landY + h * g;
      p.vy = 0;
      p.onGround = true;
      p.rising = false;
    }
    if (ceilY !== null) {
      p.y = ceilY - h * g;
      if (p.vy * g > 0) p.vy = 0;
    }
    if (p.onGround && !wasGround) { ev |= EV.LAND; p.touchedPad = false; }

    // Solids — phase 2: inner hitbox inside any solid is death. Hazards use the full hitbox.
    const ih = h * INNER;
    const px0 = p.x - h, px1 = p.x + h, py0 = p.y - h, py1 = p.y + h;
    const ix0 = p.x - ih, ix1 = p.x + ih, iy0 = p.y - ih, iy1 = p.y + ih;
    let dead = p.y > 4000 || p.y < -4000;
    for (let i = 0; i < n && !dead; i++) {
      const o = near[i];
      if (o.k === 'solid') {
        if (ix1 > o.x0 && ix0 < o.x1 && iy1 > o.y0 && iy0 < o.y1) dead = true;
      } else if (o.k === 'haz') {
        if (o.shape === 'circle') { if (circleRectHit(o.cx, o.cy, o.r, px0, py0, px1, py1)) dead = true; }
        else if (px1 > o.x0 && px0 < o.x1 && py1 > o.y0 && py0 < o.y1) dead = true;
      }
    }
    if (dead) {
      p.dead = true;
      return ev | EV.DIE;
    }

    // Triggers: pads, orbs, portals, coins.
    for (let i = 0; i < n; i++) {
      const o = near[i];
      if (o.k !== 'trig' || isUsed(p, o.id)) continue;
      const hit = o.shape === 'circle' ? circleRectHit(o.cx, o.cy, o.r, px0, py0, px1, py1) : (px1 > o.x0 && px0 < o.x1 && py1 > o.y0 && py0 < o.y1);
      if (!hit) continue;
      ev |= applyTrigger(sim, p, o, hold);
    }

    if (p.x >= L.endX) { p.done = true; ev |= EV.WIN; }
    return ev;
  }

  function flipGravity(p, flip) {
    if (p.flip === flip) return false;
    p.flip = flip;
    p.vy *= FLIP_KEEP;
    p.onGround = false;
    p.rising = false;
    return true;
  }

  function launch(p, kind) {
    if (p.mode === 'wave') return false;
    const g = p.flip ? -1 : 1;
    const v = LAUNCH[kind][p.mode][p.mini ? 1 : 0][p.speed];
    p.vy = v * g;
    p.rising = true;
    p.accel = true;
    p.onGround = false;
    return true;
  }

  function applyTrigger(sim, p, o, hold) {
    const S = SPEEDS[p.speed];
    switch (o.type) {
      case 'pad': {
        if (p.mode === 'wave') { markUsed(sim, p, o.id); return 0; }
        markUsed(sim, p, o.id);
        if (o.c === 'B') {
          flipGravity(p, !p.flip);
          p.vy = -BLUE_PUSH * S.jump * (p.flip ? -1 : 1);
          p.accel = true;
          return EV.PAD | EV.FLIP;
        }
        launch(p, 'pad' + o.c);
        p.touchedPad = true;
        return EV.PAD;
      }
      case 'orb': {
        if (!(p.buffer && hold) || p.mode === 'wave') return 0;
        markUsed(sim, p, o.id);
        p.buffer = false;
        if (o.c === 'B') {
          flipGravity(p, !p.flip);
          p.vy = -BLUE_PUSH * S.jump * (p.flip ? -1 : 1);
          p.accel = true;
          return EV.ORB | EV.FLIP;
        }
        if (o.c === 'G') {
          flipGravity(p, !p.flip);
          launch(p, 'orbG');
          return EV.ORB | EV.FLIP;
        }
        launch(p, 'orb' + o.c);
        return EV.ORB;
      }
      case 'grav': {
        markUsed(sim, p, o.id);
        return flipGravity(p, o.flip) ? (EV.PORTAL | EV.FLIP) : 0;
      }
      case 'mode': {
        markUsed(sim, p, o.id);
        const same = p.mode === o.mode;
        if (!same) {
          p.vy *= FLIP_KEEP;
          p.mode = o.mode;
          p.rising = false; p.accel = false; p.robotT = 0; p.onGround = false;
          p.lock = false;
        }
        setBounds(p, o.mode, o.floor);
        const h = playerSize(p) / 2;
        if (p.y - h < p.floorY) p.y = p.floorY + h;
        if (p.y + h > p.ceilY) p.y = p.ceilY - h;
        return EV.PORTAL;
      }
      case 'size': {
        markUsed(sim, p, o.id);
        if (p.mini === o.mini) return 0;
        const oh = playerSize(p) / 2;
        p.mini = o.mini;
        const nh = playerSize(p) / 2;
        p.y += (nh - oh) * (p.flip ? -1 : 1);
        return EV.PORTAL;
      }
      case 'speed': {
        markUsed(sim, p, o.id);
        if (p.speed === o.speed) return 0;
        p.speed = o.speed;
        return EV.SPEED;
      }
      case 'coin': {
        markUsed(sim, p, o.id);
        p.coins |= 1 << o.i;
        return EV.COIN;
      }
    }
    return 0;
  }

  // ───────────────────────── Simulation ─────────────────────────
  function tick(sim, held, pressed) {
    const p = sim.p;
    if (p.dead || p.done) return 0;
    if (pressed) p.buffer = true;
    if (!held) { p.buffer = false; p.lock = false; }
    const hold = held && !p.lock;
    p.prevX = p.x;
    p.prevY = p.y;
    let ev = updateVelocity(sim, p, hold);
    p.x += xSpeed(p.speed) * STEP;
    p.y += p.vy * STEP;
    ev |= collide(sim, p, hold);
    p.t += STEP;
    return ev;
  }

  function createSim(level) {
    const sim = { level, p: newPlayer(level) };
    setBounds(sim.p, sim.p.mode, level.startFloor || 0);
    return sim;
  }

  // ───────────────────────── Level compile ─────────────────────────
  // Raw level objects use block coordinates (x from the start line, y from the ground) — see levels.js.
  // Hitboxes:
  //  spike: 6×12 units centred in its cell (UNVERIFIED: GD's spike hitbox as seen in its hitbox viewer).
  //  small spike: same width, half the height, centred in its half-height triangle.
  //  saw: the lethal zone is the solid inner disc that is drawn (radius 0.62 of the drawn saw) — what you see is what kills.
  //  pads / orbs / portals / coins: their drawn shape.
  function compileLevel(def) {
    const objs = [];
    let id = 0;
    const B = BLOCK;
    const seenCells = new Set();
    for (const r of def.objects) {
      if (r.t === 'block') {
        const key = `${r.x},${r.y}`;
        if (seenCells.has(key)) continue;
        seenCells.add(key);
      }
      const o = { id: id++, t: r.t, raw: r };
      const cx = r.x * B, cy = r.y * B; // r.x/r.y are the cell's bottom-left corner in blocks
      switch (r.t) {
        case 'block': case 'slab': case 'pillar': case 'plate': {
          const w = (r.w || 1) * B, hgt = r.t === 'slab' ? B / 2 : (r.h || 1) * B;
          const yo = r.t === 'slab' && r.top ? B / 2 : 0;
          o.k = 'solid'; o.x0 = cx; o.x1 = cx + w; o.y0 = cy + yo; o.y1 = cy + yo + hgt;
          break;
        }
        case 'spike': case 'mspike': {
          const rot = r.rot || 0; // 0 up, 90 right, 180 down, 270 left
          const small = r.t === 'mspike';
          let hx = 3, hy = small ? 3 : 6;
          let mx = cx + B / 2, my = cy + (small ? B / 4 : B / 2);
          if (small && rot === 180) my = cy + B - B / 4;
          if (rot === 90 || rot === 270) {
            [hx, hy] = [hy, hx];
            my = cy + B / 2;
            mx = small ? (rot === 90 ? cx + B / 4 : cx + B - B / 4) : cx + B / 2;
          }
          o.k = 'haz'; o.shape = 'rect';
          o.x0 = mx - hx; o.x1 = mx + hx; o.y0 = my - hy; o.y1 = my + hy;
          o.vx0 = cx; o.vx1 = cx + B; o.vy0 = cy; o.vy1 = cy + B; o.rot = rot;
          break;
        }
        case 'saw': {
          const R = (r.r || 1) * B;
          o.k = 'haz'; o.shape = 'circle';
          o.cx = cx; o.cy = cy; o.R = R; o.r = R * 0.62;
          o.x0 = cx - R; o.x1 = cx + R; o.y0 = cy - R; o.y1 = cy + R;
          break;
        }
        case 'pad': {
          const rot = r.rot || 0; // 0 floor, 180 ceiling
          o.k = 'trig'; o.type = 'pad'; o.c = r.c || 'Y'; o.rot = rot;
          o.x0 = cx + 2; o.x1 = cx + B - 2;
          if (rot === 180) { o.y0 = cy + B - 8; o.y1 = cy + B; } else { o.y0 = cy; o.y1 = cy + 8; }
          break;
        }
        case 'orb': {
          o.k = 'trig'; o.type = 'orb'; o.c = r.c || 'Y'; o.shape = 'circle';
          o.cx = cx + B / 2; o.cy = cy + B / 2; o.r = 18;
          o.x0 = o.cx - 18; o.x1 = o.cx + 18; o.y0 = o.cy - 18; o.y1 = o.cy + 18;
          break;
        }
        case 'portal': {
          // r.p: 'cube' 'ship' 'ball' 'ufo' 'wave' 'robot' 'spider' | 'gravUp' 'gravDown' | 'mini' 'big'
          o.k = 'trig';
          const pcx = cx + B / 2, pcy = cy + B / 2;
          o.x0 = pcx - 13; o.x1 = pcx + 13; o.y0 = pcy - 43; o.y1 = pcy + 43;
          o.cx = pcx; o.cy = pcy; o.p = r.p;
          if (MODES.includes(r.p)) {
            o.type = 'mode'; o.mode = r.p;
            const H = BOUNDS[r.p] || 0;
            o.floor = r.floor != null ? r.floor : Math.max(0, Math.round(r.y + 0.5 - H / 2));
          } else if (r.p === 'gravUp' || r.p === 'gravDown') {
            o.type = 'grav'; o.flip = r.p === 'gravUp';
          } else if (r.p === 'mini' || r.p === 'big') {
            o.type = 'size'; o.mini = r.p === 'mini';
          }
          break;
        }
        case 'speed': {
          o.k = 'trig'; o.type = 'speed'; o.speed = r.s;
          const pcx = cx + B / 2, pcy = cy + B / 2;
          o.x0 = pcx - 17; o.x1 = pcx + 17; o.y0 = pcy - 30; o.y1 = pcy + 30;
          o.cx = pcx; o.cy = pcy;
          break;
        }
        case 'coin': {
          o.k = 'trig'; o.type = 'coin'; o.i = r.i; o.shape = 'circle';
          o.cx = cx + B / 2; o.cy = cy + B / 2; o.r = 15;
          o.x0 = o.cx - 15; o.x1 = o.cx + 15; o.y0 = o.cy - 15; o.y1 = o.cy + 15;
          break;
        }
        default: {
          // decoration — drawn only
          o.k = 'deco';
          const w = (r.w || 1) * B, hgt = (r.h || 1) * B;
          o.x0 = cx; o.x1 = cx + w; o.y0 = cy; o.y1 = cy + hgt;
        }
      }
      objs.push(o);
    }
    const endX = def.length * B;
    let minX = 0, maxX = endX;
    for (const o of objs) { if (o.x0 < minX) minX = o.x0; if (o.x1 > maxX) maxX = o.x1; }
    const colBase = Math.floor(minX / B) - 2;
    const nCols = Math.ceil(maxX / B) - colBase + 4;
    const cols = new Array(nCols);
    for (const o of objs) {
      const a = Math.floor(o.x0 / B) - colBase, b = Math.floor((o.x1 - 0.001) / B) - colBase;
      for (let c = a; c <= b; c++) (cols[c] || (cols[c] = [])).push(o);
    }
    for (const o of objs) o._s = 0;
    return {
      def, objs, cols, colBase, endX,
      startMode: def.startMode || 'cube', startSpeed: def.startSpeed == null ? 1 : def.startSpeed, startMini: !!def.startMini,
      startFloor: def.startFloor || 0,
      coinCount: objs.filter((o) => o.type === 'coin').length,
    };
  }

  // ───────────────────────── Deriving pad/orb velocities ─────────────────────────
  // Rise of a free launch at velocity v, using this engine's own tick loop in empty space.
  function riseFor(mode, mini, speed, v) {
    const empty = { cols: [], colBase: 0, endX: 1e9 };
    const sim = { level: empty, p: newPlayer({ startMode: mode, startMini: mini, startSpeed: speed }) };
    const p = sim.p;
    p.floorY = -1e6; p.ceilY = 1e6; p.y = 0; p.onGround = false;
    p.vy = v; p.rising = true; p.accel = true;
    let maxY = 0;
    for (let i = 0; i < 4000; i++) {
      tick(sim, false, false);
      if (p.y > maxY) maxY = p.y;
      if (p.vy < 0 && p.y < maxY - 1) break;
    }
    return maxY;
  }

  function deriveLaunches() {
    LAUNCH = {};
    for (const kind of Object.keys(LAUNCH_HEIGHTS)) {
      LAUNCH[kind] = {};
      for (const mode of MODES) {
        if (mode === 'wave') continue;
        LAUNCH[kind][mode] = [[], []];
        for (let mi = 0; mi < 2; mi++) {
          for (let si = 0; si < SPEEDS.length; si++) {
            let hb = LAUNCH_HEIGHTS[kind][mode] && LAUNCH_HEIGHTS[kind][mode][mi];
            let v;
            if (hb == null) {
              // orbG outside cube/ship: scale this mode's yellow-orb velocity by the cube's green/yellow ratio
              const ratio = LAUNCH.orbG.cube[mi][si] / LAUNCH.orbY.cube[mi][si];
              v = LAUNCH.orbY[mode][mi][si] * ratio;
            } else {
              const target = hb * BLOCK;
              let lo = 0, hi = 40;
              for (let it = 0; it < 40; it++) {
                const mid = (lo + hi) / 2;
                if (riseFor(mode, mi === 1, si, mid) < target) lo = mid; else hi = mid;
              }
              v = (lo + hi) / 2;
            }
            LAUNCH[kind][mode][mi][si] = v;
          }
        }
      }
    }
    // Pads also cover the wave list so lookups never fail; the wave ignores them.
    return LAUNCH;
  }
  deriveLaunches();

  // Seconds it takes to reach x (in blocks) given the level's speed portals.
  function timeAtX(level, xBlocks) {
    const portals = level.objs.filter((o) => o.type === 'speed').sort((a, b) => a.x0 - b.x0);
    let speed = level.startSpeed, x = 0, t = 0;
    const target = xBlocks * BLOCK;
    for (const s of portals) {
      // the player (half-width 15) touches the portal when its centre reaches s.x0 - 15
      const sx = s.x0 - 15;
      if (sx >= target) break;
      if (sx > x) { t += (sx - x) / (xSpeed(speed) * 60); x = sx; }
      speed = s.speed;
    }
    t += (target - x) / (xSpeed(speed) * 60);
    return t;
  }

  Object.assign(CD, {
    BLOCK, STEP, TPS, SPEEDS, MODES, FLYING, BOUNDS, EV, MINI,
    xSpeed, playerSize, newPlayer, clonePlayer, createSim, tick, compileLevel, forEachNear,
    timeAtX, launchTable: () => LAUNCH, riseFor, setBounds,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
