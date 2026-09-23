/* Crab Dash — boot and main loop. */
(function (G) {
  'use strict';
  const CD = G.CD;
  const R = CD.render, Game = CD.game, UI = CD.ui, AU = CD.audio;

  if (!Game.scenes.editor) {
    Game.scenes.editor = {
      key(e, down) { if (down && e.code === 'Escape') Game.go('menu'); return true; },
      pointer() { return true; },
      update() {},
      draw(ctx) {
        R.drawBackground(ctx, '#3a3f52', 0, -87, 0);
        CD.art.text(ctx, 'Level editor', R.VW / 2, 140, 26);
        UI.button(ctx, 'ed-back', 26, 24, 36, 36, UI.circleBtn(UI.GREEN, 16, 'back', 22), () => Game.go('menu'), { circle: true });
      },
    };
  }

  const canvas = document.getElementById('game');
  R.init(canvas);
  Game.load();
  AU.setVolumes(Game.save.settings.music, Game.save.settings.sfx);
  Game.bindInput(canvas);

  const fontsDone = () => { Game.fontsReady = true; R.cache.clear(); };
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('40px "Lilita One"')]).then(fontsDone, fontsDone);
    setTimeout(fontsDone, 2500);
  } else fontsDone();

  Game.enter('title');
  Game.fade.a = 1; Game.fade.target = 0;

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    UI.dt = dt;
    const dpr = Math.min(2, G.devicePixelRatio || 1);
    if (Math.floor(canvas.clientWidth * dpr) !== canvas.width || Math.floor(canvas.clientHeight * dpr) !== canvas.height) R.resize();

    const F = Game.fade;
    try {
      if (F.a !== F.target) {
        F.a += Math.sign(F.target - F.a) * dt * F.speed;
        if ((F.target === 1 && F.a >= 1) || (F.target === 0 && F.a <= 0)) {
          F.a = F.target;
          if (F.target === 1 && F.next) { const n = F.next, a = F.arg; F.next = null; F.target = 0; Game.enter(n, a); }
        }
      }
      if (Game.scene && Game.scene.update) Game.scene.update(dt);
      const ctx = R.ctx;
      R.screen();
      UI.beginFrame();
      if (Game.scene) Game.scene.draw(ctx, dt);
      if (Game.popup) { UI.regs.length = 0; Game.popup.draw(ctx); }
      if (F.a > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, F.a)})`; ctx.fillRect(0, 0, R.VW, R.VH); }
      // block input to the old scene while fading out
      if (F.target === 1) UI.regs.length = 0;
    } catch (err) {
      console.error(err);
    }
  }
  requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : window);
