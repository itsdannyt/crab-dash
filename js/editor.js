/* Crab Dash — level editor: "My Levels" list and a grid editor with build / delete modes, an object palette,
 * rotation, undo, panning, playtesting and level settings. Custom levels live in the save data. */
(function (G) {
  'use strict';
  const CD = G.CD;
  const A = CD.art, R = CD.render, AU = CD.audio, UI = CD.ui, Game = CD.game;
  const VH = 320, B = 30;
  const TOOLBAR = 250; // screen y where the bottom toolbar starts

  // Songs available to custom levels, with the tempo of the built-in level that uses them.
  const SONGS = [
    { id: 'lowtide', name: 'Low Tide', bpm: 10.386 * 60 / 4.5 },
    { id: 'crabwalk', name: 'Crab Walk', bpm: 10.386 * 60 / 4 },
    { id: 'coral', name: 'Coral Drift', bpm: 10.386 * 60 / 3.75 },
    { id: 'shell', name: 'Shell Shock', bpm: 12.914 * 60 / 5 },
    { id: 'riptide', name: 'Riptide', bpm: 15.6 * 60 / 6 },
    { id: 'abyss', name: 'The Abyss', bpm: 19.2 * 60 / 8 },
  ];
  const COLORS = [
    ['#0d50db', '#0a3dab'], ['#c2168f', '#9e1276'], ['#0e9e6e', '#0b7f58'], ['#d4520f', '#a8400b'], ['#5a1ab8', '#48159a'],
    ['#5c0a14', '#46070f'], ['#0e7fa0', '#0b6680'], ['#3a3f52', '#2c3040'], ['#8a6a10', '#6e540c'], ['#101820', '#0a1016'],
  ];

  // Palette: every placeable object, grouped like the original editor's tabs.
  const CATS = [
    { name: 'Blocks', items: [{ t: 'block' }, { t: 'slab' }, { t: 'slab', top: true }] },
    { name: 'Spikes', items: [{ t: 'spike', rot: 0 }, { t: 'mspike', rot: 0 }, { t: 'saw', r: 1 }, { t: 'saw', r: 0.6 }] },
    { name: 'Pads', items: ['Y', 'P', 'R', 'B'].map((c) => ({ t: 'pad', c })) },
    { name: 'Orbs', items: ['Y', 'P', 'R', 'B', 'G'].map((c) => ({ t: 'orb', c })) },
    { name: 'Portals', items: ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'gravDown', 'gravUp', 'mini', 'big'].map((p) => ({ t: 'portal', p })) },
    { name: 'Speed', items: [0, 1, 2, 3, 4].map((s) => ({ t: 'speed', s })) },
    { name: 'Extra', items: [{ t: 'coin' }, { t: 'arrow' }, { t: 'kelp', h: 2 }, { t: 'pulse', r: 1 }] },
  ];

  function newLevel() {
    const n = (Game.save.custom || []).length + 1;
    return { id: 'custom-' + Date.now().toString(36), name: `My Level ${n}`, song: 'lowtide', color: 0, speed: 1, objects: [], verified: false };
  }

  // Build a playable level definition from a custom level.
  function toDef(cl) {
    const song = SONGS.find((s) => s.id === cl.song) || SONGS[0];
    let maxX = 20;
    for (const o of cl.objects) maxX = Math.max(maxX, o.x + (o.w || 1));
    const length = Math.ceil(maxX + 10);
    // enough bars of music to cover the level at its start speed
    const secs = [], parts = [['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['drop2', 8]];
    const bps = CD.xSpeed(cl.speed || 1) * 2;
    const barsNeeded = Math.ceil(((length / bps) * song.bpm) / 60 / 4) + 2;
    let bars = 0, i = 0;
    while (bars < barsNeeded) { const [p, b] = parts[i % parts.length]; secs.push({ bars: b, part: p }); bars += b; i++; }
    const [bg, gr] = COLORS[cl.color || 0];
    return { id: cl.id, name: cl.name, diff: 'auto', stars: 0, bpm: song.bpm, song: song.id, bg, gr, objects: cl.objects.map((o) => Object.assign({}, o)), colors: [], sections: secs, length, startSpeed: cl.speed || 1, custom: true };
  }
  Game.customToDef = toDef;

  const ED = (Game.scenes.editor = {
    enter(arg) {
      if (!Game.save.custom) Game.save.custom = [];
      this.t = 0;
      if (arg && arg.back && this.level) { this.view = 'edit'; this.dirty = true; if (Game.P && Game.P.editor && Game.P.editor.verified) { this.level.verified = true; Game.persist(); } AU.stopSong(0.2); Game.stopMenuMusic(); return; }
      this.view = 'list';
      this.confirmDel = null;
      if (!Game.menuPlaying) { AU.playSong('menu', 118, [{ bars: 4, part: 'intro' }, { bars: 8, part: 'verse' }, { bars: 8, part: 'ambient' }], { loop: true }); Game.menuPlaying = true; }
    },
    open(cl) {
      this.level = cl;
      this.view = 'edit';
      this.cam = { x: -60, y: -90 };
      this.cat = this.cat || 0;
      this.sel = this.sel || { cat: 0, i: 0 };
      this.mode = 'build';
      this.rot = 0;
      this.undo = [];
      this.dirty = true;
      this.toast = null;
    },
    save() {
      const list = Game.save.custom;
      if (this.level && !list.includes(this.level)) list.push(this.level);
      Game.persist();
    },
    say(msg) { this.toast = { msg, t: 0 }; },
    compiled() {
      if (this.dirty || !this.comp) {
        this.def = toDef(this.level);
        this.comp = CD.compileLevel(this.def);
        R.prepareLevel(this.comp);
        this.dirty = false;
      }
      return this.comp;
    },
    snapshot() { this.undo.push(JSON.stringify(this.level.objects)); if (this.undo.length > 60) this.undo.shift(); },
    // edits are saved as they happen, shortly after the last change
    touched() {
      this.level.verified = false;
      this.dirty = true;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), 400);
    },
    doUndo() {
      if (!this.undo.length) { this.say('Nothing to undo'); return; }
      this.level.objects = JSON.parse(this.undo.pop());
      this.touched(); AU.sfx('back');
    },
    cellAt(x, y) {
      const wx = x + this.cam.x, wy = VH - y + this.cam.y;
      return { cx: Math.floor(wx / B), cy: Math.floor(wy / B) };
    },
    objectsAt(cx, cy) {
      return this.level.objects.filter((o) => {
        const w = o.t === 'portal' ? 1 : (o.w || 1), h = o.t === 'portal' ? 3 : 1;
        const y0 = o.t === 'portal' ? Math.round(o.y) - 1 : Math.floor(o.y);
        if (o.t === 'saw') return Math.abs(o.x - (cx + 0.5)) < (o.r || 1) && Math.abs(o.y - (cy + 0.5)) < (o.r || 1);
        return cx >= Math.floor(o.x) && cx < Math.floor(o.x) + w && cy >= y0 && cy < y0 + h;
      });
    },
    place(cx, cy) {
      if (cy < 0) return;
      const item = CATS[this.sel.cat].items[this.sel.i];
      const o = Object.assign({}, item, { x: cx, y: cy });
      if (o.t === 'spike' || o.t === 'mspike') o.rot = this.rot;
      if (o.t === 'pad') o.rot = this.rot === 180 ? 180 : 0;
      if (o.t === 'saw') { o.x = cx + 0.5; o.y = cy + 0.5; }
      if (o.t === 'coin') {
        const used = new Set(this.level.objects.filter((q) => q.t === 'coin').map((q) => q.i));
        const free = [0, 1, 2].find((i) => !used.has(i));
        if (free == null) { this.say('A level holds 3 coins at most'); return; }
        o.i = free;
      }
      // one object per cell and kind: replace what is there
      const here = this.objectsAt(cx, cy).filter((q) => q.t === o.t || (q.t === 'block' && o.t === 'slab') || (q.t === 'slab' && o.t === 'block'));
      this.snapshot();
      this.level.objects = this.level.objects.filter((q) => !here.includes(q));
      this.level.objects.push(o);
      this.touched();
    },
    remove(cx, cy) {
      const here = this.objectsAt(cx, cy);
      if (!here.length) return;
      this.snapshot();
      const top = here[here.length - 1];
      this.level.objects = this.level.objects.filter((q) => q !== top);
      this.touched();
    },
    playtest() {
      if (!this.level.objects.length) { this.say('Place some objects first'); return; }
      this.save();
      Game.stopMenuMusic();
      AU.stopSong(0.2);
      const def = toDef(this.level);
      Game.startLevel(def, { editor: { level: this.level, verified: false } });
    },
    key(e, down) {
      if (!down) { if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shift = false; return true; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.shift = true; return true; }
      if (this.view === 'list') {
        if (e.code === 'Escape') { AU.sfx('back'); Game.go('menu'); }
        if (e.code === 'Enter' || e.code === 'KeyN') { const cl = newLevel(); this.open(cl); this.save(); }
        return true;
      }
      if (this.settings) { if (e.code === 'Escape' || e.code === 'Enter') this.closeSettings(); return true; }
      const pan = this.shift ? 5 : 1;
      if (e.code === 'Escape') { this.save(); this.view = 'list'; AU.sfx('back'); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cam.x += B * pan;
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cam.x = Math.max(-200, this.cam.x - B * pan);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.cam.y += B * pan;
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.cam.y = Math.max(-150, this.cam.y - B * pan);
      else if (e.code === 'KeyR') this.rotate();
      else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) this.doUndo();
      else if (e.code === 'Digit1') this.mode = 'build';
      else if (e.code === 'Digit2' || e.code === 'Delete' || e.code === 'Backspace') this.mode = 'delete';
      else if (e.code === 'Enter' || e.code === 'KeyP') this.playtest();
      return true;
    },
    rotate() { this.rot = (this.rot + 90) % 360; AU.sfx('click'); },
    wheel(dy, dx) {
      if (this.view !== 'edit') return;
      if (this.shift) this.cam.y = Math.max(-150, this.cam.y - dy * 0.5);
      else this.cam.x = Math.max(-200, this.cam.x + (Math.abs(dx) > Math.abs(dy) ? dx : dy) * 0.6);
    },
    pointer(x, y, down) {
      if (this.view !== 'edit' || this.settings) return true;
      if (down) {
        if (y >= TOOLBAR) return true;
        this.press = { x, y, cam: Object.assign({}, this.cam), drag: false };
        return true;
      }
      const P = this.press;
      this.press = null;
      if (!P || P.drag) return true;
      const { cx, cy } = this.cellAt(x, y);
      if (this.mode === 'build') { this.place(cx, cy); AU.sfx('click', 0.5); } else { this.remove(cx, cy); AU.sfx('back', 0.5); }
      return true;
    },
    move(x, y) {
      this.hoverCell = this.view === 'edit' && y < TOOLBAR ? this.cellAt(x, y) : null;
      const P = this.press;
      if (!P) return;
      if (!P.drag && Math.hypot(x - P.x, y - P.y) > 7) P.drag = true;
      if (P.drag) {
        this.cam.x = Math.max(-200, P.cam.x - (x - P.x));
        this.cam.y = Math.max(-150, P.cam.y + (y - P.y));
      }
    },
    update(dt) {
      this.t += dt;
      if (this.toast) { this.toast.t += dt; if (this.toast.t > 2.2) this.toast = null; }
    },

    // ───────────────────────── drawing ─────────────────────────
    draw(ctx) {
      if (this.view === 'list') return this.drawList(ctx);
      this.drawEdit(ctx);
    },
    drawList(ctx) {
      const VW = R.VW;
      R.drawBackground(ctx, '#2a3150', this.t * 20, Game.CAM_GROUND, 0);
      R.drawGround(ctx, '#232a45', '#ffffff', this.t * 20, VH - 40, 1);
      UI.button(ctx, 'ed-back', 26, 24, 36, 36, UI.circleBtn(UI.GREEN, 16, 'back', 22), () => { AU.sfx('back'); Game.go('menu'); }, { circle: true });
      A.text(ctx, 'My Levels', VW / 2, 26, 24);
      const list = Game.save.custom;
      const w = Math.min(420, VW - 40);
      UI.panel(ctx, VW / 2 - w / 2, 48, w, 222);
      if (!list.length) {
        A.text(ctx, 'No levels yet', VW / 2, 130, 18);
        A.text(ctx, 'Tap New Level to start building', VW / 2, 154, 12, { color: '#ffe4cc' });
      }
      const rows = list.slice(-6);
      rows.forEach((cl, i) => {
        const y = 72 + i * 32, x0 = VW / 2 - w / 2 + 16;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; A.rr(ctx, x0 - 6, y - 13, w - 20, 27, 6); ctx.fill();
        A.text(ctx, cl.name, x0 + 4, y, 13, { align: 'left' });
        A.text(ctx, `${cl.objects.length} objects${cl.verified ? ' \u00b7 verified' : ''}`, x0 + 4 + Math.min(150, A.measure(ctx, cl.name, 13) + 12), y + 1, 9, { align: 'left', color: cl.verified ? '#9dffc2' : '#ffe4cc' });
        const bx = VW / 2 + w / 2 - 30;
        const del = this.confirmDel === cl.id;
        UI.button(ctx, 'ed-del-' + cl.id, bx, y, 24, 24, UI.circleBtn(UI.RED, 11, del ? 'x' : 'trash', 12), () => {
          if (!del) { this.confirmDel = cl.id; this.say && (this.toast = { msg: 'Tap again to delete', t: 0 }); return; }
          Game.save.custom = Game.save.custom.filter((q) => q !== cl); Game.persist(); this.confirmDel = null; AU.sfx('back');
        }, { circle: true });
        UI.button(ctx, 'ed-play-' + cl.id, bx - 30, y, 24, 24, UI.circleBtn(UI.GREEN, 11, 'play', 13), () => { this.level = cl; this.playtest(); }, { circle: true });
        UI.button(ctx, 'ed-edit-' + cl.id, bx - 60, y, 24, 24, UI.circleBtn(UI.PINK, 11, 'pencil', 14), () => { AU.sfx('click'); this.open(cl); }, { circle: true });
      });
      UI.button(ctx, 'ed-new', VW / 2, 294, 150, 30, UI.labelBtn(UI.GREEN, 146, 28, 'New Level', 15), () => { AU.sfx('click'); const cl = newLevel(); this.open(cl); this.save(); });
      if (this.toast) A.text(ctx, this.toast.msg, VW / 2, 280 - 36, 11, { alpha: Math.min(1, 2.2 - this.toast.t) });
    },
    drawEdit(ctx) {
      const VW = R.VW;
      const L = this.compiled();
      const cam = this.cam;
      const t = this.t;
      const [bg, gr] = COLORS[this.level.color || 0];
      R.drawBackground(ctx, bg, cam.x, cam.y, 0);
      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.floor(cam.x / B) * B; x < cam.x + VW; x += B) { ctx.moveTo(x - cam.x, 0); ctx.lineTo(x - cam.x, TOOLBAR); }
      for (let y = Math.floor(cam.y / B) * B; y < cam.y + VH; y += B) { const sy = VH - (y - cam.y); if (sy < TOOLBAR) { ctx.moveTo(0, sy); ctx.lineTo(VW, sy); } }
      ctx.stroke();
      // start line
      ctx.strokeStyle = 'rgba(125,242,90,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0 - cam.x, 0); ctx.lineTo(0 - cam.x, TOOLBAR); ctx.stroke();
      R.drawObjects(ctx, L, cam.x, cam.y, t, null, 'back', null);
      R.drawObjects(ctx, L, cam.x, cam.y, t, null, 'front', null);
      R.drawGround(ctx, gr, '#ffffff', cam.x, VH - (0 - cam.y), 1);
      // end line
      const ex = L.endX - cam.x;
      if (ex < VW) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex, TOOLBAR); ctx.stroke(); ctx.setLineDash([]); A.text(ctx, 'END', ex + 4, 14, 10, { align: 'left' }); }
      // player ghost at the start
      ctx.save(); ctx.globalAlpha = 0.6;
      const ic = Game.icon();
      ctx.translate(0 - cam.x, VH - (15 - cam.y));
      A.drawForm(ctx, 'cube', ic.forms, ic.c1, ic.c2, { t, run: false });
      ctx.restore();
      // hover cell
      if (this.hoverCell && !this.settings) {
        const { cx, cy } = this.hoverCell;
        const sx = cx * B - cam.x, sy = VH - ((cy + 1) * B - cam.y);
        ctx.strokeStyle = this.mode === 'build' ? 'rgba(125,242,90,0.9)' : 'rgba(255,90,70,0.9)'; ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, B - 2, B - 2);
      }
      this.drawTopBar(ctx);
      this.drawToolbar(ctx);
      if (this.toast) A.text(ctx, this.toast.msg, VW / 2, 60, 13, { alpha: Math.min(1, 2.2 - this.toast.t) });
      if (this.settings) this.drawSettings(ctx);
    },
    drawTopBar(ctx) {
      const VW = R.VW;
      UI.button(ctx, 'ed-exit', 26, 24, 36, 36, UI.circleBtn(UI.GREEN, 16, 'back', 22), () => { this.save(); this.view = 'list'; AU.sfx('back'); }, { circle: true });
      A.text(ctx, this.level.name + (this.level.verified ? '  \u2713' : ''), VW / 2, 22, 15);
      A.text(ctx, `${this.level.objects.length} objects \u00b7 drag to scroll`, VW / 2, 40, 9, { color: '#ffe4cc' });
      UI.button(ctx, 'ed-test', VW - 28, 24, 40, 40, UI.circleBtn(UI.GREEN, 17, 'play', 20), () => this.playtest(), { circle: true });
      UI.button(ctx, 'ed-set', VW - 70, 24, 34, 34, UI.circleBtn(UI.GREY, 14, 'gear', 17), () => this.openSettings(), { circle: true });
      UI.button(ctx, 'ed-undo', VW - 108, 24, 34, 34, UI.circleBtn(UI.BLUE, 14, 'restart', 15), () => this.doUndo(), { circle: true });
    },
    drawToolbar(ctx) {
      const VW = R.VW;
      ctx.fillStyle = 'rgba(8,10,24,0.82)'; ctx.fillRect(0, TOOLBAR, VW, VH - TOOLBAR);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(0, TOOLBAR, VW, 1.5);
      // modes
      UI.button(ctx, 'ed-m-build', 34, TOOLBAR + 20, 56, 22, UI.labelBtn(this.mode === 'build' ? UI.GREEN : UI.GREY, 54, 20, 'Build', 11), () => (this.mode = 'build'));
      UI.button(ctx, 'ed-m-del', 34, TOOLBAR + 50, 56, 22, UI.labelBtn(this.mode === 'delete' ? UI.RED : UI.GREY, 54, 20, 'Delete', 11), () => (this.mode = 'delete'));
      // category tabs
      const left = 72, right = VW - 44;
      const tw = Math.min(62, (right - left) / CATS.length);
      CATS.forEach((c, i) => {
        const x = left + tw * i + tw / 2;
        UI.button(ctx, 'ed-cat-' + i, x, TOOLBAR + 12, tw - 3, 18, (g) => {
          g.fillStyle = this.cat === i ? 'rgba(125,242,90,0.35)' : 'rgba(255,255,255,0.08)';
          A.rr(g, -(tw - 4) / 2, -8, tw - 4, 16, 5); g.fill();
          A.text(g, c.name, 0, 0.5, 9, { stroke: this.cat === i });
        }, () => { this.cat = i; AU.sfx('click', 0.6); });
      });
      // items
      const items = CATS[this.cat].items;
      const iw = 32;
      items.forEach((it, i) => {
        const x = left + 18 + i * (iw + 4), y = TOOLBAR + 46;
        if (x > right) return;
        const sel = this.sel.cat === this.cat && this.sel.i === i;
        UI.button(ctx, `ed-it-${this.cat}-${i}`, x, y, iw, iw, (g) => {
          g.fillStyle = sel ? 'rgba(125,242,90,0.3)' : 'rgba(255,255,255,0.07)';
          A.rr(g, -iw / 2, -iw / 2, iw, iw, 5); g.fill();
          if (sel) { g.strokeStyle = '#7df25a'; g.lineWidth = 2; g.stroke(); }
          g.save(); g.scale(0.72, 0.72); drawIcon(g, it, this.t, sel ? this.rot : 0); g.restore();
        }, () => { this.sel = { cat: this.cat, i }; this.mode = 'build'; AU.sfx('click', 0.6); });
      });
      UI.button(ctx, 'ed-rot', VW - 24, TOOLBAR + 46, 32, 32, UI.circleBtn(UI.GOLD, 13, 'restart', 15), () => this.rotate(), { circle: true });
      A.text(ctx, `${this.rot}\u00b0`, VW - 24, TOOLBAR + 17, 9);
    },
    openSettings() {
      AU.sfx('click');
      this.settings = true;
      // a real text field for the level name, laid over the canvas
      let inp = document.getElementById('lvlname');
      if (!inp) {
        inp = document.createElement('input');
        inp.id = 'lvlname'; inp.type = 'text'; inp.maxLength = 24; inp.autocomplete = 'off'; inp.spellcheck = false;
        inp.setAttribute('aria-label', 'Level name');
        Object.assign(inp.style, { position: 'fixed', zIndex: 5, font: '16px "Lilita One", system-ui, sans-serif', padding: '4px 10px', borderRadius: '8px', border: '2px solid #2a1206', background: '#fff4e6', color: '#2a1206', textAlign: 'center', outline: 'none' });
        document.body.appendChild(inp);
        inp.addEventListener('input', () => { if (this.level) { this.level.name = inp.value.trim() || 'Untitled'; } });
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
      }
      inp.value = this.level.name;
      inp.hidden = false;
      this.placeInput();
    },
    placeInput() {
      const inp = document.getElementById('lvlname');
      if (!inp || inp.hidden) return;
      const r = R.canvas.getBoundingClientRect();
      const k = r.height / VH;
      const w = 200 * k, h = 26 * k;
      inp.style.left = `${r.left + (R.VW / 2) * k - w / 2}px`;
      inp.style.top = `${r.top + (VH / 2 - 62) * k - h / 2}px`;
      inp.style.width = `${w}px`; inp.style.height = `${h}px`;
      inp.style.fontSize = `${Math.max(12, 14 * k)}px`;
    },
    closeSettings() {
      this.settings = false;
      const inp = document.getElementById('lvlname');
      if (inp) { inp.hidden = true; inp.blur(); }
      this.dirty = true;
      this.save();
    },
    leave() { const inp = document.getElementById('lvlname'); if (inp) inp.hidden = true; this.settings = false; },
    drawSettings(ctx) {
      const VW = R.VW;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, VW, VH);
      UI.regs.length = 0;
      const w = Math.min(340, VW - 30), h = 214, x = VW / 2 - w / 2, y = VH / 2 - h / 2;
      UI.panel(ctx, x, y, w, h);
      A.text(ctx, 'Level Settings', VW / 2, y + 18, 16);
      UI.button(ctx, 'es-close', x + 6, y + 6, 28, 28, UI.circleBtn(UI.GREEN, 12, 'play', 12), () => this.closeSettings(), { circle: true });
      this.placeInput();
      const lv = this.level;
      const row = (label, value, yy, onPrev, onNext, id, swatch) => {
        A.text(ctx, label, x + 24, yy, 11, { align: 'left', color: '#ffe4cc' });
        UI.button(ctx, id + '-p', VW / 2 - 10, yy, 24, 24, (g) => A.glyph(g, 'left', 0, 0, 18, '#7df25a'), onPrev);
        if (swatch) { ctx.fillStyle = swatch[0]; A.rr(ctx, VW / 2 + 12, yy - 8, 40, 16, 4); ctx.fill(); ctx.fillStyle = swatch[1]; A.rr(ctx, VW / 2 + 56, yy - 8, 20, 16, 4); ctx.fill(); }
        else A.text(ctx, value, VW / 2 + 52, yy, 12);
        UI.button(ctx, id + '-n', VW / 2 + 114, yy, 24, 24, (g) => A.glyph(g, 'right', 0, 0, 18, '#7df25a'), onNext);
      };
      const si = Math.max(0, SONGS.findIndex((s) => s.id === lv.song));
      row('Song', SONGS[si].name, y + 96, () => { lv.song = SONGS[(si + SONGS.length - 1) % SONGS.length].id; this.preview(); }, () => { lv.song = SONGS[(si + 1) % SONGS.length].id; this.preview(); }, 'es-song');
      row('Colours', '', y + 124, () => { lv.color = ((lv.color || 0) + COLORS.length - 1) % COLORS.length; }, () => { lv.color = ((lv.color || 0) + 1) % COLORS.length; }, 'es-col', COLORS[lv.color || 0]);
      row('Start speed', CD.SPEEDS[lv.speed || 1].label, y + 152, () => { lv.speed = Math.max(0, (lv.speed || 1) - 1); }, () => { lv.speed = Math.min(4, (lv.speed || 1) + 1); }, 'es-spd');
      A.text(ctx, 'Keys: arrows scroll \u00b7 R rotate \u00b7 1 build \u00b7 2 delete \u00b7 Ctrl+Z undo \u00b7 P playtest', VW / 2, y + h - 18, 8.5, { color: '#ffe4cc' });
    },
    preview() {
      const s = SONGS.find((q) => q.id === this.level.song);
      Game.stopMenuMusic();
      AU.playSong(s.id, s.bpm, [{ bars: 2, part: 'drop' }], { loop: true });
      this.previewing = true;
    },
  });

  // Small icon for a palette item.
  function drawIcon(g, it, t, rot) {
    switch (it.t) {
      case 'block': g.drawImage(R.sprite('ico-block', 30, 30, (x) => { x.fillStyle = '#000'; x.fillRect(0, 0, 30, 30); x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(1, 1, 28, 28); }), -15, -15, 30, 30); break;
      case 'slab': g.fillStyle = '#000'; g.fillRect(-15, it.top ? -15 : 0, 30, 15); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(-14, it.top ? -14 : 1, 28, 13); break;
      case 'spike': case 'mspike': {
        g.save(); g.rotate((rot * Math.PI) / 180);
        const hh = it.t === 'mspike' ? 14 : 30;
        g.beginPath(); g.moveTo(-14, 15); g.lineTo(0, 15 - hh); g.lineTo(14, 15); g.closePath();
        g.fillStyle = '#000'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        g.restore(); break;
      }
      case 'saw': A.drawSaw(g, 0, 0, 14 * (it.r || 1), t); break;
      case 'pad': A.drawPad(g, 0, 10, it.c, rot === 180 ? -1 : 1, t); break;
      case 'orb': A.drawOrb(g, 0, 0, it.c, t, false); break;
      case 'portal': g.save(); g.scale(0.42, 0.42); A.drawPortal(g, 0, 0, it.p, t, 2); g.restore(); g.save(); g.scale(0.9, 0.9); A.drawPortalBadge(g, 0, -60, it.p); g.restore(); break;
      case 'speed': g.save(); g.scale(0.6, 0.6); A.drawSpeed(g, 0, 0, it.s, t); g.restore(); A.text(g, CD.SPEEDS[it.s].label, 0, 16, 9); break;
      case 'coin': A.drawCoin(g, 0, 0, t, false); break;
      case 'arrow': g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-10, -8); g.lineTo(2, 0); g.lineTo(-10, 8); g.closePath(); g.fill(); g.beginPath(); g.moveTo(0, -8); g.lineTo(12, 0); g.lineTo(0, 8); g.closePath(); g.fill(); break;
      case 'kelp': g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 14); g.quadraticCurveTo(-8, 0, 0, -6); g.quadraticCurveTo(6, -12, 0, -16); g.stroke(); break;
      case 'pulse': g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.stroke(); break;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
