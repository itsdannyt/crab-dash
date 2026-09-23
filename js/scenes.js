/* Crab Dash — menus: title, main menu, level select, icon kit, popups, pause and level-complete screens. */
(function (G) {
  'use strict';
  const CD = G.CD;
  const A = CD.art, R = CD.render, AU = CD.audio, UI = CD.ui, Game = CD.game;
  const VH = 320;
  const MENU_SONG = [{ bars: 4, part: 'intro' }, { bars: 8, part: 'verse' }, { bars: 8, part: 'ambient' }, { bars: 8, part: 'verse2' }];
  function menuMusic() { if (!Game.menuPlaying) { AU.playSong('menu', 118, MENU_SONG, { loop: true }); Game.menuPlaying = true; } }
  Game.stopMenuMusic = function () { Game.menuPlaying = false; };

  // A crab that runs along the menu floor, hopping now and then and sometimes taking the ship out.
  const Runner = {
    init() {
      this.level = { objs: [], cols: [], colBase: 0, endX: 1e12 };
      this.sim = { level: this.level, p: CD.newPlayer({}) };
      this.vis = { rot: 0, sq: 0 };
      this.next = 1.5; this.hold = 0; this.modeT = 8;
      this.acc = 0;
    },
    update(dt) {
      if (!this.sim) this.init();
      const p = this.sim.p;
      this.acc += dt * CD.TPS;
      this.next -= dt; this.modeT -= dt;
      if (this.modeT <= 0) {
        if (p.mode === 'cube' && Math.random() < 0.5) { p.mode = 'ship'; CD.setBounds(p, 'ship', 0); this.modeT = 4 + Math.random() * 3; }
        else { p.mode = 'cube'; CD.setBounds(p, 'cube', 0); this.modeT = 7 + Math.random() * 6; }
      }
      let press = false;
      if (p.mode === 'ship') {
        if (this.next <= 0) { this.target = 25 + Math.random() * 70; this.next = 0.8 + Math.random() * 1.2; }
        const want = p.y < (this.target || 50) && p.vy < 3;
        press = want && this.hold <= 0;
        this.hold = want ? 1 : 0;
      } else if (this.next <= 0) { press = true; this.hold = 0.05; this.next = 0.6 + Math.random() * 2.2; }
      const n = Math.min(40, Math.floor(this.acc));
      this.acc -= n;
      for (let i = 0; i < n; i++) {
        const held = this.hold > 0;
        const ev = CD.tick(this.sim, held, press && i === 0);
        this.hold -= CD.STEP / 60;
        if (p.mode === 'cube') {
          this.vis.rot = 0; // upright, no spin
          if (ev & CD.EV.LAND) this.vis.sq = -1;
          if (ev & CD.EV.JUMP) this.vis.sq = 1;
        } else {
          const tgt = -Math.atan2(p.vy, CD.xSpeed(p.speed)) * 0.9;
          this.vis.rot += (tgt - this.vis.rot) * 0.18;
        }
      }
      if (p.y > 130) { p.y = 130; if (p.vy > 0) p.vy = 0; }
      this.vis.sq *= Math.exp(-dt * 14);
      // dust
      const ic = Game.icon();
      if (p.onGround && Math.random() < dt * 45) R.spawn(p.x - 15, p.y - 15, -30 - Math.random() * 60, 10 + Math.random() * 40, 0.4, 2 + Math.random() * 2, ic.c2);
      if (p.mode === 'ship' && Math.random() < dt * 40) R.spawn(p.x - 14, p.y - 3, -80, (Math.random() - 0.5) * 30, 0.35, 3, ic.c2);
    },
    camX() { return this.sim.p.x - (R.VW / 2 - 75) - R.VW * 0.12; },
    draw(ctx, bg, gr) {
      const cx = this.camX(), cy = Game.CAM_GROUND;
      const t = performance.now() / 1000;
      R.drawBackground(ctx, bg, cx, cy, 0);
      R.drawGround(ctx, gr, '#ffffff', cx, VH - (0 - cy), 1);
      R.drawPlayer(ctx, this.sim.p, { rot: this.vis.rot, sq: this.vis.sq, blink: Math.sin(t * 0.9) > 0.99 }, Game.icon(), cx, cy, t);
      R.drawParticles(ctx, cx, cy);
    },
  };

  // Menu background colours drift through the level palette, like the original's shifting menu.
  const MENU_COLS = [['#0b3fb4', '#0a3dab'], ['#a0167a', '#8a1368'], ['#0f8a3c', '#0c7433'], ['#c8490f', '#a83c0c'], ['#5a1ab8', '#4a169c'], ['#0e6b8a', '#0b5a74']];
  function menuColors(t) {
    const i = Math.floor(t / 7) % MENU_COLS.length, j = (i + 1) % MENU_COLS.length;
    const k = Math.min(1, ((t / 7) % 1) * 3);
    return [A.mix(MENU_COLS[i][0], MENU_COLS[j][0], k), A.mix(MENU_COLS[i][1], MENU_COLS[j][1], k)];
  }

  function drawLogo(ctx, x, y, s, t) {
    const word = 'CRAB DASH';
    ctx.save();
    ctx.font = `${s}px ${A.FONT}`;
    const widths = [...word].map((ch) => ctx.measureText(ch).width * 0.96);
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = x - total / 2;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const w = widths[i];
      if (ch !== ' ') {
        const bob = Math.sin(t * 2.2 + i * 0.55) * s * 0.035;
        ctx.save();
        ctx.translate(cx + w / 2, y + bob);
        ctx.rotate(Math.sin(t * 1.3 + i) * 0.03);
        A.text(ctx, ch, 0, 0, s, { grad: ['#fff4a3', '#ff9d1e'], sw: s * 0.11, strokeColor: '#3a1a05', shadowColor: 'rgba(0,0,0,0.5)' });
        ctx.restore();
      }
      cx += w;
    }
    // a little claw on the D
    ctx.restore();
  }

  // ───────────────────────── title / loading ─────────────────────────
  Game.scenes.title = {
    enter() { this.t = 0; this.ready = false; },
    update(dt) {
      this.t += dt;
      Runner.update(dt);
      R.updateParticles(dt);
      if (!this.ready && this.t > 0.6 && (Game.fontsReady || this.t > 3)) this.ready = true;
    },
    key(e, down) { if (down && this.ready && (e.code === 'Space' || e.code === 'Enter')) { this.start(); return true; } return false; },
    pointer(x, y, down) { if (down && this.ready) this.start(); return true; },
    start() { AU.init(); AU.sfx('click'); menuMusic(); Game.go('menu'); },
    draw(ctx) {
      const [bg, gr] = menuColors(this.t);
      Runner.draw(ctx, bg, gr);
      drawLogo(ctx, R.VW / 2, 84, 54, this.t);
      if (!this.ready) {
        const w = 160;
        UI.bar(ctx, R.VW / 2 - w / 2, 170, w, 8, Math.min(1, this.t / 0.9), ['#b8ff78', '#58d41f']);
        A.text(ctx, 'Loading\u2026', R.VW / 2, 192, 11);
      } else {
        const a = 0.6 + 0.4 * Math.sin(this.t * 4);
        A.text(ctx, 'Click, tap or press Space to start', R.VW / 2, 178, 14, { alpha: a });
      }
    },
  };

  // ───────────────────────── main menu ─────────────────────────
  Game.scenes.menu = {
    enter() { this.t = this.t || 0; menuMusic(); },
    update(dt) { this.t += dt; Runner.update(dt); R.updateParticles(dt); },
    key(e, down) {
      if (!down) return false;
      if (e.code === 'Space' || e.code === 'Enter') { AU.sfx('click'); Game.go('select', {}); return true; }
      if (e.code === 'Escape') { Game.popup = popups.help(); return true; }
      return true;
    },
    pointer() { return true; },
    draw(ctx) {
      const [bg, gr] = menuColors(this.t);
      Runner.draw(ctx, bg, gr);
      const VW = R.VW, cx = VW / 2;
      drawLogo(ctx, cx, 62, 50, this.t);
      const y = 158;
      const sp = Math.min(128, VW * 0.24);
      UI.button(ctx, 'm-icons', cx - sp, y, 70, 70, UI.squareBtn(UI.GREEN, 66, 66, (c) => {
        c.fillStyle = 'rgba(0,0,0,0.3)'; A.rr(c, -24, -24, 48, 48, 6); c.fill();
        c.save(); c.scale(1.3, 1.3); const ic = Game.icon(); A.drawForm(c, 'cube', ic.forms, ic.c1, ic.c2, { t: this.t, run: false }); c.restore();
      }), () => { AU.sfx('click'); Game.go('iconkit'); });
      A.text(ctx, 'Icon Kit', cx - sp, y + 50, 11);
      const pulse = 1 + Math.sin(this.t * 3.2) * 0.035;
      ctx.save(); ctx.translate(cx, y); ctx.scale(pulse, pulse); ctx.translate(-cx, -y);
      UI.button(ctx, 'm-play', cx, y, 100, 100, UI.circleBtn(UI.GREEN, 46, 'play', 52), () => { AU.sfx('click'); Game.go('select', {}); }, { circle: true });
      ctx.restore();
      UI.button(ctx, 'm-create', cx + sp, y, 70, 70, UI.squareBtn(UI.PINK, 66, 66, (c) => A.glyph(c, 'pencil', 0, 0, 40, '#ffe89a')), () => { AU.sfx('click'); Game.go('editor', {}); });
      A.text(ctx, 'Create', cx + sp, y + 50, 11);
      // bottom row
      const by = VH - 30;
      UI.button(ctx, 'm-set', 32, by, 36, 36, UI.circleBtn(UI.GREY, 16, 'gear', 20), () => { AU.sfx('click'); Game.popup = popups.settings(); }, { circle: true });
      UI.button(ctx, 'm-stats', 74, by, 36, 36, UI.circleBtn(UI.BLUE, 16, 'stats', 18), () => { AU.sfx('click'); Game.popup = popups.stats(); }, { circle: true });
      UI.button(ctx, 'm-help', 116, by, 36, 36, UI.circleBtn(UI.GOLD, 16, 'help', 18), () => { AU.sfx('click'); Game.popup = popups.help(); }, { circle: true });
      UI.button(ctx, 'm-full', VW - 32, by, 36, 36, UI.circleBtn(UI.GREY, 16, 'full', 16), () => toggleFullscreen(), { circle: true });
      // totals
      const st = Game.save.stats;
      A.glyph(ctx, 'star', VW - 88, 18, 14, '#ffe23a');
      A.text(ctx, String(st.stars), VW - 78, 18, 13, { align: 'left' });
      A.drawCoin(ctx, VW - 42, 18, 0, false);
      A.text(ctx, String(st.coins), VW - 27, 18, 13, { align: 'left' });
    },
  };
  function toggleFullscreen() {
    const d = document;
    try {
      if (!d.fullscreenElement) (d.documentElement.requestFullscreen && d.documentElement.requestFullscreen().catch(() => {}));
      else d.exitFullscreen && d.exitFullscreen();
    } catch (e) { /* fullscreen not allowed here */ }
  }

  // ───────────────────────── level select ─────────────────────────
  const SEL = (Game.scenes.select = {
    enter(arg) {
      menuMusic();
      this.t = 0;
      const idx = arg && arg.index != null && arg.index >= 0 ? arg.index : (this.index || 0);
      this.index = Math.max(0, Math.min(CD.LEVELS.length, idx));
      this.scroll = this.index;
    },
    pages() { return CD.LEVELS.length + 1; },
    nav(d) {
      const n = this.pages();
      this.index = (this.index + d + n) % n;
      AU.sfx('click');
    },
    play() {
      if (this.index >= CD.LEVELS.length) { Game.go('editor', {}); return; }
      Game.stopMenuMusic();
      AU.stopSong(0.2);
      Game.startLevel(CD.LEVELS[this.index], {});
    },
    key(e, down) {
      if (!down) return false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.nav(-1); return true; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.nav(1); return true; }
      if (e.code === 'Space' || e.code === 'Enter') { this.play(); return true; }
      if (e.code === 'Escape') { AU.sfx('back'); Game.go('menu'); return true; }
      return true;
    },
    pointer() { return true; },
    wheel(dy, dx) { const d = Math.abs(dx) > Math.abs(dy) ? dx : dy; if (Math.abs(d) > 20 && !this.wheelLock) { this.nav(d > 0 ? 1 : -1); this.wheelLock = true; setTimeout(() => (this.wheelLock = false), 280); } },
    update(dt) {
      this.t += dt;
      const n = this.pages();
      // shortest way round for wrap-around
      let d = this.index - this.scroll;
      if (d > n / 2) this.scroll += n; else if (d < -n / 2) this.scroll -= n;
      this.scroll += (this.index - this.scroll) * Math.min(1, dt * 9);
      R.updateParticles(dt);
    },
    draw(ctx) {
      const VW = R.VW, n = this.pages();
      const pos = ((this.scroll % n) + n) % n;
      const i0 = Math.floor(pos), i1 = (i0 + 1) % n, f = pos - i0;
      const colOf = (i) => (i < CD.LEVELS.length ? [CD.LEVELS[i].bg, CD.LEVELS[i].gr] : ['#3a3f52', '#30344a']);
      const bg = A.mix(colOf(i0)[0], colOf(i1)[0], f), gr = A.mix(colOf(i0)[1], colOf(i1)[1], f);
      R.drawBackground(ctx, bg, this.t * 30, Game.CAM_GROUND, 0);
      R.drawGround(ctx, gr, '#ffffff', this.t * 30, VH - 87, 1);
      for (let k = -1; k <= 1; k++) {
        const idx = Math.round(this.scroll) + k;
        const off = (idx - this.scroll) * VW;
        if (Math.abs(off) > VW) continue;
        this.drawPage(ctx, ((idx % n) + n) % n, VW / 2 + off, Math.abs(off) < VW * 0.5);
      }
      UI.button(ctx, 'sel-back', 26, 24, 36, 36, UI.circleBtn(UI.GREEN, 16, 'back', 22), () => { AU.sfx('back'); Game.go('menu'); }, { circle: true });
      UI.button(ctx, 'sel-left', 30, 120, 40, 60, (c) => A.glyph(c, 'left', 0, 0, 40, '#7df25a'), () => this.nav(-1));
      UI.button(ctx, 'sel-right', VW - 30, 120, 40, 60, (c) => A.glyph(c, 'right', 0, 0, 40, '#7df25a'), () => this.nav(1));
      // page dots
      const dy = VH - 99;
      for (let i = 0; i < n; i++) {
        const x = VW / 2 + (i - (n - 1) / 2) * 13;
        ctx.fillStyle = i === this.index ? '#fff' : 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(x, dy, i === this.index ? 3.8 : 3, 0, Math.PI * 2); ctx.fill();
      }
    },
    drawPage(ctx, i, cx, interactive) {
      const W = Math.min(330, R.VW - 110), H = 92;
      const y = 104;
      if (i >= CD.LEVELS.length) {
        const id = 'sel-panel-more';
        const draw = (c) => {
          UI.darkPanel(c, -W / 2, -H / 2, W, H, 12, 0.4);
          A.text(c, 'Make your own', 0, -14, 24);
          A.text(c, 'Build levels in the editor', 0, 16, 12, { color: '#ffe4cc' });
        };
        if (interactive) UI.button(ctx, id, cx, y, W, H, draw, () => this.play());
        else { ctx.save(); ctx.translate(cx, y); draw(ctx); ctx.restore(); }
        return;
      }
      const def = CD.LEVELS[i];
      const s = Game.lvl(def.id);
      const draw = (c) => {
        UI.darkPanel(c, -W / 2, -H / 2, W, H, 12, 0.4);
        A.drawFace(c, -W / 2 + 36, -4, 44, def.diff);
        A.text(c, (A.DIFFS[def.diff] || {}).label || '', -W / 2 + 36, 30, 8.5);
        const nameSize = def.name.length > 11 ? 22 : 27;
        A.text(c, def.name, 8, -14, nameSize);
        A.glyph(c, 'star', W / 2 - 34, -12, 16, s.done ? '#ffe23a' : '#c9c9c9');
        A.text(c, String(def.stars), W / 2 - 18, -12, 15, { align: 'left' });
        for (let k = 0; k < 3; k++) {
          c.save(); c.translate(-16 + k * 24, 20); c.scale(0.62, 0.62);
          if (s.coins[k]) A.drawCoin(c, 0, 0, 0, false);
          else { c.fillStyle = 'rgba(0,0,0,0.45)'; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fill(); c.stroke(); }
          c.restore();
        }
        if (s.done) A.text(c, '\u2713', W / 2 - 24, 20, 16, { color: '#7df25a' });
      };
      if (interactive) UI.button(ctx, 'sel-panel', cx, y, W, H, draw, () => this.play());
      else { ctx.save(); ctx.translate(cx, y); draw(ctx); ctx.restore(); }
      // progress bars
      const bw = Math.min(260, R.VW - 150), bx = cx - bw / 2;
      A.text(ctx, 'Normal Mode', cx, 160, 11);
      UI.bar(ctx, bx, 168, bw, 11, s.best / 100, ['#b8ff78', '#4ec21e']);
      A.text(ctx, `${s.best}%`, cx, 173.5, 9.5);
      A.text(ctx, 'Practice Mode', cx, 189, 11);
      UI.bar(ctx, bx, 197, bw, 11, s.practice / 100, ['#9ef8ff', '#1fa8e8']);
      A.text(ctx, `${s.practice}%`, cx, 202.5, 9.5);
    },
  });

  // ───────────────────────── icon kit ─────────────────────────
  const FORM_ORDER = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider'];
  Game.scenes.iconkit = {
    enter() { this.t = 0; this.form = this.form || 'cube'; this.chan = this.chan || 1; menuMusic(); },
    key(e, down) { if (down && e.code === 'Escape') { AU.sfx('back'); Game.persist(); Game.go('menu'); } return true; },
    pointer() { return true; },
    update(dt) { this.t += dt; },
    draw(ctx) {
      const VW = R.VW;
      const ic = Game.icon();
      const g = ctx.createLinearGradient(0, 0, 0, VH);
      g.addColorStop(0, '#12205a'); g.addColorStop(1, '#2a4fb8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      UI.button(ctx, 'ik-back', 26, 24, 36, 36, UI.circleBtn(UI.GREEN, 16, 'back', 22), () => { AU.sfx('back'); Game.persist(); Game.go('menu'); }, { circle: true });
      A.text(ctx, 'Icon Kit', VW / 2, 22, 22);
      // preview row: all forms, the chosen tab lifted
      const n = FORM_ORDER.length;
      const gap = Math.min(52, (VW - 120) / n);
      for (let i = 0; i < n; i++) {
        const f = FORM_ORDER[i];
        const x = VW / 2 + (i - (n - 1) / 2) * gap, y = 70;
        const sel = f === this.form;
        UI.button(ctx, 'ik-tab-' + f, x, y, gap - 4, 48, (c) => {
          c.fillStyle = sel ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)';
          A.rr(c, -(gap - 6) / 2, -22, gap - 6, 44, 8); c.fill();
          if (sel) { c.strokeStyle = '#7df25a'; c.lineWidth = 2; c.stroke(); }
          c.save(); c.scale(0.9, 0.9); A.drawForm(c, f, ic.forms, ic.c1, ic.c2, { t: this.t, run: f === 'robot' || f === 'spider' }); c.restore();
        }, () => { this.form = f; AU.sfx('click'); });
      }
      // variant grid
      const list = A.FORMS[this.form];
      const cell = 44, cols = Math.min(list.length, Math.max(4, Math.floor((VW - 80) / cell)));
      const gx = VW / 2 - (Math.min(cols, list.length) * cell) / 2 + cell / 2;
      UI.darkPanel(ctx, VW / 2 - (Math.min(cols, list.length) * cell) / 2 - 10, 104, Math.min(cols, list.length) * cell + 20, Math.ceil(list.length / cols) * cell + 12, 10, 0.3);
      for (let i = 0; i < list.length; i++) {
        const x = gx + (i % cols) * cell, y = 132 + Math.floor(i / cols) * cell;
        const sel = (ic.forms[this.form] || 0) === i;
        UI.button(ctx, `ik-v-${this.form}-${i}`, x, y, cell - 4, cell - 4, (c) => {
          c.fillStyle = sel ? 'rgba(125,242,90,0.25)' : 'rgba(255,255,255,0.06)';
          A.rr(c, -(cell - 6) / 2, -(cell - 6) / 2, cell - 6, cell - 6, 6); c.fill();
          if (sel) { c.strokeStyle = '#7df25a'; c.lineWidth = 2; c.stroke(); }
          const forms = Object.assign({}, ic.forms, { [this.form]: i });
          A.drawForm(c, this.form, forms, ic.c1, ic.c2, { t: this.t, run: false });
        }, () => { ic.forms[this.form] = i; AU.sfx('click'); Game.persist(); });
      }
      A.text(ctx, list[(ic.forms[this.form] || 0) % list.length].name, VW / 2, 104 + Math.ceil(list.length / cols) * cell + 24, 12, { color: '#ffe4cc' });
      // colours
      const py = VH - 70;
      UI.button(ctx, 'ik-c1', VW / 2 - 60, py - 18, 104, 22, UI.labelBtn(this.chan === 1 ? UI.GREEN : UI.GREY, 100, 20, 'Primary', 11), () => { this.chan = 1; AU.sfx('click'); });
      UI.button(ctx, 'ik-c2', VW / 2 + 60, py - 18, 104, 22, UI.labelBtn(this.chan === 2 ? UI.GREEN : UI.GREY, 100, 20, 'Secondary', 11), () => { this.chan = 2; AU.sfx('click'); });
      const pal = A.PALETTE, per = 16, sw = Math.min(22, (VW - 60) / per);
      for (let i = 0; i < pal.length; i++) {
        const x = VW / 2 + ((i % per) - (per - 1) / 2) * sw, y = py + 12 + Math.floor(i / per) * sw;
        const cur = (this.chan === 1 ? ic.c1 : ic.c2) === pal[i];
        UI.button(ctx, 'ik-col' + i, x, y, sw - 2, sw - 2, (c) => {
          c.fillStyle = pal[i]; c.strokeStyle = cur ? '#fff' : '#000'; c.lineWidth = cur ? 2.5 : 1.2;
          A.rr(c, -(sw - 4) / 2, -(sw - 4) / 2, sw - 4, sw - 4, 3); c.fill(); c.stroke();
        }, () => { if (this.chan === 1) ic.c1 = pal[i]; else ic.c2 = pal[i]; AU.sfx('click'); Game.persist(); });
      }
      UI.toggle(ctx, 'ik-glow', VW - 70, 24, ic.glow, () => { ic.glow = !ic.glow; Game.persist(); }, 'Glow');
    },
  };

  // ───────────────────────── popups ─────────────────────────
  function popupFrame(ctx, w, h, title, onClose) {
    const VW = R.VW;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, VW, VH);
    const x = VW / 2 - w / 2, y = VH / 2 - h / 2;
    UI.panel(ctx, x, y, w, h);
    A.text(ctx, title, VW / 2, y + 22, 20);
    UI.button(ctx, 'pop-close', x + 6, y + 6, 28, 28, UI.circleBtn(UI.RED, 12, 'x', 11), onClose, { circle: true });
    return { x, y };
  }
  const popups = {
    settings() {
      return {
        key(e) { if (e.code === 'Escape') { Game.popup = null; Game.persist(); } return true; },
        draw(ctx) {
          const S = Game.save.settings;
          const { x, y } = popupFrame(ctx, 320, 210, 'Settings', () => { Game.popup = null; Game.persist(); });
          const cx = R.VW / 2;
          UI.slider(ctx, 'set-music', cx - 50, y + 58, 150, S.music, (v) => { S.music = v; AU.setVolumes(S.music, S.sfx); }, 'Music');
          UI.slider(ctx, 'set-sfx', cx - 50, y + 84, 150, S.sfx, (v) => { S.sfx = v; AU.setVolumes(S.music, S.sfx); }, 'SFX');
          UI.toggle(ctx, 'set-bar', x + 40, y + 116, S.showBar, () => (S.showBar = !S.showBar), 'Progress bar');
          UI.toggle(ctx, 'set-pct', x + 40, y + 142, S.showPct, () => (S.showPct = !S.showPct), 'Show percentage');
          UI.toggle(ctx, 'set-cp', x + 180, y + 116, S.autoCP, () => (S.autoCP = !S.autoCP), 'Auto-checkpoints');
          const confirm = this.confirm;
          UI.button(ctx, 'set-reset', cx, y + 182, 150, 24, UI.labelBtn(confirm ? UI.RED : UI.GREY, 146, 22, confirm ? 'Tap again to erase' : 'Reset progress', 11), () => {
            if (!this.confirm) { this.confirm = true; return; }
            const keep = { settings: Game.save.settings, icon: Game.save.icon, custom: Game.save.custom };
            Game.load(); Game.save.levels = {}; Game.save.stats = { jumps: 0, attempts: 0, deaths: 0, completed: 0, stars: 0, coins: 0, orbs: 0, time: 0 };
            Object.assign(Game.save, keep);
            Game.persist(); this.confirm = false; AU.sfx('back');
          });
        },
      };
    },
    stats() {
      return {
        key(e) { if (e.code === 'Escape') Game.popup = null; return true; },
        draw(ctx) {
          const st = Game.save.stats;
          const { y } = popupFrame(ctx, 300, 214, 'Stats', () => (Game.popup = null));
          const rows = [
            ['Total jumps', st.jumps], ['Total attempts', st.attempts], ['Deaths', st.deaths], ['Orbs used', st.orbs],
            ['Completed levels', `${st.completed} / ${CD.LEVELS.length}`], ['Stars', st.stars], ['Coins', `${st.coins} / ${CD.LEVELS.length * 3}`],
            ['Time played', `${Math.floor(st.time / 60)}m ${Math.floor(st.time % 60)}s`],
          ];
          rows.forEach(([k, v], i) => {
            A.text(ctx, k, R.VW / 2 - 110, y + 52 + i * 19, 11, { align: 'left', color: '#ffe4cc' });
            A.text(ctx, String(v), R.VW / 2 + 110, y + 52 + i * 19, 11, { align: 'right' });
          });
        },
      };
    },
    help() {
      return {
        key(e) { if (e.code === 'Escape' || e.code === 'Enter') Game.popup = null; return true; },
        draw(ctx) {
          const { y } = popupFrame(ctx, 340, 222, 'How to play', () => (Game.popup = null));
          const lines = [
            ['Jump / fly / flip', 'Click, tap, Space, \u2191 or W'],
            ['Hold', 'Keep jumping \u00b7 fly the ship up \u00b7 wave up'],
            ['Orbs', 'Tap while touching them'],
            ['Pause', 'Esc or P'],
            ['Restart', 'R'],
            ['Practice checkpoints', 'Z place \u00b7 X remove'],
            ['Level select', '\u2190 \u2192 and Enter'],
          ];
          lines.forEach(([k, v], i) => {
            A.text(ctx, k, R.VW / 2 - 150, y + 52 + i * 21, 11, { align: 'left', color: '#ffe4cc' });
            A.text(ctx, v, R.VW / 2 + 150, y + 52 + i * 21, 10.5, { align: 'right' });
          });
        },
      };
    },
  };
  Game.popups = popups;

  // ───────────────────────── pause menu ─────────────────────────
  Game.drawPause = function (ctx, P) {
    const VW = R.VW;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, VW, VH);
    const w = Math.min(400, VW - 30), h = 262;
    const x = VW / 2 - w / 2, y = VH / 2 - h / 2;
    UI.panel(ctx, x, y, w, h);
    A.text(ctx, P.def.name, VW / 2, y + 24, 22);
    const s = P.editor ? { best: 0, practice: 0 } : Game.lvl(P.def.id);
    const bw = Math.min(250, w - 120), bx = VW / 2 - bw / 2;
    UI.bar(ctx, bx, y + 50, bw, 10, s.best / 100, ['#b8ff78', '#4ec21e']);
    A.text(ctx, `Normal ${s.best}%`, VW / 2, y + 55, 9);
    UI.bar(ctx, bx, y + 68, bw, 10, s.practice / 100, ['#9ef8ff', '#1fa8e8']);
    A.text(ctx, `Practice ${s.practice}%`, VW / 2, y + 73, 9);
    const by = y + 122;
    UI.button(ctx, 'pz-practice', VW / 2 - 108, by, 44, 44, UI.circleBtn(P.practice ? UI.BLUE : UI.GREEN, 19, 'diamond', 22), () => { Game.restart(!P.practice); }, { circle: true });
    A.text(ctx, P.practice ? 'Normal' : 'Practice', VW / 2 - 108, by + 30, 9);
    UI.button(ctx, 'pz-resume', VW / 2 - 36, by, 64, 64, UI.circleBtn(UI.GREEN, 28, 'play', 32), () => Game.resume(), { circle: true });
    UI.button(ctx, 'pz-restart', VW / 2 + 36, by, 44, 44, UI.circleBtn(UI.GREEN, 19, 'restart', 22), () => Game.restart(), { circle: true });
    UI.button(ctx, 'pz-exit', VW / 2 + 108, by, 44, 44, UI.circleBtn(UI.GREEN, 19, 'menu', 20), () => Game.exitLevel(), { circle: true });
    const S = Game.save.settings;
    UI.slider(ctx, 'pz-music', VW / 2 - 60, y + 178, 140, S.music, (v) => { S.music = v; AU.setVolumes(S.music, S.sfx); }, 'Music');
    UI.slider(ctx, 'pz-sfx', VW / 2 - 60, y + 200, 140, S.sfx, (v) => { S.sfx = v; AU.setVolumes(S.music, S.sfx); }, 'SFX');
    UI.toggle(ctx, 'pz-bar', x + 26, y + 236, S.showBar, () => { S.showBar = !S.showBar; Game.persist(); }, 'Bar');
    UI.toggle(ctx, 'pz-pct', x + 26 + w * 0.28, y + 236, S.showPct, () => { S.showPct = !S.showPct; Game.persist(); }, '%');
    UI.toggle(ctx, 'pz-cp', x + 26 + w * 0.48, y + 236, S.autoCP, () => { S.autoCP = !S.autoCP; Game.persist(); }, 'Auto-checkpoints');
  };

  // ───────────────────────── level complete ─────────────────────────
  const MESSAGES = ['Claws down, you nailed it!', 'Shell yeah!', 'Pinch perfect!', 'Totally tidal!', 'Crabulous!', 'Sea-riously good!'];
  Game.drawComplete = function (ctx, P) {
    const VW = R.VW, t = P.doneT;
    if (t > 0.5 && t < 2.6) {
      const k = t - 0.5;
      const s = k < 0.25 ? (k / 0.25) * 1.2 : k < 0.4 ? 1.2 - (k - 0.25) : 1.05;
      const a = t > 2.3 ? Math.max(0, 1 - (t - 2.3) / 0.3) : 1;
      ctx.save(); ctx.translate(VW / 2, VH * 0.4); ctx.scale(s, s); ctx.globalAlpha = a;
      A.text(ctx, P.practice ? 'PRACTICE COMPLETE!' : 'LEVEL COMPLETE!', 0, 0, P.practice ? 30 : 36, { grad: ['#fff7a8', '#ffb31a'], sw: 5 });
      ctx.restore();
    }
    if (t < 2.4) return;
    const k = Math.min(1, (t - 2.4) / 0.35);
    const ease = 1 - Math.pow(1 - k, 3);
    const w = Math.min(360, VW - 30), h = 232;
    const x = VW / 2 - w / 2, y = -h + (VH / 2 - h / 2 + h) * ease;
    ctx.fillStyle = `rgba(0,0,0,${0.45 * ease})`; ctx.fillRect(0, 0, VW, VH);
    UI.panel(ctx, x, y, w, h);
    if (!P.msg) P.msg = MESSAGES[(Math.random() * MESSAGES.length) | 0];
    A.text(ctx, P.msg, VW / 2, y + 26, 18, { grad: ['#fff7a8', '#ffb31a'] });
    A.text(ctx, P.def.name, VW / 2, y + 50, 13, { color: '#ffe4cc' });
    const mins = Math.floor(P.attemptT / 60), secs = Math.floor(P.attemptT % 60);
    const rows = [['Attempts', P.attempt], ['Jumps', P.runJumps], ['Time', `${mins}:${String(secs).padStart(2, '0')}`]];
    rows.forEach(([a, b], i) => {
      A.text(ctx, a, VW / 2 - 70, y + 78 + i * 18, 12, { align: 'left' });
      A.text(ctx, String(b), VW / 2 + 70, y + 78 + i * 18, 12, { align: 'right' });
    });
    if (!P.editor && !P.practice) {
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(VW / 2 - 26 + i * 26, y + 142); ctx.scale(0.7, 0.7);
        const got = (P.runCoins >> i) & 1;
        if (got) A.drawCoin(ctx, 0, 0, 0, false);
        else { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (P.earnedStars) { A.glyph(ctx, 'star', VW / 2 + 70, y + 142, 18, '#ffe23a'); A.text(ctx, `+${P.earnedStars}`, VW / 2 + 84, y + 142, 13, { align: 'left' }); }
    }
    UI.button(ctx, 'end-replay', VW / 2 - 40, y + h - 38, 50, 50, UI.circleBtn(UI.GREEN, 22, 'restart', 26), () => { P.gateBurst = false; Game.restart(P.practice); }, { circle: true });
    UI.button(ctx, 'end-menu', VW / 2 + 40, y + h - 38, 50, 50, UI.circleBtn(UI.GREEN, 22, 'menu', 24), () => Game.exitLevel(), { circle: true });
  };

  Game.menuColors = menuColors;
  Game.drawLogo = drawLogo;
  Game.Runner = Runner;
})(typeof globalThis !== 'undefined' ? globalThis : window);
