/* Crab Dash — levels.
 * Each level is written with a tiny builder. Positions are in blocks: x from the start line, y up from the ground.
 * Levels are cut into musical sections (bars). Inside a section, B(k) is where the player is on beat k, so
 * obstacles can be placed to make the jump land on the beat. J() is the distance from the take-off point to a
 * spike that the jump arc is centred over, for the current speed (half the flat jump length minus half a block,
 * measured by tools/test-physics.js: 3.174 / 4.068 / 5.166 / 6.110 / 7.520 blocks at 0.5x…4x).
 */
(function (G) {
  'use strict';
  const CD = G.CD;
  const JUMP_LEN = [3.174, 4.068, 5.166, 6.110, 7.520];

  function build(meta, fn) {
    const objects = [];
    const colors = [];
    const sections = [];
    let cursor = 0, beat = 0, speed = meta.startSpeed == null ? 1 : meta.startSpeed;
    const bpb = () => CD.xSpeed(speed) * 2 * 60 / meta.bpm; // blocks per beat: units/frame × 60 / 30
    const R = (v) => Math.round(v * 2) / 2;
    const add = (o) => { objects.push(o); return o; };
    const L = {
      R, bpb,
      J: () => JUMP_LEN[speed] / 2 - 0.5,
      jumpLen: () => JUMP_LEN[speed],
      get speed() { return speed; },
      b(x, y, w = 1, h = 1, st) {
        if (w % 1 || h % 1) throw new Error(`block size must be whole blocks: ${w}x${h} at ${x}`);
        for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) add({ t: 'block', x: x + i, y: y + j, st });
      },
      // column of blocks from the ground (or y0) up to height h
      col(x, h, w = 1, y0 = 0, st) { L.b(x, y0, w, h, st); },
      slab(x, y, w = 1, top = false) { for (let i = 0; i < w; i++) add({ t: 'slab', x: x + i, y, top }); },
      s(x, y = 0) { add({ t: 'spike', x, y, rot: 0 }); },
      sd(x, y) { add({ t: 'spike', x, y, rot: 180 }); },
      sl(x, y) { add({ t: 'spike', x, y, rot: 270 }); },
      sr(x, y) { add({ t: 'spike', x, y, rot: 90 }); },
      ss(x, n, y = 0) { for (let i = 0; i < n; i++) add({ t: 'spike', x: x + i, y, rot: 0 }); },
      ssd(x, n, y) { for (let i = 0; i < n; i++) add({ t: 'spike', x: x + i, y, rot: 180 }); },
      ms(x, y = 0) { add({ t: 'mspike', x, y, rot: 0 }); },
      msd(x, y) { add({ t: 'mspike', x, y, rot: 180 }); },
      mss(x, n, y = 0) { for (let i = 0; i < n; i++) add({ t: 'mspike', x: x + i, y, rot: 0 }); },
      pad(x, y = 0, c = 'Y', rot = 0) { add({ t: 'pad', x, y, c, rot }); },
      orb(x, y, c = 'Y') { add({ t: 'orb', x, y, c }); },
      portal(x, y, p, floor) { add({ t: 'portal', x, y, p, floor }); },
      coin(x, y, i) { add({ t: 'coin', x, y, i }); },
      saw(x, y, r = 1) { add({ t: 'saw', x, y, r }); },
      deco(t, x, y, props) { add(Object.assign({ t, x, y }, props)); },
      color(x, bg, gr, dur = 0.6) { colors.push({ x, bg, gr, dur }); },
      // A speed portal placed so the change happens exactly when the player reaches x.
      speedAt(x, s, y = 1) { add({ t: 'speed', x: x + 17 / 30, y, s }); },
      // A game-mode portal placed so the switch happens exactly when the player reaches x.
      modeAt(x, p, y = 1, floor) { add({ t: 'portal', x: x + 13 / 30, y, p, floor }); },
      // Musical section: fn(B, x0, len) with B(k) = player x on beat k of this section.
      sec(bars, part, fn, opts = {}) {
        const x0 = cursor;
        if (opts.speed != null && opts.speed !== speed) { L.speedAt(x0, opts.speed, opts.speedY == null ? 1 : opts.speedY); speed = opts.speed; }
        const per = bpb();
        const len = bars * 4 * per;
        const B = (k) => x0 + k * per;
        sections.push({ x0, bars, part, beat0: beat, speed });
        if (fn) fn(B, x0, len);
        cursor += len;
        beat += bars * 4;
      },
    };
    fn(L);
    return Object.assign({}, meta, { objects, colors, sections, length: cursor, beats: beat });
  }

  // Ship tunnel: floor/ceiling column heights per block. prof = [[fromX, toX, floorH, ceilH], ...]
  // floorH counts blocks up from the play-area floor; ceilH counts blocks down from its ceiling (10 blocks up).
  function tunnel(L, prof, top = 10, base = 0) {
    for (const [a, b, fh, ch] of prof) {
      for (let x = a; x < b; x++) {
        if (fh > 0) L.b(x, base, 1, fh);
        if (ch > 0) L.b(x, base + top - ch, 1, ch);
      }
    }
    const seg = (x) => prof.find(([a, b]) => x >= a && x < b);
    return {
      // spike standing on the tunnel floor at x / hanging from the tunnel ceiling at x
      floorSpike(x) { const g = seg(x); L.s(x, base + (g ? g[2] : 0)); },
      ceilSpike(x) { const g = seg(x); L.sd(x, base + top - (g ? g[3] : 0) - 1); },
    };
  }

  // Funnel for a ground-level exit portal: a ceiling that steps down so the player must pass through it.
  // The portal at cell y=1 covers heights 0.07–2.93 blocks, so the gap ends at 3 blocks.
  function funnel(L, xPortal, top = 10, gapTop = 3, len = 8) {
    for (let i = 0; i < len; i++) {
      const x = xPortal - len + 1 + i;
      const h = Math.max(gapTop, top - Math.round(((i + 1) / len) * (top - gapTop) * 1.6));
      L.b(x, h, 1, top - h);
    }
    L.b(xPortal + 1, gapTop, 2, top - gapTop);
  }

  // Wave tunnel: a staircase corridor that follows a zig-zag path. segs = [[length, slope], ...] with slope +1/-1
  // (45°, normal wave) or +2/-2 (mini wave), 0 flat. The corridor keeps `clear` blocks of room around the path.
  function waveTunnel(L, x0, y0, segs, clear, top = 10, base = 0) {
    let x = x0, y = y0;
    for (const [len, k] of segs) {
      for (let i = 0; i < len; i++) {
        const ya = y, yb = y + k;
        const lo = Math.max(base, Math.floor(Math.min(ya, yb) - clear));
        const hi = Math.min(base + top, Math.ceil(Math.max(ya, yb) + clear));
        if (lo > base) L.b(x, base, 1, lo - base);
        if (hi < base + top) L.b(x, hi, 1, base + top - hi);
        x += 1; y = yb;
        if (y < base + 1 || y > base + top - 1) throw new Error(`wave path leaves the play area at x=${x} (y=${y})`);
      }
    }
    return { x, y };
  }

  // Gate: squeeze a corridor to exactly 2 blocks around height n so a portal centred there cannot be skipped
  // (a portal's trigger box is 2.87 blocks tall).
  function gate(L, x, n, p, top = 10, base = 0) {
    for (let c = x - 1; c <= x + 1; c++) {
      if (n - 1 > base) L.b(c, base, 1, n - 1 - base);
      if (n + 1 < base + top) L.b(c, n + 1, 1, base + top - (n + 1));
    }
    L.portal(x, n - 0.5, p);
  }

  const LEVELS = [];

  // ───────────────────────── 1. Low Tide (Easy) ─────────────────────────
  // 138.48 BPM → exactly 4.5 blocks per beat at 1x.
  LEVELS.push(build({
    id: 'low-tide', name: 'Low Tide', diff: 'easy', stars: 1, bpm: 10.386 * 60 / 4.5, song: 'lowtide',
    bg: '#0d50db', gr: '#0a3dab',
  }, (L) => {
    const { R } = L;
    L.sec(4, 'intro', (B) => {
      L.s(R(B(4) + L.J()));
      L.s(R(B(6) + L.J()));
      L.b(37.5, 0, 4, 1);
      L.s(R(B(10) + L.J()));
      L.ss(55, 2);
      L.s(R(B(14) + L.J()));
    });
    L.sec(8, 'verse', (B) => {
      // staircase up, one step per beat
      L.b(73.5, 0, 5, 1); L.b(78.5, 0, 5, 2); L.b(83.5, 0, 5, 3);
      L.coin(85, 5, 0);
      L.s(96);
      // blocks with spike pits between them
      L.b(100.5, 0, 4, 1); L.ss(104.5, 2); L.b(106.5, 0, 3, 1); L.ss(109.5, 2); L.b(111.5, 0, 4, 1);
      // yellow pad over a tall pillar
      L.pad(117.5, 0, 'Y'); L.b(121, 0, 3, 3);
      L.s(127.5); L.s(132); L.ss(136, 2);
      // long block with a spike on top
      L.b(145.5, 0, 8, 1); L.s(150, 1);
      L.s(159);
      // up two steps, jump a pit, land one step down
      L.b(163.5, 0, 5, 1); L.b(168.5, 0, 4, 2); L.ss(172.5, 3); L.b(175.5, 0, 4, 1);
      L.s(186); L.ss(190, 2); L.s(199.5); L.s(204); L.s(208.5);
    });
    L.color(216, '#1464e0', '#0f4cc0', 1.2);
    L.sec(8, 'build', (B) => {
      L.b(217.5, 0, 4, 1);
      // floating platforms over spikes
      L.b(222.5, 1, 5, 1); L.ss(222, 5);
      L.b(228.5, 1, 7, 1); L.ss(227, 9);
      L.pad(243.5, 0, 'P'); L.s(244.5);
      L.pad(252.5, 0, 'Y'); L.b(254.5, 0, 2, 2); L.s(255, 2);
      L.ss(262, 2); L.s(267);
      L.b(271.5, 0, 5, 1); L.b(276.5, 0, 9, 2); L.s(280.5, 2);
      L.s(289.5); L.s(294);
      L.b(298.5, 0, 10, 1); L.s(303, 1);
      L.ss(311.5, 2);
      L.b(321, 0, 4, 1); L.s(325); L.b(326, 0, 4, 2); L.s(330); L.b(331, 0, 4, 2); L.b(335, 0, 4, 3); L.ss(339, 2);
      L.s(348); L.ss(352, 2);
    });
    L.color(360, '#8a2be2', '#6a1fb8', 0.8);
    L.sec(8, 'drop', (B, x0) => {
      L.modeAt(x0, 'ship', 1);
      L.deco('arrow', x0 - 3, 3);
      tunnel(L, [
        [370, 378, 1, 2], [378, 386, 2, 2], [386, 394, 3, 1], [394, 402, 2, 2], [402, 410, 1, 3], [410, 418, 2, 3],
        [418, 426, 3, 2], [426, 434, 4, 1], [434, 442, 3, 2], [442, 450, 2, 3], [450, 458, 1, 4], [458, 466, 2, 3],
        [466, 474, 3, 2], [474, 482, 2, 2], [482, 490, 1, 3],
      ]);
      L.s(381, 2); L.sd(389, 8); L.s(405, 1); L.sd(421, 7); L.s(445, 2); L.sd(461, 6); L.s(485, 1);
      funnel(L, 503);
      L.coin(365, 6, 1);
    });
    L.color(504, '#0d50db', '#0a3dab', 1.0);
    L.sec(8, 'verse', (B, x0) => {
      L.modeAt(x0, 'cube', 1);
      L.s(514.5);
      L.b(519, 0, 4, 1); L.b(523, 0, 9, 2); L.s(528, 2);
      L.pad(536, 0, 'Y'); L.b(538.5, 0, 1, 2); L.s(538.5, 2);
      L.ss(545.5, 2); L.s(550.5); L.s(555);
      L.pad(558.5, 0, 'P'); L.s(559.5);
      L.s(564);
      L.ss(568, 21);
      L.b(568.5, 1, 4, 1); L.b(574.5, 1, 4, 1); L.b(579.5, 1, 4, 1); L.b(584, 1, 4, 1);
      L.s(600); L.ss(604, 2);
      L.b(613.5, 0, 4, 1); L.b(617.5, 0, 5, 2); L.ss(622.5, 3); L.b(625.5, 0, 4, 1);
      L.s(636); L.s(640.5);
    });
    L.sec(2, 'outro', (B) => {
      L.s(649.5); L.ss(658, 2); L.s(667.5);
      L.coin(672, 2, 2);
    });
  }));

  // ───────────────────────── 2. Crab Walk (Normal) ─────────────────────────
  // 155.79 BPM → exactly 4 blocks per beat at 1x. Introduces orbs, mini size, gravity and 2x speed.
  LEVELS.push(build({
    id: 'crab-walk', name: 'Crab Walk', diff: 'normal', stars: 3, bpm: 10.386 * 60 / 4, song: 'crabwalk',
    bg: '#c2168f', gr: '#9e1276',
  }, (L) => {
    const { R } = L;
    L.sec(4, 'intro', (B) => {
      L.s(13.5); L.s(21.5); L.ss(29, 2);
      L.b(37.5, 0, 4, 1);
      L.s(45.5);
      // first orb: jump, tap the orb, sail over the pit
      L.orb(54.5, 2, 'Y'); L.ss(54, 5);
    });
    L.sec(8, 'verse', (B) => {
      // orb chain over a long pit
      L.ss(70, 13);
      L.orb(70, 2, 'Y'); L.orb(74, 2.5, 'Y'); L.orb(78, 3, 'Y');
      L.coin(80, 6.5, 0);
      L.s(89.5);
      // pink orb over a spiked pillar
      L.orb(93.5, 2, 'P'); L.ss(93.5, 4);
      // mini section
      L.portal(100.5, 1, 'mini');
      L.s(105); L.s(109); L.b(113, 0, 2, 1); L.s(117); L.s(121);
      L.portal(124.5, 1, 'big');
      // ceiling run with gravity portals
      L.portal(133, 1, 'gravUp');
      L.b(134, 4, 18, 1); L.sd(141.5, 3); L.sd(149.5, 3);
      L.coin(145, 1.5, 1);
      L.portal(151, 2, 'gravDown');
      L.s(161.5); L.ss(165, 2);
      // blue pad to the ceiling
      L.pad(168.5, 0, 'B');
      L.b(170, 4, 14, 1); L.sd(177.5, 3);
      L.portal(182, 2, 'gravDown');
      L.s(189.5);
    });
    L.color(192, '#d4167e', '#ad126a', 0.8);
    L.sec(4, 'build', (B) => {
      L.s(197.5); L.s(201.5); L.ss(205, 2);
      L.b(209.5, 0, 8, 1); L.s(213.5, 1);
      L.s(221.5);
      L.pad(224.5, 0, 'P'); L.s(225.5);
      L.s(229.5);
      L.orb(233.5, 2, 'Y'); L.ss(233, 3);
      L.s(241.5); L.s(245.5); L.ss(249, 2);
    });
    L.color(256, '#1478b8', '#0f6096', 0.6);
    L.sec(8, 'drop', (B, x0) => {
      L.modeAt(x0, 'ship', 1);
      L.deco('arrow', x0 - 3, 3);
      for (let i = 0; i < 13; i++) {
        const x = 264 + i * 8;
        if (i % 2 === 0) { L.b(x, 0, 2, 5); if (i % 4 === 2) L.ss(x, 2, 5); }
        else { L.b(x, 5, 2, 5); if (i % 4 === 3) L.ssd(x, 2, 4); }
      }
      L.coin(288.5, 0, 2);
      funnel(L, 383);
    });
    L.color(384, '#c2168f', '#9e1276', 0.8);
    L.sec(4, 'break', (B, x0) => {
      L.modeAt(x0, 'cube', 1);
      L.s(397.5); L.s(405.5);
      L.b(413.5, 0, 4, 1); L.b(417.5, 0, 4, 2);
      L.s(429.5); L.ss(437, 2);
    });
    L.color(448, '#d4390f', '#ae2f0c', 0.5);
    L.sec(8, 'drop2', (B) => {
      const J = L.J();
      for (const k of [1, 3, 5]) L.s(R(B(k) + J));
      L.ss(R(B(7) + J - 0.5), 2);
      L.b(R(B(9)) + 1.5, 0, 6, 1); L.s(R(B(10) + J), 1);
      L.s(R(B(12) + J)); L.s(R(B(13) + J));
      L.orb(R(B(15) + 2), 2, 'Y'); L.ss(R(B(15) + 2), 4);
      L.pad(R(B(18)), 0, 'Y'); L.b(R(B(18)) + 3, 0, 2, 3);
      L.s(R(B(20) + J)); L.ss(R(B(21) + J - 0.5), 2);
      L.b(R(B(23)) + 1.5, 0, 5, 1); L.b(R(B(24)) + 1.5, 0, 5, 2);
      L.s(R(B(27) + J)); L.s(R(B(28) + J)); L.ss(R(B(29) + J - 0.5), 2);
    }, { speed: 2 });
    L.sec(2, 'outro', (B) => {});
  }));

  // ───────────────────────── 3. Coral Drift (Hard) ─────────────────────────
  // 166.18 BPM → 3.75 blocks per beat at 1x. Gravity orbs, ceiling runs, mini, the ball, a 2x ship tunnel.
  LEVELS.push(build({
    id: 'coral-drift', name: 'Coral Drift', diff: 'hard', stars: 5, bpm: 10.386 * 60 / 3.75, song: 'coral',
    bg: '#0e9e6e', gr: '#0b7f58',
  }, (L) => {
    const { R } = L;
    L.sec(4, 'intro', (B) => {
      L.s(13); L.ss(20, 2);
      L.b(27.5, 0, 7, 1); L.s(31.5, 1);
      L.s(39); L.s(43); L.ss(46, 2);
      L.pad(53, 0, 'P'); L.s(54);
    });
    L.sec(8, 'verse', (B) => {
      // blue orb flips us onto a ceiling
      L.orb(64.5, 1.5, 'B');
      L.b(64, 5, 26, 1); L.sd(73, 4); L.sd(80.5, 4);
      L.portal(86, 3, 'gravDown');
      L.s(95.5); L.ss(99, 2);
      // yellow pad up to a high shelf
      L.pad(105.5, 0, 'Y'); L.b(108, 3, 14, 1); L.s(114, 4);
      L.s(129);
      // blue pad to another ceiling
      L.pad(131.5, 0, 'B');
      L.b(133, 5, 19, 1); L.sd(140.5, 4); L.sd(148, 4);
      L.portal(150, 3, 'gravDown');
      L.coin(144, 1, 0);
      L.s(159); L.s(163); L.ss(166, 2); L.s(174);
    });
    L.color(180, '#0c8aa0', '#0a7084', 0.8);
    L.sec(4, 'build', (B) => {
      L.portal(181, 1, 'mini');
      L.s(188.5); L.s(196); L.b(199.5, 0, 2, 1); L.s(207.5); L.s(215); L.s(222.5);
      L.portal(229, 1, 'big');
      L.s(234);
    });
    L.color(240, '#b8327a', '#962863', 0.5);
    L.sec(8, 'drop', (B, x0) => {
      L.modeAt(x0, 'ball', 1);
      // alternate floor and ceiling spikes, one flip per beat or two
      const pat = [[2, 'f'], [4, 'c'], [6, 'f'], [8, 'c'], [9, 'f'], [11, 'c'], [12, 'f'], [14, 'c']];
      for (const [k, where] of pat) {
        const x = R(B(k) + 1);
        if (where === 'f') L.ss(x, 2, 0); else L.ssd(x, 2, 7);
      }
      // pillars: stay up top, then drop between them
      L.b(R(B(16)) + 1, 0, 6, 3); L.ss(R(B(16)) + 1, 6, 3);
      L.b(R(B(19)) + 1, 5, 6, 3); L.ssd(R(B(19)) + 1, 6, 4);
      L.b(R(B(22)) + 1, 0, 6, 3); L.ss(R(B(22)) + 1, 6, 3);
      L.coin(R(B(22)) + 3, 6.5, 1);
      L.ss(R(B(25) + 1), 2, 0); L.ssd(R(B(26.5) + 1), 2, 7); L.ss(R(B(28) + 1), 2, 0);
      funnel(L, R(B(32)) - 1, 8);
    });
    L.color(360, '#0e9e6e', '#0b7f58', 0.8);
    L.sec(4, 'break', (B, x0) => {
      L.modeAt(x0 - 1, 'cube', 1);
      L.s(R(B(3) + L.J())); L.ss(R(B(5) + L.J() - 0.5), 2);
      L.b(R(B(7)) + 1.5, 0, 5, 1); L.b(R(B(8)) + 1.5, 0, 5, 2);
      L.s(R(B(11) + L.J())); L.s(R(B(13) + L.J()));
    });
    L.color(420, '#e0541a', '#b84314', 0.4);
    L.sec(8, 'drop2', (B, x0) => {
      L.modeAt(x0, 'ship', 1);
      L.deco('arrow', x0 - 3, 3);
      const prof = [];
      const shape = [[1, 4], [2, 4], [3, 3], [4, 2], [3, 3], [2, 4], [1, 5], [0, 5], [2, 4], [3, 3], [4, 2], [5, 1], [4, 2], [3, 3], [2, 4], [1, 4], [2, 3], [3, 2], [2, 3]];
      let x = x0 + 8;
      for (const [fh, ch] of shape) { prof.push([x, x + 7, fh, ch]); x += 7; }
      const T = tunnel(L, prof);
      T.floorSpike(x0 + 18); T.ceilSpike(x0 + 33); T.floorSpike(x0 + 47); T.ceilSpike(x0 + 61); T.floorSpike(x0 + 75); T.floorSpike(x0 + 96); T.ceilSpike(x0 + 110);
      L.coin(x0 + 57, 1, 2);
      funnel(L, Math.floor(x0 + 32 * L.bpb()) - 1);
    }, { speed: 2 });
    L.sec(2, 'outro', (B, x0) => {
      L.modeAt(x0, 'cube', 1);
    });
  }));

  // ───────────────────────── 4. Shell Shock (Harder) ─────────────────────────
  // 154.97 BPM → exactly 5 blocks per beat at 2x (4.02 at 1x, 6.04 at 3x). Robot, UFO, 3x speed.
  LEVELS.push(build({
    id: 'shell-shock', name: 'Shell Shock', diff: 'harder', stars: 7, bpm: 12.914 * 60 / 5, song: 'shell',
    bg: '#d4520f', gr: '#a8400b',
  }, (L) => {
    const { R } = L;
    const on = (B, k, n = 1) => { const x = R(B(k) + L.J() - (n - 1) / 2); L.ss(x, n); return x; };
    L.sec(4, 'intro', (B) => {
      on(B, 3); on(B, 5, 2); on(B, 7); on(B, 8);
      L.b(R(B(10)) + 1.5, 0, 8, 1); L.s(R(B(11) + L.J()), 1);
      on(B, 13, 2);
    });
    L.color(64, '#e0461a', '#b43812', 0.3);
    L.sec(8, 'verse', (B) => {
      on(B, 1); on(B, 2); on(B, 3, 2);
      L.b(R(B(5)) + 1.5, 0, 5, 1); L.b(R(B(5)) + 6.5, 0, 5, 2);
      L.ss(R(B(5)) + 11.5, 3); L.b(R(B(5)) + 14.5, 0, 7, 2);
      // orb chain
      const o = R(B(10));
      L.ss(o + 2, 15);
      L.orb(o + 2, 2, 'Y'); L.orb(o + 7, 2.5, 'Y'); L.orb(o + 12, 3, 'Y');
      L.coin(o + 14, 6.5, 0);
      on(B, 15); on(B, 16, 2); on(B, 17, 3);
      L.pad(R(B(19)), 0, 'Y'); L.b(R(B(19)) + 2.5, 0, 2, 3); L.ss(R(B(19)) + 2.5, 2, 3);
      // gravity hop
      const g = R(B(22));
      L.orb(g + 1.5, 1.5, 'B');
      L.b(g + 1, 5, 18, 1); L.sd(R(B(24) + L.J()), 4); L.sd(R(B(26) + L.J()), 4);
      L.portal(g + 16, 3, 'gravDown');
      on(B, 29); on(B, 30, 3);
    }, { speed: 2 });
    L.color(224.3, '#8a2be2', '#6b20b0', 0.4);
    L.sec(4, 'build', (B, x0) => {
      L.modeAt(x0, 'robot', 1);
      // robot: short hops over spikes, long holds over walls
      L.s(R(B(2))); L.b(R(B(4.5)), 0, 1, 2); L.s(R(B(7))); L.b(R(B(9.5)), 0, 1, 2); L.ss(R(B(12)), 2); L.b(R(B(14.5)), 0, 2, 1);
    }, { speed: 2 });
    L.color(304.3, '#1a5fd0', '#154ca6', 0.4);
    L.sec(8, 'drop', (B, x0) => {
      L.modeAt(x0, 'ufo', 1);
      L.deco('arrow', x0 - 3, 3);
      const gaps = [1, 2, 3, 2, 4, 5, 4, 3, 2, 3, 4, 2, 3];
      for (let i = 0; i < gaps.length; i++) {
        const x = x0 + 10 + i * 11;
        const lo = gaps[i];
        if (lo > 0) L.b(x, 0, 2, lo);
        L.b(x, lo + 4, 2, 10 - lo - 4);
        if (i % 3 === 2) L.sd(x, lo + 3);
      }
      L.coin(x0 + 10 + 5 * 11 + 5.5, 9, 1);
      funnel(L, Math.floor(x0 + 32 * L.bpb()) - 1);
    }, { speed: 2 });
    L.color(464.3, '#d4520f', '#a8400b', 0.6);
    L.sec(4, 'break', (B, x0) => {
      L.modeAt(x0 - 1, 'cube', 1);
      on(B, 3); on(B, 5, 2);
      L.portal(R(B(7)), 1, 'mini');
      L.s(R(B(8.5) + 1)); L.s(R(B(10) + 1)); L.b(R(B(11.5)), 0, 2, 1); L.s(R(B(13) + 1));
      L.portal(R(B(14.5)), 1, 'big');
      L.coin(R(B(11.5)) + 1, 2, 2);
    }, { speed: 1 });
    L.color(528.6, '#e0231a', '#b01c14', 0.3);
    L.sec(8, 'drop2', (B) => {
      on(B, 1, 3); on(B, 3); on(B, 4, 3); on(B, 6, 2);
      L.b(R(B(8)) + 2, 0, 8, 1); L.ss(R(B(9) + L.J()) - 1, 3, 1);
      L.b(R(B(11)) + 2, 0, 6, 2);
      on(B, 14, 3); on(B, 16); on(B, 17);
      L.pad(R(B(19)), 0, 'Y'); L.b(R(B(19)) + 3, 0, 2, 3); L.ss(R(B(19)) + 3, 2, 3);
      on(B, 22, 3); on(B, 24, 2); on(B, 25, 3); on(B, 27); on(B, 28, 3);
    }, { speed: 3 });
    L.sec(2, 'outro', () => {}, { speed: 3 });
  }));

  // ───────────────────────── 5. Riptide (Insane) ─────────────────────────
  // 156 BPM → exactly 6 blocks per beat at 3x (4.97 at 2x, 3.99 at 1x). Wave, mini wave, spider, 3x speed.
  LEVELS.push(build({
    id: 'riptide', name: 'Riptide', diff: 'insane', stars: 9, bpm: 15.6 * 60 / 6, song: 'riptide',
    bg: '#5a1ab8', gr: '#48159a',
  }, (L) => {
    const { R } = L;
    const on = (B, k, n = 1, y = 0) => { const x = R(B(k) + L.J() - (n - 1) / 2); L.ss(x, n, y); return x; };
    L.sec(4, 'intro', (B) => {
      on(B, 3); on(B, 4, 2); on(B, 6);
      L.orb(R(B(8)) + 2, 2, 'Y'); L.ss(R(B(8)) + 1.5, 4);
      on(B, 11, 2);
      L.pad(R(B(13)), 0, 'P'); L.s(R(B(13)) + 1);
      on(B, 14, 2);
    });
    L.color(63.9, '#2a1a8a', '#20146e', 0.3);
    L.sec(8, 'verse', (B, x0) => {
      L.modeAt(x0, 'wave', 1);
      L.deco('arrow', x0 - 3, 2);
      waveTunnel(L, x0 + 6, 2, [[3, 1], [3, -1], [4, 1], [2, 0], [2, 1], [4, -1], [2, 1], [4, -1], [2, 0], [4, 1], [2, 1], [3, -1], [3, -1], [2, 0],
        [3, 1], [3, -1], [4, 1], [4, -1], [5, 1], [1, 1], [4, -1], [2, -1], [3, 1], [3, -1], [4, 1], [3, -1], [3, 1], [4, -1], [3, 0], [4, 1],
        [4, -1], [3, 1], [3, -1]], 1.6);
      funnel(L, Math.floor(x0 + 32 * L.bpb()) - 1);
      L.coin(x0 + 38, 8.2, 0);
    }, { speed: 2 });
    L.color(223, '#8a1a9a', '#6e1480', 0.4);
    L.sec(4, 'build', (B, x0) => {
      L.modeAt(x0, 'spider', 1);
      for (const [k, w] of [[2, 'f'], [3.5, 'c'], [5, 'f'], [6, 'c'], [7.5, 'f'], [9, 'c'], [10, 'f'], [11, 'c'], [12.5, 'f'], [14, 'c']]) {
        const x = R(B(k)) + 2;
        if (w === 'f') L.ss(x, 2, 0); else L.ssd(x, 2, 8);
      }
      funnel(L, Math.floor(x0 + 16 * L.bpb()) - 1, 9);
    }, { speed: 2 });
    L.color(302.5, '#b8127a', '#940e62', 0.3);
    L.sec(8, 'drop', (B, x0) => {
      L.modeAt(x0, 'wave', 1);
      let e = waveTunnel(L, x0 + 5, 2, [[4, 1], [4, -1], [3, 1], [3, 1], [3, -1], [3, -1], [2, 0], [3, 1], [3, 1], [4, -1], [2, 1], [3, -1]], 1.6);
      gate(L, e.x + 1, Math.round(e.y), 'mini');
      e = waveTunnel(L, e.x, e.y, [[2, 0], [2, 2], [2, -2], [1, 2], [1, -2], [2, 2], [1, -2], [1, -2], [3, 0], [1, 2], [1, 2], [2, -2], [1, 2], [1, -2],
        [2, 0], [2, 2], [1, -2], [1, -2], [3, 0]], 1.3);
      gate(L, e.x + 1, Math.round(e.y), 'big');
      L.coin(e.x - 20, Math.round(e.y) + 2, 1);
      waveTunnel(L, e.x, e.y, [[3, 0], [3, 1], [4, -1], [3, 1], [3, -1], [4, 1], [3, -1], [3, 1], [4, -1]], 1.6);
      funnel(L, Math.floor(x0 + 32 * L.bpb()) - 1);
    }, { speed: 2 });
    L.color(461.5, '#5a1ab8', '#48159a', 0.5);
    L.sec(4, 'break', (B, x0) => {
      L.modeAt(x0 - 1, 'cube', 1);
      on(B, 3, 2); on(B, 5);
      L.portal(R(B(6)) + 1, 1, 'gravUp'); L.b(R(B(6)), 5, 22, 1);
      L.sd(R(B(8) + L.J()), 4); L.sd(R(B(9.5) + L.J()), 4);
      L.portal(R(B(6)) + 19, 3, 'gravDown');
      L.coin(R(B(8)) + 1, 1, 2);
      on(B, 14);
    }, { speed: 1 });
    L.color(525.4, '#d01a4a', '#a8143c', 0.3);
    L.sec(8, 'drop2', (B, x0) => {
      on(B, 1, 3); on(B, 2, 2); on(B, 3, 3);
      L.b(R(B(5)) + 2, 0, 9, 1); on(B, 6, 3, 1);
      L.b(R(B(7)) + 3, 0, 8, 2); on(B, 8, 2, 2);
      L.orb(R(B(10)) + 3, 2.5, 'Y'); L.ss(R(B(10)) + 2, 7);
      on(B, 12, 3); on(B, 13, 3);
      L.modeAt(R(B(15)), 'ball', 1);
      for (const [k, w] of [[17, 'f'], [18.5, 'c'], [20, 'f'], [21, 'c'], [22.5, 'f'], [24, 'c'], [25, 'f'], [26.5, 'c']]) {
        const x = R(B(k)) + 2;
        if (w === 'f') L.ss(x, 3, 0); else L.ssd(x, 3, 7);
      }
      funnel(L, R(B(29)), 8);
      L.modeAt(R(B(29)) + 1, 'cube', 1);
      on(B, 31, 3);
    }, { speed: 3 });
    L.sec(2, 'outro', () => {}, { speed: 3 });
  }));

  // ───────────────────────── 6. The Abyss (Demon) ─────────────────────────
  // 144 BPM → exactly 8 blocks per beat at 4x (6.5 at 3x, 5.38 at 2x, 4.33 at 1x). Everything, fast.
  LEVELS.push(build({
    id: 'the-abyss', name: 'The Abyss', diff: 'demon', stars: 10, bpm: 19.2 * 60 / 8, song: 'abyss',
    bg: '#5c0a14', gr: '#46070f',
  }, (L) => {
    const { R } = L;
    const on = (B, k, n = 1, y = 0) => { const x = R(B(k) + L.J() - (n - 1) / 2); L.ss(x, n, y); return x; };
    L.sec(4, 'intro', (B) => {
      on(B, 3); on(B, 4, 2); on(B, 5); on(B, 6, 2);
      L.b(R(B(8)) + 1.5, 0, 4, 1); L.b(R(B(9)) + 1.5, 0, 4, 2); L.s(R(B(10) + L.J()) , 2);
      L.b(R(B(10)) + 1.5, 0, 4, 2);
      on(B, 12, 2); on(B, 13); on(B, 14, 2);
    });
    L.color(69.3, '#3a0610', '#2c040c', 0.2);
    L.sec(8, 'verse', (B) => {
      on(B, 1, 3); on(B, 2, 3); on(B, 3, 2);
      // blue orb to the ceiling, green orb back down
      const g = R(B(4.5));
      L.orb(g + 2, 1.5, 'B'); L.b(g + 2, 5, 30, 1);
      L.sd(R(B(6) + L.J()), 4); L.ssd(R(B(7) + L.J()) - 0.5, 2, 4); L.sd(R(B(8) + L.J()), 4);
      L.portal(g + 29, 3, 'gravDown');
      L.coin(g + 16, 2, 0);
      on(B, 12, 3); on(B, 13, 3);
      L.pad(R(B(14.5)), 0, 'Y'); L.b(R(B(14.5)) + 3, 0, 2, 3); L.ss(R(B(14.5)) + 3, 2, 3);
      L.orb(R(B(17)) + 3, 2, 'Y'); L.orb(R(B(17)) + 9.5, 3, 'P'); L.ss(R(B(17)) + 2, 12);
      on(B, 21, 2); on(B, 22, 3);
      L.b(R(B(23.5)) + 2, 0, 12, 1); on(B, 24, 3, 1); on(B, 25, 2, 1);
      on(B, 27, 3); on(B, 28, 3); on(B, 29, 3); on(B, 30, 2);
    }, { speed: 3 });
    L.color(277.3, '#6a0a5a', '#520846', 0.2);
    L.sec(4, 'build', (B, x0) => {
      L.modeAt(x0, 'spider', 1);
      for (const [k, w] of [[1.5, 'f'], [2.5, 'c'], [3.5, 'f'], [4.5, 'c'], [5.25, 'f'], [6, 'c']]) {
        const x = R(B(k)) + 2;
        if (w === 'f') L.ss(x, 2, 0); else L.ssd(x, 2, 8);
      }
      funnel(L, R(B(8.5)), 9);
      L.modeAt(R(B(8.5)) + 1, 'ball', 1);
      for (const [k, w] of [[10, 'f'], [11.5, 'c'], [13, 'f'], [14.5, 'c']]) {
        const x = R(B(k)) + 2;
        if (w === 'f') L.ss(x, 3, 0); else L.ssd(x, 3, 7);
      }
      funnel(L, Math.floor(x0 + 16 * L.bpb()) - 1, 8);
    }, { speed: 3 });
    L.color(381.3, '#8a1030', '#6c0c26', 0.2);
    L.sec(8, 'drop', (B, x0) => {
      L.modeAt(x0, 'ship', 1);
      const shape = [[2, 4], [3, 4], [4, 3], [5, 2], [4, 3], [3, 4], [2, 5], [3, 4], [4, 3], [3, 4], [2, 5], [1, 5], [2, 4], [3, 3], [4, 2], [5, 2], [4, 3]];
      const prof = [];
      let x = x0 + 8;
      for (const [fh, ch] of shape) { prof.push([x, x + 6, fh, ch]); x += 6; }
      const T = tunnel(L, prof);
      T.floorSpike(x0 + 17); T.ceilSpike(x0 + 29); T.floorSpike(x0 + 41); T.ceilSpike(x0 + 53); T.floorSpike(x0 + 65); T.ceilSpike(x0 + 77); T.floorSpike(x0 + 89);
      L.coin(x0 + 27, 6.5, 1);
      // straight into the wave
      gate(L, x + 1, 5, 'wave');
      waveTunnel(L, x + 2, 5, [[3, 1], [4, -1], [3, -1], [4, 1], [3, 1], [3, -1], [4, -1], [2, 1], [3, 1], [3, -1], [4, 1], [3, -1], [3, 1], [4, -1],
        [2, -1], [4, 1], [3, 1], [2, -1], [3, -1], [3, 1], [4, -1]], 1.4);
      funnel(L, Math.floor(x0 + 32 * L.bpb()) - 1);
    }, { speed: 3 });
    L.color(589.3, '#3a0610', '#2c040c', 0.3);
    L.sec(4, 'break', (B, x0) => {
      L.modeAt(x0 - 1, 'ufo', 1);
      const gaps = [2, 3, 4, 3, 2, 4, 5];
      for (let i = 0; i < gaps.length; i++) {
        const xx = x0 + 8 + i * 10;
        const lo = gaps[i];
        L.b(xx, 0, 2, lo); L.b(xx, lo + 4, 2, 10 - lo - 4);
      }
      L.coin(x0 + 8 + 3 * 10 + 5, 8.5, 2);
      funnel(L, Math.floor(x0 + 16 * L.bpb()) - 1);
    }, { speed: 2 });
    L.color(675.4, '#b0102a', '#8a0c20', 0.2);
    L.sec(8, 'drop2', (B, x0) => {
      L.modeAt(x0 - 1, 'cube', 1);
      on(B, 1, 3); on(B, 2, 3); on(B, 3, 3);
      L.b(R(B(4)) + 3, 0, 14, 1); on(B, 5, 3, 1);
      L.b(R(B(6)) + 3, 0, 10, 2); on(B, 7, 3, 2);
      L.orb(R(B(9)) + 4, 2.5, 'Y'); L.ss(R(B(9)) + 2, 11);
      on(B, 11, 3); on(B, 12, 3);
      L.pad(R(B(13)), 0, 'R'); L.b(R(B(13)) + 5, 0, 2, 4); L.ss(R(B(13)) + 5, 2, 4);
      on(B, 16, 3); on(B, 17, 2); on(B, 18, 3); on(B, 19, 3);
      L.orb(R(B(21)) + 4, 2, 'B'); L.b(R(B(21)) + 3, 5, 24, 1); L.sd(R(B(22.5) + L.J()), 4); L.sd(R(B(23.5) + L.J()), 4);
      L.portal(R(B(21)) + 25, 3, 'gravDown');
      on(B, 27, 3); on(B, 28, 3); on(B, 29, 3);
    }, { speed: 4 });
    L.sec(2, 'outro', () => {}, { speed: 4 });
  }));

  CD.LEVELS = LEVELS;
  CD.levelBuild = build;
  CD.levelTunnel = tunnel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
