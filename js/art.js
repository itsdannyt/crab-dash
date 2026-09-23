/* Crab Dash — vector art. Every icon and object is drawn with canvas paths (no image files).
 * Icons draw in local "icon units": a 30×30 square centred on (0,0), y pointing down. */
(function (G) {
  'use strict';
  const CD = G.CD || (G.CD = {});
  const A = (CD.art = {});

  // ───────────────────────── palette ─────────────────────────
  A.PALETTE = [
    '#d97757', '#ff5a36', '#ff2d55', '#ff4fa3', '#c83cff', '#8a4dff', '#4b5bff', '#1f8bff',
    '#00c2ff', '#00e0d0', '#00e676', '#6be535', '#b8f02a', '#ffe23a', '#ffb31a', '#ff8a1f',
    '#ffffff', '#ffe4cc', '#ffd0b0', '#b5f5ff', '#caa6ff', '#9dffc2', '#fff4a8', '#ffb4c8',
    '#8c8c96', '#4a4a57', '#1c1c24', '#7a3b1e', '#2f6b3a', '#1c3f8a', '#6b1a3a', '#0e5c63',
  ];

  // ───────────────────────── helpers ─────────────────────────
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  A.rr = rr;

  function shade(hex, amt) {
    // amt -1..1: darken / lighten
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  }
  A.shade = shade;
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  A.rgba = rgba;
  A.mix = function (h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
    const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
    const bl = (a & 255) * (1 - t) + (b & 255) * t;
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)).toString(16).slice(1);
  };

  const OUT = '#0b0b10';

  function eyeStalk(ctx, x, yBase, yEye, r, look, blink) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = 3.6;
    ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yEye); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(x, yEye, r, blink ? r * 0.25 : r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!blink) {
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.arc(x + look, yEye + 0.4, r * 0.52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + look + r * 0.22, yEye - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
    }
  }

  function pincer(ctx, x, y, s, c1, c2, open, big) {
    // s = side (-1 left, +1 right); pincer faces up-and-out
    const k = big ? 1.25 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * k, k);
    ctx.lineJoin = 'round';
    // arm
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(0, 0); ctx.stroke();
    ctx.strokeStyle = c1; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(0, 0); ctx.stroke();
    // claw: two jaws
    const o = 0.35 + open * 0.35;
    ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-1, 1);
    ctx.quadraticCurveTo(-1.5, -6, 3.5, -8 - o * 2);
    ctx.quadraticCurveTo(2.2, -3.5, 3.4, -1.2 - o * 1.5);
    ctx.quadraticCurveTo(5.5, -3.4, 6.2, -5.2 + o);
    ctx.quadraticCurveTo(7.2, 0.8, 1.8, 2.8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.ellipse(1.2, -2.3, 1.2, 2.1, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function legs(ctx, y, spread, t, c1, n = 3) {
    const wig = Math.sin(t * 22) * 1.3;
    for (const pass of [0, 1]) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = pass ? c1 : OUT;
      ctx.lineWidth = pass ? 1.3 : 3.2;
      for (const s of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const lx = s * (spread + i * 3.1);
          const w = (i % 2 ? wig : -wig);
          ctx.beginPath();
          ctx.moveTo(lx, y);
          ctx.lineTo(lx + s * 2.6, y + 3.2 + w * 0.3);
          ctx.lineTo(lx + s * 3.4, y + 6.2 + w);
          ctx.stroke();
        }
      }
    }
  }

  // ───────────────────────── cube icons (crab variants) ─────────────────────────
  // opts: { t: seconds (animation), blink: bool, run: bool }
  const CUBES = [];
  A.CUBES = CUBES;

  // 1. Coral — the classic crab: round shell, stalk eyes, pincers.
  CUBES.push({
    name: 'Coral',
    draw(ctx, c1, c2, o) {
      legs(ctx, 7, 5.5, o.run ? o.t : 0, c1);
      pincer(ctx, -12.5, -1, -1, c1, c2, 0.5 + 0.5 * Math.sin(o.t * 6), false);
      pincer(ctx, 12.5, -1, 1, c1, c2, 0.5 + 0.5 * Math.sin(o.t * 6 + 1), false);
      eyeStalk(ctx, -5, -8, -12.5, 3.2, 0.9, o.blink);
      eyeStalk(ctx, 5, -8, -12.5, 3.2, 0.9, o.blink);
      ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-13, 6);
      ctx.quadraticCurveTo(-14.5, -9.5, 0, -9.5);
      ctx.quadraticCurveTo(14.5, -9.5, 13, 6);
      ctx.quadraticCurveTo(0, 12, -13, 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // shell shine and spots
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.ellipse(-4.5, -4.5, 5.5, 2.2, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c2;
      ctx.beginPath(); ctx.moveTo(-8, 4.5); ctx.quadraticCurveTo(0, 9, 8, 4.5); ctx.quadraticCurveTo(0, 6.5, -8, 4.5); ctx.fill();
      ctx.beginPath(); ctx.arc(6.5, -3, 1.5, 0, Math.PI * 2); ctx.arc(9.3, 0.5, 1, 0, Math.PI * 2); ctx.fill();
      // mouth
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-2.4, 1.2); ctx.quadraticCurveTo(0, 3.2, 2.4, 1.2); ctx.stroke();
    },
  });

  // 2. Block — a square-shelled crab that fills the whole cube like a classic icon.
  CUBES.push({
    name: 'Blocky',
    draw(ctx, c1, c2, o) {
      legs(ctx, 10, 4.5, o.run ? o.t : 0, c1);
      ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
      rr(ctx, -13.5, -13.5, 27, 24, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c2; rr(ctx, -8.5, -8.5, 17, 14, 2.5); ctx.fill();
      ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = OUT;
      rr(ctx, -6, -5.5, 3.6, 7, 1.2); ctx.fill();
      rr(ctx, 2.4, -5.5, 3.6, 7, 1.2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4.9, -4.6, 1.2, 1.6); ctx.fillRect(3.5, -4.6, 1.2, 1.6);
      // side claws
      for (const s of [-1, 1]) {
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
        rr(ctx, s > 0 ? 12 : -17, -2, 5, 6, 1.5); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 14.5, -2); ctx.lineTo(s * 14.5, 1); ctx.stroke();
      }
    },
  });

  // 3. Hermit — lives in a spiral shell (secondary colour).
  CUBES.push({
    name: 'Hermit',
    draw(ctx, c1, c2, o) {
      legs(ctx, 8, 3.5, o.run ? o.t : 0, c1, 2);
      // shell
      ctx.fillStyle = c2; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(2, -1, 12.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) {
        const r = 11 - a * 0.62;
        const x = 2 + Math.cos(a) * r, y = -1 + Math.sin(a) * r;
        a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      // crab poking out on the left
      ctx.fillStyle = c1; ctx.lineWidth = 2;
      rr(ctx, -15, 0, 12, 10, 4); ctx.fill(); ctx.stroke();
      pincer(ctx, -12, 3, -1, c1, c2, 0.6, false);
      eyeStalk(ctx, -9, 1, -4, 2.6, -0.7, o.blink);
    },
  });

  // 4. King — crowned, oversized claws.
  CUBES.push({
    name: 'King',
    draw(ctx, c1, c2, o) {
      legs(ctx, 8, 5.5, o.run ? o.t : 0, c1);
      pincer(ctx, -12, 0, -1, c1, c2, 0.4, true);
      pincer(ctx, 12, 0, 1, c1, c2, 0.4, true);
      ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
      rr(ctx, -12, -8, 24, 17, 7); ctx.fill(); ctx.stroke();
      // crown
      ctx.fillStyle = '#ffd23a'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(-9, -15); ctx.lineTo(-4.5, -11); ctx.lineTo(0, -16.5); ctx.lineTo(4.5, -11); ctx.lineTo(9, -15); ctx.lineTo(8, -8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, -11, 1.4, 0, Math.PI * 2); ctx.fill();
      // eyes
      ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 4.5, -2, 2.8, 3.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = OUT;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 4.5 + 0.8, -1.6, 1.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(3, 4); ctx.stroke();
    },
  });

  // 5. Visor — robotic crab with a glowing eye bar.
  CUBES.push({
    name: 'Visor',
    draw(ctx, c1, c2, o) {
      legs(ctx, 9, 5, o.run ? o.t : 0, c1);
      ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
      rr(ctx, -13, -11, 26, 21, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = OUT; rr(ctx, -10, -6, 20, 6.5, 3); ctx.fill();
      ctx.fillStyle = c2; rr(ctx, -8.5, -4.8, 17 * (0.4 + 0.6 * ((Math.sin(o.t * 3) + 1) / 2)), 4, 2); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, -15.5); ctx.stroke();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, -16, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const s of [-1, 1]) { ctx.fillStyle = c2; rr(ctx, s * 6 - 2, 3, 4, 3.5, 1); ctx.fill(); ctx.stroke(); }
      pincer(ctx, -12.5, 1, -1, c1, c2, 0.3, false);
      pincer(ctx, 12.5, 1, 1, c1, c2, 0.3, false);
    },
  });

  // 6. Grump — cranky eyebrows.
  CUBES.push({
    name: 'Grump',
    draw(ctx, c1, c2, o) {
      legs(ctx, 7.5, 5.5, o.run ? o.t : 0, c1);
      pincer(ctx, -12.5, -1, -1, c1, c2, 0.9, false);
      pincer(ctx, 12.5, -1, 1, c1, c2, 0.9, false);
      eyeStalk(ctx, -5, -7, -11.5, 3.1, 0.2, o.blink);
      eyeStalk(ctx, 5, -7, -11.5, 3.1, -0.2, o.blink);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-8.5, -16); ctx.lineTo(-2.5, -13.5); ctx.moveTo(8.5, -16); ctx.lineTo(2.5, -13.5); ctx.stroke();
      ctx.fillStyle = c1; ctx.lineWidth = 2.2;
      rr(ctx, -13, -8, 26, 16, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c2; rr(ctx, -9, -4, 18, 3, 1.5); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3, 4.5); ctx.quadraticCurveTo(0, 2, 3, 4.5); ctx.stroke();
    },
  });

  // 7. Sunny — beaming smile.
  CUBES.push({
    name: 'Sunny',
    draw(ctx, c1, c2, o) {
      legs(ctx, 8, 5.5, o.run ? o.t : 0, c1);
      pincer(ctx, -12.5, -2, -1, c1, c2, 1, false);
      pincer(ctx, 12.5, -2, 1, c1, c2, 1, false);
      ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(0, -1, 13, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 5, -3, 2.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.moveTo(-6, 1.5); ctx.quadraticCurveTo(0, 10, 6, 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, 5, 2.6, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,140,0.55)';
      ctx.beginPath(); ctx.arc(-9, 1.5, 2, 0, Math.PI * 2); ctx.arc(9, 1.5, 2, 0, Math.PI * 2); ctx.fill();
    },
  });

  // 8. Pixel — chunky 8-bit crab.
  CUBES.push({
    name: 'Pixel',
    draw(ctx, c1, c2, o) {
      const P = [
        '..E....E..',
        '..E....E..',
        '.XXXXXXXX.',
        'CXXXXXXXXC',
        'CXKXXXXKXC',
        'CXXXXXXXXC',
        '.XXSSSSXX.',
        '.XXXXXXXX.',
        '.L.L..L.L.',
        'L..L..L..L',
      ];
      const s = 3, ox = -15, oy = -15;
      const legOff = o.run && Math.sin(o.t * 22) > 0 ? 1 : 0;
      ctx.fillStyle = OUT;
      for (let r = 0; r < P.length; r++) for (let c = 0; c < 10; c++) {
        if (P[r][c] !== '.') ctx.fillRect(ox + c * s - 0.8, oy + r * s - 0.8, s + 1.6, s + 1.6);
      }
      for (let r = 0; r < P.length; r++) for (let c = 0; c < 10; c++) {
        const ch = P[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = ch === 'K' ? OUT : ch === 'S' ? c2 : ch === 'E' ? '#fff' : ch === 'L' ? shade(c1, -0.25) : c1;
        const yy = ch === 'L' ? oy + r * s + (c % 3 === 0 ? legOff : -legOff) * 0.6 : oy + r * s;
        ctx.fillRect(ox + c * s, yy, s, s);
      }
    },
  });

  // ───────────────────────── vehicles ─────────────────────────
  function miniCrab(ctx, c1, c2, o, scale) {
    ctx.save(); ctx.scale(scale, scale);
    CUBES[o.cube || 0].draw(ctx, c1, c2, { t: o.t, blink: o.blink, run: false });
    ctx.restore();
  }

  A.SHIPS = [
    {
      name: 'Skiff',
      draw(ctx, c1, c2, o) {
        ctx.save(); ctx.translate(-1, -6.5); miniCrab(ctx, c1, c2, o, 0.46); ctx.restore();
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-15, -1); ctx.lineTo(9, -1); ctx.quadraticCurveTo(17, 1, 17, 6); ctx.lineTo(-13, 7); ctx.lineTo(-16.5, 3);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-12, 2.5); ctx.lineTo(10, 2.5); ctx.lineTo(9, 4.2); ctx.lineTo(-11, 4.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(c1, -0.3); ctx.strokeStyle = OUT;
        ctx.beginPath(); ctx.moveTo(-16, -1); ctx.lineTo(-19, -6); ctx.lineTo(-11, -1); ctx.closePath(); ctx.fill(); ctx.stroke();
      },
    },
    {
      name: 'Lobster',
      draw(ctx, c1, c2, o) {
        ctx.save(); ctx.translate(-2, -7); miniCrab(ctx, c1, c2, o, 0.44); ctx.restore();
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-17, 0); ctx.quadraticCurveTo(-4, -4, 12, -1); ctx.lineTo(18, 3); ctx.lineTo(12, 7); ctx.quadraticCurveTo(-4, 9, -17, 5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-10 + i * 6, -1.5); ctx.lineTo(-10 + i * 6, 7.5); ctx.stroke(); }
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(13, 3, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        pincer(ctx, 13, 6, 1, c1, c2, 0.3, false);
      },
    },
    {
      name: 'Jet',
      draw(ctx, c1, c2, o) {
        ctx.save(); ctx.translate(0, -7); miniCrab(ctx, c1, c2, o, 0.42); ctx.restore();
        ctx.fillStyle = c2; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-17, -8); ctx.lineTo(-12, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.moveTo(-15, -1); ctx.lineTo(10, -2); ctx.lineTo(18, 2.5); ctx.lineTo(10, 7); ctx.lineTo(-15, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-6, 7); ctx.lineTo(4, 7); ctx.lineTo(-3, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      },
    },
  ];

  A.BALLS = [
    {
      name: 'Shell',
      draw(ctx, c1, c2, o) {
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.lineWidth = 1.6;
        for (let i = 0; i < 4; i++) {
          ctx.save(); ctx.rotate(i * Math.PI / 2);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(9, -4, 13.5, 2); ctx.quadraticCurveTo(7, 1, 0, 0); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      },
    },
    {
      name: 'Curl',
      draw(ctx, c1, c2, o) {
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4.4; a += 0.15) { const r = 12.5 - a * 0.85; const x = Math.cos(a) * r, y = Math.sin(a) * r; a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(-6, -6, 2.4, 0, Math.PI * 2); ctx.fill();
      },
    },
    {
      name: 'Peeker',
      draw(ctx, c1, c2, o) {
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = OUT;
        rr(ctx, -4.5, -4, 3, 6, 1.2); ctx.fill(); rr(ctx, 1.5, -4, 3, 6, 1.2); ctx.fill();
      },
    },
  ];

  A.UFOS = [
    {
      name: 'Saucer',
      draw(ctx, c1, c2, o) {
        ctx.fillStyle = 'rgba(190,240,255,0.45)'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, -3, 10, Math.PI, 0); ctx.fill();
        ctx.save(); ctx.translate(0, -5); miniCrab(ctx, c1, c2, o, 0.4); ctx.restore();
        ctx.beginPath(); ctx.arc(0, -3, 10, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = c1; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 2, 16, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 5.5, 2.4, 1.4, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = shade(c1, -0.3); ctx.beginPath(); ctx.ellipse(0, 7.5, 7, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      },
    },
    {
      name: 'Bubble',
      draw(ctx, c1, c2, o) {
        ctx.save(); ctx.translate(0, -3); miniCrab(ctx, c1, c2, o, 0.5); ctx.restore();
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.fillStyle = 'rgba(200,245,255,0.3)';
        ctx.beginPath(); ctx.arc(0, -3, 11.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-5, -9, 3, 1.5, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c1; ctx.beginPath(); rr(ctx, -14, 6, 28, 7, 3.5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(-9, 8.5, 18, 2);
      },
    },
    {
      name: 'Clamshell',
      draw(ctx, c1, c2, o) {
        ctx.save(); ctx.translate(0, -2); miniCrab(ctx, c1, c2, o, 0.4); ctx.restore();
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-16, 3); ctx.quadraticCurveTo(0, 16, 16, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1.4;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 3, 4); ctx.lineTo(i * 5, 9.5); ctx.stroke(); }
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-15, -3); ctx.quadraticCurveTo(0, -18, 15, -3); ctx.lineTo(12, -6); ctx.quadraticCurveTo(0, -14, -12, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      },
    },
  ];

  A.WAVES = [
    {
      name: 'Claw',
      draw(ctx, c1, c2, o) {
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-11, -10); ctx.quadraticCurveTo(4, -9, 13, -1.5); ctx.lineTo(4, -1); ctx.lineTo(13, 1.5); ctx.quadraticCurveTo(4, 9, -11, 10); ctx.lineTo(-6, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-6, -4.5); ctx.lineTo(3, -3); ctx.lineTo(-3, 0); ctx.lineTo(3, 3); ctx.lineTo(-6, 4.5); ctx.lineTo(-3.5, 0); ctx.closePath(); ctx.fill();
      },
    },
    {
      name: 'Dart',
      draw(ctx, c1, c2, o) {
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-11, -10); ctx.lineTo(13, 0); ctx.lineTo(-11, 10); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-5, -3.5); ctx.lineTo(5, 0); ctx.lineTo(-5, 3.5); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill();
      },
    },
    {
      name: 'Fin',
      draw(ctx, c1, c2, o) {
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-12, -9); ctx.quadraticCurveTo(0, -8, 13, 0); ctx.quadraticCurveTo(0, 8, -12, 9); ctx.quadraticCurveTo(-4, 0, -12, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(4, -1, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(-3, 0); ctx.lineTo(-9, 5); ctx.closePath(); ctx.fill();
      },
    },
  ];

  A.ROBOTS = [
    {
      name: 'Stilts',
      draw(ctx, c1, c2, o) {
        const ph = o.run ? Math.sin(o.t * 16) : 0;
        const air = o.air;
        ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const pass of [0, 1]) {
          ctx.lineWidth = pass ? 2 : 4.4; ctx.strokeStyle = pass ? shade(c1, -0.25) : OUT;
          for (const s of [-1, 1]) {
            const k = air ? 0.7 : s * ph;
            ctx.beginPath(); ctx.moveTo(s * 4, 2); ctx.lineTo(s * 6 + k * 3, 8 - Math.abs(k) * 1.5); ctx.lineTo(s * 4 + k * 5, 14 - (air ? 2 : 0)); ctx.stroke();
          }
        }
        ctx.save(); ctx.translate(0, -3); ctx.scale(0.82, 0.82);
        CUBES[o.cube || 0].draw(ctx, c1, c2, { t: o.t, blink: o.blink, run: false });
        ctx.restore();
      },
    },
    {
      name: 'Mech',
      draw(ctx, c1, c2, o) {
        const ph = o.run ? Math.sin(o.t * 16) : 0;
        ctx.lineCap = 'round';
        for (const pass of [0, 1]) {
          ctx.lineWidth = pass ? 2.4 : 5; ctx.strokeStyle = pass ? c2 : OUT;
          for (const s of [-1, 1]) {
            const k = o.air ? 0.8 : s * ph;
            ctx.beginPath(); ctx.moveTo(s * 5, 3); ctx.lineTo(s * 5 + k * 4, 14); ctx.stroke();
          }
        }
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        rr(ctx, -12, -13, 24, 17, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = OUT; rr(ctx, -8, -9, 16, 6, 3); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(-3.5, -6, 1.6, 0, Math.PI * 2); ctx.arc(3.5, -6, 1.6, 0, Math.PI * 2); ctx.fill();
        pincer(ctx, -12, -3, -1, c1, c2, 0.5, false);
        pincer(ctx, 12, -3, 1, c1, c2, 0.5, false);
      },
    },
  ];

  A.SPIDERS = [
    {
      name: 'Longlegs',
      draw(ctx, c1, c2, o) {
        const ph = o.run ? o.t * 14 : 0;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const pass of [0, 1]) {
          ctx.lineWidth = pass ? 1.8 : 3.8; ctx.strokeStyle = pass ? c1 : OUT;
          for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
            const k = Math.sin(ph + i * 2 + (s > 0 ? 1 : 0)) * 2;
            ctx.beginPath(); ctx.moveTo(s * (3 + i * 3), 2); ctx.lineTo(s * (11 + i * 3), -3 + k * 0.4); ctx.lineTo(s * (8 + i * 6) + k, 15); ctx.stroke();
          }
        }
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.ellipse(0, -1, 10, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, 3, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        eyeStalk(ctx, -3.5, -7, -11, 2.5, 0.6, o.blink);
        eyeStalk(ctx, 3.5, -7, -11, 2.5, 0.6, o.blink);
      },
    },
    {
      name: 'Tick',
      draw(ctx, c1, c2, o) {
        const ph = o.run ? o.t * 14 : 0;
        ctx.lineCap = 'round';
        for (const pass of [0, 1]) {
          ctx.lineWidth = pass ? 2 : 4; ctx.strokeStyle = pass ? c2 : OUT;
          for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
            const k = Math.sin(ph + i * 1.7 + s) * 1.5;
            ctx.beginPath(); ctx.moveTo(s * 4, 1 + i * 2); ctx.lineTo(s * 13 + k, 6 + i * 3); ctx.stroke();
          }
        }
        ctx.fillStyle = c1; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
        rr(ctx, -9, -10, 18, 16, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = OUT; ctx.fillRect(-5, -5, 3, 4); ctx.fillRect(2, -5, 3, 4);
      },
    },
  ];

  A.FORMS = { cube: CUBES, ship: A.SHIPS, ball: A.BALLS, ufo: A.UFOS, wave: A.WAVES, robot: A.ROBOTS, spider: A.SPIDERS };

  // Draw a player form at the current transform (centre 0,0, 30-unit square).
  A.drawForm = function (ctx, mode, icon, c1, c2, o) {
    const list = A.FORMS[mode] || CUBES;
    const v = list[(icon[mode] || 0) % list.length];
    v.draw(ctx, c1, c2, Object.assign({ cube: icon.cube || 0 }, o));
  };

  // ───────────────────────── outlined text ─────────────────────────
  A.FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
  A.text = function (ctx, str, x, y, size, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || ''} ${size}px ${A.FONT}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    ctx.lineJoin = 'round';
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    const sw = o.stroke === false ? 0 : (o.sw || size * 0.16);
    if (o.shadow !== false && sw) {
      ctx.fillStyle = o.shadowColor || 'rgba(0,0,0,0.45)';
      ctx.fillText(str, x, y + size * 0.1);
    }
    if (sw) { ctx.strokeStyle = o.strokeColor || '#000'; ctx.lineWidth = sw * 2; ctx.strokeText(str, x, y); }
    if (o.grad) {
      const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      g.addColorStop(0, o.grad[0]); g.addColorStop(1, o.grad[1]);
      ctx.fillStyle = g;
    } else ctx.fillStyle = o.color || '#fff';
    ctx.fillText(str, x, y);
    ctx.restore();
  };
  A.measure = function (ctx, str, size) {
    ctx.save(); ctx.font = `${size}px ${A.FONT}`; const w = ctx.measureText(str).width; ctx.restore(); return w;
  };

  // ───────────────────────── world objects ─────────────────────────
  // All take (ctx, x, y, s) with (x, y) the TOP-LEFT of the 30-unit cell in screen units, s = cell size.
  A.PAD_COLORS = { Y: '#ffe23a', P: '#ff5ad2', R: '#ff3b3b', B: '#3fd6ff' };
  A.ORB_COLORS = { Y: '#ffe23a', P: '#ff5ad2', R: '#ff3b3b', B: '#3fd6ff', G: '#4dff6a' };
  A.PORTAL_COLORS = {
    cube: '#5cff4f', ship: '#ff4fd8', ball: '#ff5a2a', ufo: '#ffae1a', wave: '#2fc8ff', robot: '#e6e6ee', spider: '#9c5cff',
    gravDown: '#2f8cff', gravUp: '#ffe23a', mini: '#ff4fd8', big: '#5cff4f',
  };
  A.SPEED_COLORS = ['#ffae1a', '#2fc8ff', '#5cff4f', '#ff4fd8', '#ff3b3b'];

  A.drawPad = function (ctx, cx, by, c, up, t) {
    // cx: centre x, by: base y (screen), up: +1 floor pad, -1 ceiling pad
    const col = A.PAD_COLORS[c];
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(1, up);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
    g.addColorStop(0, rgba(col, 0.45)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(-22, -22, 44, 22);
    ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.quadraticCurveTo(-11, -6.5, 0, -6.5); ctx.quadraticCurveTo(11, -6.5, 13, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-7, -5, 14, 1.4);
    // rising sparkles
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.6 + i / 3) % 1;
      ctx.fillStyle = rgba(col, 1 - k);
      ctx.fillRect(-9 + i * 8, -8 - k * 14, 2, 2);
    }
    ctx.restore();
  };

  A.drawOrb = function (ctx, cx, cy, c, t, used) {
    const col = A.ORB_COLORS[c];
    const pulse = 1 + Math.sin(t * 7) * 0.06;
    ctx.save();
    ctx.translate(cx, cy);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 24);
    g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;
    ctx.setLineDash([3.2, 2.6]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const f = ctx.createRadialGradient(-3, -3, 1, 0, 0, 10);
    f.addColorStop(0, shade(col, 0.6)); f.addColorStop(1, col);
    ctx.fillStyle = f; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (c === 'B' || c === 'G') {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.moveTo(-3, -2.5); ctx.lineTo(0, -5.5); ctx.lineTo(3, -2.5); ctx.moveTo(-3, 2.5); ctx.lineTo(0, 5.5); ctx.lineTo(3, 2.5); ctx.stroke();
    }
    if (used) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };

  // Portal: tall oval ring. half: 0 = back (left) half, 1 = front (right) half, 2 = whole.
  A.drawPortal = function (ctx, cx, cy, kind, t, half) {
    const col = A.PORTAL_COLORS[kind] || '#fff';
    ctx.save();
    ctx.translate(cx, cy);
    const H = 44, W = 13;
    const clip = half !== 2;
    if (clip) {
      ctx.beginPath();
      if (half === 0) ctx.rect(-40, -60, 40, 120); else ctx.rect(0, -60, 40, 120);
      ctx.clip();
    }
    // glow
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 50);
    g.addColorStop(0, rgba(col, 0.35)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(-50, -56, 100, 112);
    // teeth around the rim
    ctx.fillStyle = shade(col, -0.35); ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.11;
      const x = Math.cos(a) * (W + 3), y = Math.sin(a) * (H + 3);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-1, -3); ctx.lineTo(6, 0); ctx.lineTo(-1, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // ring
    ctx.lineWidth = 8; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 0, W, H, 0, 0, Math.PI * 2); ctx.stroke();
    const rg = ctx.createLinearGradient(0, -H, 0, H);
    rg.addColorStop(0, shade(col, 0.45)); rg.addColorStop(0.5, col); rg.addColorStop(1, shade(col, -0.3));
    ctx.lineWidth = 5.5; ctx.strokeStyle = rg;
    ctx.beginPath(); ctx.ellipse(0, 0, W, H, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(0, 0, W - 3.2, H - 3.2, 0, 0, Math.PI * 2); ctx.stroke();
    // swirling inner light
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.8 + i / 3) % 1;
      ctx.strokeStyle = rgba(col, 1 - k); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, 0, (W - 3) * k, (H - 3) * k, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };

  // Symbol inside the portal telling what it does (drawn with the back half).
  A.drawPortalBadge = function (ctx, cx, cy, kind) {
    ctx.save();
    ctx.translate(cx, cy + 54);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, -11, -6, 22, 12, 4); ctx.fill();
    ctx.fillStyle = A.PORTAL_COLORS[kind] || '#fff';
    ctx.font = `9px ${A.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lab = { cube: 'CUBE', ship: 'SHIP', ball: 'BALL', ufo: 'UFO', wave: 'WAVE', robot: 'ROBOT', spider: 'SPIDR', gravDown: '\u25bc', gravUp: '\u25b2', mini: 'MINI', big: 'BIG' }[kind] || '';
    ctx.font = `${lab.length > 3 ? 6.5 : 9}px ${A.FONT}`;
    ctx.fillText(lab, 0, 0.5);
    ctx.restore();
  };

  A.drawSpeed = function (ctx, cx, cy, s, t) {
    const col = A.SPEED_COLORS[s];
    const n = [1, 1, 2, 3, 4][s];
    const dir = s === 0 ? -1 : 1;
    ctx.save(); ctx.translate(cx, cy);
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 36);
    g.addColorStop(0, rgba(col, 0.4)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(-36, -36, 72, 72);
    const w = 7;
    const total = n * w + (n - 1) * 1;
    for (let i = 0; i < n; i++) {
      const x = -total / 2 + i * (w + 1) + (dir < 0 ? w : 0);
      ctx.save(); ctx.translate(x, 0); ctx.scale(dir, 1);
      ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(w + 5, 0); ctx.lineTo(0, 22); ctx.lineTo(-3 + 0, 22); ctx.lineTo(w + 1, 0); ctx.lineTo(-3, -22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  A.drawCoin = function (ctx, cx, cy, t, got) {
    ctx.save(); ctx.translate(cx, cy);
    const sx = Math.cos(t * 3.2);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 24);
    g.addColorStop(0, got ? 'rgba(200,200,200,0.35)' : 'rgba(255,215,80,0.55)'); g.addColorStop(1, 'rgba(255,215,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
    ctx.scale(Math.max(0.12, Math.abs(sx)), 1);
    const base = got ? '#9aa0ad' : '#ffcc2e', dark = got ? '#5d6270' : '#c77c0a';
    ctx.fillStyle = dark; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = base; ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    // embossed claw
    ctx.beginPath(); ctx.moveTo(-4, 6); ctx.quadraticCurveTo(-6, -4, 1, -7); ctx.quadraticCurveTo(-1, -2, 1, 0); ctx.quadraticCurveTo(5, -3, 6, -6); ctx.quadraticCurveTo(7, 3, -1, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  A.drawSaw = function (ctx, cx, cy, R, t, col) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-t * 6);
    const n = Math.max(8, Math.round(R / 3));
    ctx.fillStyle = 'rgba(20,20,30,0.85)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
      ctx.lineTo(Math.cos(a0) * R * 0.78, Math.sin(a0) * R * 0.78);
      ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = col || 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.36, 0, Math.PI * 1.4); ctx.stroke();
    ctx.restore();
  };

  // ───────────────────────── UI glyphs ─────────────────────────
  A.glyph = function (ctx, name, x, y, s, col = '#fff') {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 20, s / 20);
    ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (name) {
      case 'play':
        ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(9, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.stroke(); ctx.fill(); break;
      case 'pause':
        rr(ctx, -7, -8, 5, 16, 1); ctx.stroke(); ctx.fill(); rr(ctx, 2, -8, 5, 16, 1); ctx.stroke(); ctx.fill(); break;
      case 'back':
        ctx.beginPath(); ctx.moveTo(8, -3); ctx.lineTo(-1, -3); ctx.lineTo(-1, -9); ctx.lineTo(-10, 0); ctx.lineTo(-1, 9); ctx.lineTo(-1, 3); ctx.lineTo(8, 3); ctx.closePath(); ctx.stroke(); ctx.fill(); break;
      case 'left':
        ctx.beginPath(); ctx.moveTo(5, -11); ctx.lineTo(-7, 0); ctx.lineTo(5, 11); ctx.lineTo(8, 8); ctx.lineTo(-1, 0); ctx.lineTo(8, -8); ctx.closePath(); ctx.stroke(); ctx.fill(); break;
      case 'right':
        ctx.scale(-1, 1); ctx.beginPath(); ctx.moveTo(5, -11); ctx.lineTo(-7, 0); ctx.lineTo(5, 11); ctx.lineTo(8, 8); ctx.lineTo(-1, 0); ctx.lineTo(8, -8); ctx.closePath(); ctx.stroke(); ctx.fill(); break;
      case 'restart':
        ctx.lineWidth = 6.5; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, 7.5, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke();
        ctx.lineWidth = 3.5; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, 0, 7.5, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#000';
        ctx.beginPath(); ctx.moveTo(3, -11.5); ctx.lineTo(10.5, -6.5); ctx.lineTo(2, -2.5); ctx.closePath(); ctx.stroke(); ctx.fill(); break;
      case 'menu':
        for (let i = -1; i <= 1; i++) { rr(ctx, -9, i * 6 - 2, 18, 4, 1.5); ctx.stroke(); ctx.fill(); } break;
      case 'gear': {
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const r = i % 2 ? 7.2 : 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill(); break;
      }
      case 'stats':
        rr(ctx, -9, -1, 5, 10, 1); ctx.stroke(); ctx.fill(); rr(ctx, -2.5, -9, 5, 18, 1); ctx.stroke(); ctx.fill(); rr(ctx, 4, -5, 5, 14, 1); ctx.stroke(); ctx.fill(); break;
      case 'help':
        ctx.font = `bold 22px ${A.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeText('?', 0, 1); ctx.fillText('?', 0, 1); break;
      case 'diamond':
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 0); ctx.lineTo(0, 10); ctx.lineTo(-8, 0); ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill(); break;
      case 'x':
        ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
        ctx.lineWidth = 3.6; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke(); break;
      case 'pencil':
        ctx.rotate(-Math.PI / 4);
        rr(ctx, -10, -3.5, 16, 7, 1.5); ctx.stroke(); ctx.fill();
        ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.moveTo(6, -3.5); ctx.lineTo(12, 0); ctx.lineTo(6, 3.5); ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.fillStyle = '#ff8fa3'; rr(ctx, -12, -3.5, 3, 7, 1); ctx.stroke(); ctx.fill(); break;
      case 'star':
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2; const r = i % 2 ? 4.4 : 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.stroke(); ctx.fill(); break;
      case 'trophy':
        ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(7, -9); ctx.lineTo(6, -1); ctx.quadraticCurveTo(0, 5, -6, -1); ctx.closePath(); ctx.stroke(); ctx.fill();
        rr(ctx, -2, 2, 4, 5, 1); ctx.stroke(); ctx.fill(); rr(ctx, -6, 7, 12, 3, 1); ctx.stroke(); ctx.fill(); break;
      case 'music':
        ctx.beginPath(); ctx.ellipse(-4, 6, 4, 3, -0.3, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
        ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-0.5, 5); ctx.lineTo(-0.5, -9); ctx.lineTo(7, -6); ctx.stroke(); break;
      case 'full':
        ctx.lineWidth = 3; ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-9, -9); ctx.lineTo(-3, -9); ctx.moveTo(3, -9); ctx.lineTo(9, -9); ctx.lineTo(9, -3); ctx.moveTo(9, 3); ctx.lineTo(9, 9); ctx.lineTo(3, 9); ctx.moveTo(-3, 9); ctx.lineTo(-9, 9); ctx.lineTo(-9, 3); ctx.stroke(); break;
      case 'plus':
        ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.lineWidth = 3.6; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); break;
      case 'trash':
        rr(ctx, -7, -5, 14, 15, 2); ctx.stroke(); ctx.fill(); rr(ctx, -9, -9, 18, 3, 1); ctx.stroke(); ctx.fill(); break;
      case 'save':
        rr(ctx, -9, -9, 18, 18, 2); ctx.stroke(); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(-5, -9, 10, 6); ctx.fillRect(-6, 2, 12, 7); break;
      case 'lock':
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -3, 5, Math.PI, 0); ctx.stroke(); rr(ctx, -8, -3, 16, 12, 2); ctx.lineWidth = 2; ctx.stroke(); ctx.fill(); break;
    }
    ctx.restore();
  };

  // Difficulty faces (original designs): coloured discs with simple expressions.
  A.DIFFS = {
    auto: { label: 'Auto', col: '#c7ccd9' },
    easy: { label: 'Easy', col: '#39d1ff' },
    normal: { label: 'Normal', col: '#4dff6a' },
    hard: { label: 'Hard', col: '#ffd23a' },
    harder: { label: 'Harder', col: '#ff8a1f' },
    insane: { label: 'Insane', col: '#ff4fd8' },
    demon: { label: 'Demon', col: '#ff3b3b' },
  };
  A.drawFace = function (ctx, x, y, s, diff) {
    const d = A.DIFFS[diff] || A.DIFFS.easy;
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 30, s / 30);
    if (diff === 'demon') {
      ctx.fillStyle = '#b3121c'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * 7, -10); ctx.quadraticCurveTo(k * 16, -16, k * 13, -22); ctx.quadraticCurveTo(k * 11, -14, k * 3, -12); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15);
    g.addColorStop(0, shade(d.col, 0.45)); g.addColorStop(1, d.col);
    ctx.fillStyle = g; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineCap = 'round';
    const eyes = (h, tilt) => { for (const k of [-1, 1]) { ctx.save(); ctx.translate(k * 4.5, -2.5); ctx.rotate(k * tilt); rr(ctx, -1.6, -h / 2, 3.2, h, 1.4); ctx.fill(); ctx.restore(); } };
    ctx.lineWidth = 1.8;
    switch (diff) {
      case 'auto': eyes(2, 0); ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(4, 5); ctx.stroke(); break;
      case 'easy': eyes(5, 0); ctx.beginPath(); ctx.arc(0, 3, 5, 0.2, Math.PI - 0.2); ctx.stroke(); break;
      case 'normal': eyes(5, 0); ctx.beginPath(); ctx.moveTo(-4.5, 5); ctx.quadraticCurveTo(0, 7.5, 4.5, 5); ctx.stroke(); break;
      case 'hard': eyes(5, 0.25); ctx.beginPath(); ctx.moveTo(-4.5, 6); ctx.lineTo(4.5, 6); ctx.stroke(); break;
      case 'harder': eyes(5, 0.45); ctx.beginPath(); ctx.moveTo(-4.5, 7); ctx.quadraticCurveTo(0, 3.5, 4.5, 7); ctx.stroke(); break;
      case 'insane': eyes(6, 0.6); ctx.beginPath(); ctx.moveTo(-5, 4.5); ctx.lineTo(-2.5, 7); ctx.lineTo(0, 4.5); ctx.lineTo(2.5, 7); ctx.lineTo(5, 4.5); ctx.stroke(); break;
      case 'demon':
        eyes(6, 0.7);
        ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(0, 10, 6, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-3.5, 4.8); ctx.lineTo(-2.2, 7); ctx.lineTo(-1, 5); ctx.moveTo(1, 5); ctx.lineTo(2.2, 7); ctx.lineTo(3.5, 4.8); ctx.fill(); break;
    }
    ctx.restore();
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
