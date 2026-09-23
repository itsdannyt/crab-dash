/* Crab Dash — world renderer.
 * Screen space is 320 units tall (Geometry Dash's design height); width follows the window's aspect ratio.
 * World → screen: sx = wx - camX, sy = 320 - (wy - camY). Colours of the default theme were sampled from the
 * reference screenshot: sky #041942 at the top → #0d50db at the ground, tiles darker than the gaps, a white
 * ground line that fades out toward both screen edges. */
(function (G) {
  'use strict';
  const CD = G.CD;
  const A = CD.art;
  const R = (CD.render = {});
  const VH = 320;
  const GROUND_Y = 87; // [SHOT] ground line sits 87 units above the screen bottom (305 px of 1123)

  // ───────────────────────── canvas & sprite cache ─────────────────────────
  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.cache = new Map();
    R.resize();
  };
  R.resize = function () {
    const dpr = Math.min(2, G.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(R.canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(R.canvas.clientHeight * dpr));
    if (R.canvas.width !== w || R.canvas.height !== h) { R.canvas.width = w; R.canvas.height = h; }
    R.k = h / VH;
    R.VW = w / R.k;
    R.VH = VH;
    R.cache.clear();
    R.bgTile = null;
  };
  R.screen = function () { R.ctx.setTransform(R.k, 0, 0, R.k, 0, 0); };

  function sprite(key, wUnits, hUnits, draw) {
    let c = R.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(wUnits * R.k));
    c.height = Math.max(1, Math.ceil(hUnits * R.k));
    const x = c.getContext('2d');
    x.scale(R.k, R.k);
    draw(x);
    c.uw = wUnits; c.uh = hUnits;
    R.cache.set(key, c);
    return c;
  }
  R.sprite = sprite;

  // ───────────────────────── background ─────────────────────────
  // A mosaic of darker panels over a vertical gradient (panels ~23-114 units, gaps 7 units, like the reference).
  function mosaic() {
    if (R.bgTile) return R.bgTile;
    const W = 768, H = 420;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const rects = [];
    const split = (x, y, w, h, d) => {
      if (d > 4 || (w < 120 && h < 120) || (d > 1 && rnd() < 0.18)) { rects.push([x, y, w, h]); return; }
      if (w > h * (0.8 + rnd() * 0.6)) { const c = Math.round(w * (0.3 + rnd() * 0.4)); split(x, y, c, h, d + 1); split(x + c, y, w - c, h, d + 1); }
      else { const c = Math.round(h * (0.3 + rnd() * 0.4)); split(x, y, w, c, d + 1); split(x, y + c, w, h - c, d + 1); }
    };
    split(0, 0, W, H, 0);
    R.bgTile = { W, H, rects };
    return R.bgTile;
  }

  R.drawBackground = function (ctx, bg, camX, camY) {
    const VW = R.VW;
    // [SHOT] sky brightness relative to its colour at the ground line (y 72.7% down):
    // 5% → 0.37, 27% → 0.58, 50% → 0.80, 62% → 0.92, 70% → 1.0
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, A.shade(bg, -0.65)); g.addColorStop(0.27, A.shade(bg, -0.42)); g.addColorStop(0.5, A.shade(bg, -0.2));
    g.addColorStop(0.62, A.shade(bg, -0.08)); g.addColorStop(0.72, bg); g.addColorStop(1, bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    const t = mosaic();
    const ox = -((camX * 0.1) % t.W + t.W) % t.W;
    const oy = VH - t.H + Math.max(-60, Math.min(60, -camY * 0.06)) + 30;
    ctx.fillStyle = 'rgba(0,0,12,0.16)';
    for (let rep = ox - t.W; rep < VW; rep += t.W) {
      for (const [x, y, w, h] of t.rects) {
        const sx = rep + x + 3.5, sy = oy + y + 3.5;
        if (sx > VW || sx + w < 0) continue;
        ctx.fillRect(sx, sy, w - 7, h - 7);
      }
    }
  };

  // ───────────────────────── ground / ceiling ─────────────────────────
  // sy = screen y of the ground line; dir = +1 ground below the line, -1 ceiling above it.
  R.drawGround = function (ctx, gr, lineCol, camX, sy, dir, lineAlpha = 1) {
    const VW = R.VW;
    const y0 = dir > 0 ? sy : sy - VH;
    const h = VH;
    if (dir > 0 ? sy > VH + 2 : sy < -2) return;
    const g = ctx.createLinearGradient(0, sy, 0, sy + dir * 130);
    g.addColorStop(0, gr); g.addColorStop(1, A.shade(gr, -0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, VW, h);
    // tiles 128 units wide with 12-unit darker gaps between them ([SHOT]: ~450 px tiles, ~40 px gaps at 2000 px)
    ctx.fillStyle = 'rgba(0,0,20,0.2)';
    const TW = 128;
    const off = -(((camX % TW) + TW) % TW);
    for (let x = off - TW; x < VW + TW; x += TW) {
      if (dir > 0) ctx.fillRect(x + 6, sy + 6, TW - 12, 116);
      else ctx.fillRect(x + 6, sy - 122, TW - 12, 116);
    }
    // edge shadows
    const e = VW * 0.16;
    const lg = ctx.createLinearGradient(0, 0, e, 0);
    lg.addColorStop(0, 'rgba(0,0,10,0.45)'); lg.addColorStop(1, 'rgba(0,0,10,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, y0, e, h);
    const rg = ctx.createLinearGradient(VW - e, 0, VW, 0);
    rg.addColorStop(0, 'rgba(0,0,10,0)'); rg.addColorStop(1, 'rgba(0,0,10,0.45)');
    ctx.fillStyle = rg; ctx.fillRect(VW - e, y0, e, h);
    // the line: full brightness across the middle, fading out over the outer ~30% on each side
    const lgrad = ctx.createLinearGradient(0, 0, VW, 0);
    const c0 = A.rgba(lineCol, 0), c1 = A.rgba(lineCol, lineAlpha);
    lgrad.addColorStop(0.04, c0); lgrad.addColorStop(0.34, c1); lgrad.addColorStop(0.66, c1); lgrad.addColorStop(0.96, c0);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = lgrad;
    ctx.fillRect(0, sy - 3, VW, 6);
    ctx.globalAlpha = 1;
    ctx.fillRect(0, sy - 1.3, VW, 2.6);
    ctx.restore();
  };

  // ───────────────────────── object sprites ─────────────────────────
  const GLOW = 5;
  function blockSprite(mask, style) {
    // mask bits: 1 up, 2 right, 4 down, 8 left (neighbour present)
    return sprite(`blk${mask}${style || ''}`, 30, 30, (x) => {
      x.fillStyle = '#000';
      x.fillRect(0, 0, 30, 30);
      const g = x.createLinearGradient(0, 0, 0, 30);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0.0)');
      x.fillStyle = g; x.fillRect(0, 0, 30, 30);
      // inner grid lines where the block touches another
      x.strokeStyle = 'rgba(255,255,255,0.13)'; x.lineWidth = 1;
      x.strokeRect(3.5, 3.5, 23, 23);
      x.fillStyle = '#fff';
      if (!(mask & 1)) x.fillRect(0, 0, 30, 2);
      if (!(mask & 4)) x.fillRect(0, 28, 30, 2);
      if (!(mask & 8)) x.fillRect(0, 0, 2, 30);
      if (!(mask & 2)) x.fillRect(28, 0, 2, 30);
      if (style === 'slab') { x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(6, 13, 18, 2); }
    });
  }
  function glowSprite(side) {
    // soft light that spills past an exposed edge; side 0 up, 1 right, 2 down, 3 left
    return sprite(`glow${side}`, 30 + GLOW * 2, 30 + GLOW * 2, (x) => {
      x.translate(GLOW, GLOW);
      const grad = (x0, y0, x1, y1) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); return g; };
      if (side === 0) { x.fillStyle = grad(0, 0, 0, -GLOW); x.fillRect(0, -GLOW, 30, GLOW); }
      if (side === 2) { x.fillStyle = grad(0, 30, 0, 30 + GLOW); x.fillRect(0, 30, 30, GLOW); }
      if (side === 3) { x.fillStyle = grad(0, 0, -GLOW, 0); x.fillRect(-GLOW, 0, GLOW, 30); }
      if (side === 1) { x.fillStyle = grad(30, 0, 30 + GLOW, 0); x.fillRect(30, 0, GLOW, 30); }
    });
  }
  function spikeSprite(small) {
    return sprite(small ? 'mspike' : 'spike', 30 + 12, 30 + 12, (x) => {
      x.translate(6, 6);
      const h = small ? 14 : 30, w0 = small ? 4 : 0.5, w1 = small ? 26 : 29.5;
      x.beginPath(); x.moveTo(w0, 30); x.lineTo(15, 30 - h); x.lineTo(w1, 30); x.closePath();
      x.save(); x.shadowColor = 'rgba(160,215,255,0.9)'; x.shadowBlur = 5 * R.k; x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); x.restore();
      const g = x.createLinearGradient(0, 30 - h, 0, 30);
      g.addColorStop(0, '#000'); g.addColorStop(0.55, '#000'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      x.fillStyle = g; x.fill();
      x.lineJoin = 'miter'; x.strokeStyle = '#fff'; x.lineWidth = 1.8; x.stroke();
    });
  }

  // Neighbour masks for blocks, computed once per level (render-only data).
  R.prepareLevel = function (level) {
    const cells = new Set();
    for (const o of level.objs) if (o.t === 'block') cells.add(`${o.raw.x},${o.raw.y}`);
    for (const o of level.objs) {
      if (o.t !== 'block') continue;
      const { x, y } = o.raw;
      o.mask = (cells.has(`${x},${y + 1}`) ? 1 : 0) | (cells.has(`${x + 1},${y}`) ? 2 : 0) | (cells.has(`${x},${y - 1}`) ? 4 : 0) | (cells.has(`${x - 1},${y}`) ? 8 : 0);
    }
  };

  // ───────────────────────── objects ─────────────────────────
  let drawStamp = 1;
  R.drawObjects = function (ctx, level, camX, camY, t, player, layer, usedSet) {
    const VW = R.VW;
    const c0 = Math.max(0, Math.floor((camX - 90) / 30) - level.colBase), c1 = Math.min(level.cols.length - 1, Math.floor((camX + VW + 90) / 30) - level.colBase);
    const s = ++drawStamp;
    const list = R._list || (R._list = []);
    list.length = 0;
    for (let c = c0; c <= c1; c++) {
      const col = level.cols[c];
      if (!col) continue;
      for (const o of col) { if (o._d === s) continue; o._d = s; list.push(o); }
    }
    const SX = (wx) => wx - camX, SY = (wy) => VH - (wy - camY);
    if (layer === 'back') {
      // glow pass for exposed block edges
      for (const o of list) {
        if (o.t !== 'block' && o.t !== 'slab') continue;
        const m = o.mask || 0;
        const x = SX(o.x0) - GLOW, y = SY(o.y1) - GLOW;
        for (let side = 0; side < 4; side++) {
          const bit = [1, 2, 4, 8][side];
          if (m & bit) continue;
          const g = glowSprite(side);
          ctx.drawImage(g, x, y, g.uw, g.uh);
        }
      }
      for (const o of list) {
        if (o.k === 'deco') drawDeco(ctx, o, SX, SY, t);
        else if (o.t === 'block') { const b = blockSprite(o.mask || 0); ctx.drawImage(b, SX(o.x0), SY(o.y1), 30, 30); }
        else if (o.t === 'slab') { const b = blockSprite(10, 'slab'); ctx.drawImage(b, SX(o.x0), SY(o.y1), 30, o.y1 - o.y0); }
        else if (o.t === 'spike' || o.t === 'mspike') {
          const sp = spikeSprite(o.t === 'mspike');
          const cx = SX(o.vx0 + 15), cy = SY(o.vy0 + 15);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate((o.rot * Math.PI) / 180);
          ctx.drawImage(sp, -21, -21, 42, 42);
          ctx.restore();
        } else if (o.t === 'saw') A.drawSaw(ctx, SX(o.cx), SY(o.cy), o.R, t);
        else if (o.type === 'pad') A.drawPad(ctx, SX(o.x0 - 2 + 15), o.rot === 180 ? SY(o.y1) : SY(o.y0), o.c, o.rot === 180 ? -1 : 1, t);
        else if (o.type === 'orb') A.drawOrb(ctx, SX(o.cx), SY(o.cy), o.c, t, usedSet && usedSet.has(o.id));
        else if (o.type === 'mode' || o.type === 'grav' || o.type === 'size') { A.drawPortal(ctx, SX(o.cx), SY(o.cy), o.p, t, 0); }
        else if (o.type === 'speed') A.drawSpeed(ctx, SX(o.cx), SY(o.cy), o.speed, t);
        else if (o.type === 'coin') { if (!(usedSet && usedSet.has(o.id))) A.drawCoin(ctx, SX(o.cx), SY(o.cy), t, R.coinGot && R.coinGot(o.i)); }
      }
    } else {
      for (const o of list) if (o.type === 'mode' || o.type === 'grav' || o.type === 'size') A.drawPortal(ctx, SX(o.cx), SY(o.cy), o.p, t, 1);
    }
  };

  function drawDeco(ctx, o, SX, SY, t) {
    const r = o.raw;
    if (r.t === 'arrow') {
      const x = SX(o.x0 + 15), y = SY(o.y0 + 15);
      ctx.save(); ctx.translate(x, y);
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(2, 0); ctx.lineTo(-10, 8); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(12, 0); ctx.lineTo(0, 8); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (r.t === 'kelp') {
      const x = SX(o.x0 + 15), y = SY(o.y0);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const hh = (r.h || 2) * 30;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 1; i <= 8; i++) ctx.lineTo(x + Math.sin(t * 2 + i * 0.8) * 4 * (i / 8), y - (hh * i) / 8);
      ctx.stroke(); ctx.restore();
    } else if (r.t === 'pulse') {
      const x = SX(o.x0 + 15), y = SY(o.y0 + 15);
      const k = CD.render.beatPulse || 0;
      ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.35})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, (r.r || 1) * 30 * (0.85 + k * 0.2), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    } else if (r.t === 'text') {
      A.text(ctx, r.text, SX(o.x0), SY(o.y0), r.size || 14, { alpha: 0.9 });
    }
  }

  // ───────────────────────── player ─────────────────────────
  R.drawPlayer = function (ctx, p, vis, icon, camX, camY, t) {
    const sx = p.x - camX, sy = VH - (p.y - camY);
    const size = p.mini ? 30 * CD.MINI : 30;
    const k = size / 30;
    ctx.save();
    ctx.translate(sx, sy);
    if (icon.glow) {
      ctx.save();
      ctx.shadowColor = icon.c2; ctx.shadowBlur = 10 * R.k;
      ctx.fillStyle = A.rgba(icon.c2, 0.25);
      ctx.beginPath(); ctx.arc(0, 0, 13 * k, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.rotate(vis.rot);
    const flipY = p.flip && p.mode !== 'ball' && p.mode !== 'wave' ? -1 : 1;
    // squash & stretch about the feet: +1 stretched on take-off, -1 squashed on landing
    const sq = vis.sq || 0;
    if (sq) { const foot = 15 * k * flipY; ctx.translate(0, foot); ctx.scale(1 - 0.08 * sq, 1 + 0.1 * sq); ctx.translate(0, -foot); }
    ctx.scale(k, k * flipY);
    const o = { t, blink: vis.blink, run: p.onGround && p.mode !== 'ship' && p.mode !== 'ufo', air: !p.onGround };
    A.drawForm(ctx, p.mode, icon.forms, icon.c1, icon.c2, o);
    ctx.restore();
  };

  // ───────────────────────── particles ─────────────────────────
  R.particles = [];
  R.spawn = function (x, y, vx, vy, life, size, color, opts = {}) {
    const ps = R.particles;
    if (ps.length > 900) ps.shift();
    ps.push({ x, y, vx, vy, life, max: life, size, color, grav: opts.grav || 0, shape: opts.shape || 'sq', drag: opts.drag || 0, spin: opts.spin || 0, a: Math.random() * 6 });
  };
  R.burst = function (x, y, n, color, speed, life, size, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.65);
      R.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), color, opts);
    }
  };
  R.rings = [];
  R.ring = function (x, y, r0, r1, life, color, width = 3) { R.rings.push({ x, y, r0, r1, life, max: life, color, width }); };
  R.updateParticles = function (dt) {
    const ps = R.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps.splice(i, 1); continue; }
      q.vy -= q.grav * dt;
      if (q.drag) { q.vx *= 1 - q.drag * dt; q.vy *= 1 - q.drag * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.a += q.spin * dt;
    }
    for (let i = R.rings.length - 1; i >= 0; i--) { const r = R.rings[i]; r.life -= dt; if (r.life <= 0) R.rings.splice(i, 1); }
  };
  R.drawParticles = function (ctx, camX, camY) {
    for (const q of R.particles) {
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      const sx = q.x - camX, sy = VH - (q.y - camY), s = q.size * (0.4 + 0.6 * a);
      if (q.shape === 'circle') { ctx.beginPath(); ctx.arc(sx, sy, s / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (q.spin) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(q.a); ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore(); }
      else ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    for (const r of R.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x - camX, VH - (r.y - camY), r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  // Wave trail: a ribbon through the wave's recent positions.
  R.drawTrail = function (ctx, pts, camX, camY, color, width) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const sx = p.x - camX, sy = VH - (p.y - camY);
      if (i === 0 || p.gap) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = A.rgba(color, 0.35); ctx.lineWidth = width * 2.2; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = width * 0.35; ctx.stroke();
    ctx.restore();
  };

  // End-of-level gate.
  R.drawEnd = function (ctx, endX, camX, camY, t) {
    const sx = endX - camX + 20;
    if (sx > R.VW + 80) return;
    const g = ctx.createLinearGradient(sx - 40, 0, sx + 60, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 40, 0, 100 + R.VW, VH);
    for (let i = 0; i < 14; i++) {
      const k = (t * 0.7 + i / 14) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
      ctx.fillRect(sx + 10 + k * 50, ((i * 53) % 300) + 10, 4, 4);
    }
  };

  // ───────────────────────── HUD ─────────────────────────
  R.drawProgress = function (ctx, pct, showPct, practice) {
    const VW = R.VW;
    const w = Math.min(220, VW * 0.38), h = 7.5;
    const x = VW / 2 - w / 2, y = 9;
    A.rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4; ctx.stroke();
    const fw = Math.max(0, Math.min(1, pct / 100)) * w;
    if (fw > 0.5) {
      A.rr(ctx, x, y, fw, h, 3.5);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, practice ? '#9ef8ff' : '#b8ff78'); g.addColorStop(1, practice ? '#2ec8ff' : '#58d41f');
      ctx.fillStyle = g; ctx.fill();
    }
    if (showPct) A.text(ctx, `${Math.floor(pct)}%`, x + w + 8, y + h / 2 + 0.5, 11, { align: 'left' });
  };

  R.drawPauseButton = function (ctx, hover) {
    const x = R.VW - 20, y = 20;
    ctx.save();
    ctx.globalAlpha = hover ? 0.75 : 0.45;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 11.5, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - 5.2, y - 5.5, 3.6, 11); ctx.strokeRect(x + 1.6, y - 5.5, 3.6, 11);
    ctx.restore();
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
