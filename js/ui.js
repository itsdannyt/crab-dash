/* Crab Dash — immediate-mode canvas UI: every frame a scene declares its buttons; pointer input hit-tests the
 * list from the previous frame. Buttons grow while held and spring back on release, like the original game. */
(function (G) {
  'use strict';
  const CD = G.CD;
  const A = CD.art;
  const UI = (CD.ui = {});

  UI.regs = [];      // hit areas declared during the current frame
  UI.last = [];      // hit areas from the previous frame (used for input)
  UI.anim = new Map(); // id → current scale
  UI.active = null;  // id held down
  UI.hover = null;
  UI.px = -1; UI.py = -1;
  UI.drag = null;    // slider being dragged

  UI.beginFrame = function () { UI.last = UI.regs; UI.regs = []; };

  function hit(r, x, y) {
    if (r.circle) return (x - r.x) ** 2 + (y - r.y) ** 2 <= r.r * r.r;
    return x >= r.x - r.w / 2 && x <= r.x + r.w / 2 && y >= r.y - r.h / 2 && y <= r.y + r.h / 2;
  }
  UI.at = function (x, y) {
    for (let i = UI.last.length - 1; i >= 0; i--) if (hit(UI.last[i], x, y)) return UI.last[i];
    return null;
  };

  UI.pointerDown = function (x, y) {
    UI.px = x; UI.py = y;
    const r = UI.at(x, y);
    if (!r) return false;
    UI.active = r.id;
    if (r.slider) { UI.drag = r; r.onDrag(x); }
    return true;
  };
  UI.pointerMove = function (x, y) {
    UI.px = x; UI.py = y;
    const r = UI.at(x, y);
    UI.hover = r ? r.id : null;
    if (UI.drag) UI.drag.onDrag(x);
  };
  UI.pointerUp = function (x, y) {
    const r = UI.at(x, y);
    const was = UI.active;
    UI.active = null;
    if (UI.drag) { UI.drag = null; return true; }
    if (r && was === r.id && r.onClick) { r.onClick(); return true; }
    return !!was;
  };

  function scaleFor(id, dt) {
    const target = UI.active === id ? 1.22 : 1;
    let s = UI.anim.get(id) || 1;
    // critically-damped-ish approach with a small overshoot, like an elastic ease
    const k = UI.active === id ? 18 : 12;
    s += (target - s) * Math.min(1, dt * k);
    UI.anim.set(id, s);
    return s;
  }

  // Generic button. draw(ctx) paints around (0,0).
  UI.button = function (ctx, id, x, y, w, h, draw, onClick, opts = {}) {
    const r = { id, x, y, w, h, onClick, circle: !!opts.circle, r: opts.circle ? w / 2 : 0 };
    if (!opts.disabled) UI.regs.push(r);
    const s = scaleFor(id, UI.dt || 0.016);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (opts.disabled) ctx.globalAlpha *= 0.45;
    draw(ctx, UI.hover === id);
    ctx.restore();
  };

  // ───────────────────────── common looks ─────────────────────────
  UI.GREEN = ['#b6ff5a', '#4ec21e', '#1c5e0c'];
  UI.BLUE = ['#8fe8ff', '#2a9bf0', '#0e3f7a'];
  UI.PINK = ['#ffb3ec', '#f04fc0', '#6e1257'];
  UI.GOLD = ['#fff07a', '#ffb31a', '#7a4a06'];
  UI.RED = ['#ff9a8a', '#f0402a', '#6e160c'];
  UI.GREY = ['#e3e6ee', '#9aa1b3', '#3b4050'];

  UI.circleBtn = function (col, r, glyph, gs) {
    return (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(0, r * 0.12, r, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, col[0]); g.addColorStop(0.55, col[1]); g.addColorStop(1, A.shade(col[1], -0.25));
      ctx.fillStyle = g; ctx.strokeStyle = col[2]; ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, r + ctx.lineWidth * 0.5 + Math.max(2, r * 0.14) / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.45, r * 0.45, r * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
      if (glyph) A.glyph(ctx, glyph, 0, 0, gs || r * 1.05, '#fff');
    };
  };
  UI.squareBtn = function (col, w, h, inner) {
    return (ctx, hov) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      A.rr(ctx, -w / 2, -h / 2 + 3, w, h, 8); ctx.fill();
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, col[0]); g.addColorStop(0.6, col[1]); g.addColorStop(1, A.shade(col[1], -0.3));
      ctx.fillStyle = g; ctx.strokeStyle = col[2]; ctx.lineWidth = 3;
      A.rr(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; A.rr(ctx, -w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 10); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; A.rr(ctx, -w / 2 + 4, -h / 2 + 3, w - 8, h * 0.3, 5); ctx.fill();
      if (inner) inner(ctx, hov);
    };
  };
  UI.labelBtn = function (col, w, h, label, size) {
    return UI.squareBtn(col, w, h, (ctx) => A.text(ctx, label, 0, 1, size || h * 0.5));
  };

  // Driftwood panel.
  UI.panel = function (ctx, x, y, w, h, opts = {}) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    A.rr(ctx, x + 2, y + 5, w, h, 14); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, opts.top || '#b8643a'); g.addColorStop(1, opts.bot || '#7c3b1f');
    ctx.fillStyle = g;
    A.rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = opts.rim || '#f6c48a'; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#2a1206';
    A.rr(ctx, x - 2.5, y - 2.5, w + 5, h + 5, 16); ctx.stroke();
    A.rr(ctx, x + 6, y + 6, w - 12, h - 12, 10);
    ctx.strokeStyle = 'rgba(255,230,190,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  };
  UI.darkPanel = function (ctx, x, y, w, h, r = 10, a = 0.38) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    A.rr(ctx, x, y, w, h, r); ctx.fill();
  };

  UI.bar = function (ctx, x, y, w, h, frac, cols) {
    A.rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, h / 2 + 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke();
    const fw = Math.max(0, Math.min(1, frac)) * w;
    if (fw > 1) {
      A.rr(ctx, x, y, Math.max(h, fw), h, h / 2);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; A.rr(ctx, x + 2, y + 1.5, Math.max(0, Math.max(h, fw) - 4), h * 0.3, h * 0.15); ctx.fill();
    }
  };

  UI.slider = function (ctx, id, x, y, w, value, onChange, label) {
    if (label) A.text(ctx, label, x - 8, y, 11, { align: 'right' });
    A.rr(ctx, x, y - 3.5, w, 7, 3.5);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    A.rr(ctx, x, y - 3.5, Math.max(7, w * value), 7, 3.5);
    ctx.fillStyle = '#7de35a'; ctx.fill();
    const hx = x + w * value;
    const r = { id, x: x + w / 2, y, w: w + 20, h: 22, slider: true, onDrag: (px) => onChange(Math.max(0, Math.min(1, (px - x) / w))) };
    UI.regs.push(r);
    const s = scaleFor(id, UI.dt || 0.016);
    ctx.save(); ctx.translate(hx, y); ctx.scale(s, s);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7de35a'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  UI.toggle = function (ctx, id, x, y, on, onClick, label) {
    UI.button(ctx, id, x, y, 20, 20, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.4)'; A.rr(c, -9, -8, 18, 18, 4); c.fill();
      c.fillStyle = on ? '#5ed12a' : '#6f6f7a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      A.rr(c, -9, -10, 18, 18, 4); c.fill(); c.stroke();
      if (on) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-5, -1); c.lineTo(-1, 3); c.lineTo(5, -5); c.stroke(); }
    }, onClick);
    if (label) A.text(ctx, label, x + 16, y, 11, { align: 'left' });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
