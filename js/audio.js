/* Crab Dash — audio. All music is original and synthesised live with Web Audio (no audio files).
 * A song is a style (key, chords, motifs, sounds) played over the level's own section list, so every drop,
 * build and break lands exactly where the level changes. Scheduling uses a short look-ahead on the audio clock. */
(function (G) {
  'use strict';
  const CD = G.CD;
  const AU = (CD.audio = {});
  let ctx = null, master, musicBus, sfxBus, comp, delay, delayFb, delayWet, verb, verbWet, noiseBuf;
  let musicVol = 0.8, sfxVol = 0.8;

  AU.ready = () => !!ctx;

  // The mixer and shared effects, built on any audio context (the live one, or an offline one for video).
  function buildGraph(c) {
    const g = {};
    g.comp = c.createDynamicsCompressor();
    g.comp.threshold.value = -14; g.comp.knee.value = 10; g.comp.ratio.value = 4; g.comp.attack.value = 0.004; g.comp.release.value = 0.2;
    g.master = c.createGain(); g.master.gain.value = 0.9;
    g.comp.connect(g.master); g.master.connect(c.destination);
    g.musicBus = c.createGain(); g.musicBus.gain.value = musicVol; g.musicBus.connect(g.comp);
    g.sfxBus = c.createGain(); g.sfxBus.gain.value = sfxVol; g.sfxBus.connect(g.comp);
    // echo on leads and plucks; its time is set per song (a dotted eighth) in playSong
    g.delay = c.createDelay(1.5); g.delayFb = c.createGain(); g.delayFb.gain.value = 0.32;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
    g.delayWet = c.createGain(); g.delayWet.gain.value = 0.35;
    g.delay.connect(dlp); dlp.connect(g.delayFb); g.delayFb.connect(g.delay); dlp.connect(g.delayWet); g.delayWet.connect(g.musicBus);
    g.verb = c.createConvolver(); g.verb.buffer = impulse(c, 1.8, 2.6);
    g.verbWet = c.createGain(); g.verbWet.gain.value = 0.28;
    g.verb.connect(g.verbWet); g.verbWet.connect(g.musicBus);
    g.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = g.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return g;
  }
  function useGraph(c, g) {
    ctx = c;
    ({ comp, master, musicBus, sfxBus, delay, delayFb, delayWet, verb, verbWet, noiseBuf } = g);
  }
  AU.init = function () {
    if (ctx) { if (ctx.state === 'suspended' && !AU.paused) ctx.resume(); return; }
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    useGraph(c, buildGraph(c));
    setInterval(schedule, 25);
  };
  function impulse(c, sec, decay) {
    const n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }
  AU.setVolumes = function (m, s) {
    musicVol = m; sfxVol = s;
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(m, ctx.currentTime, 0.02);
    sfxBus.gain.setTargetAtTime(s, ctx.currentTime, 0.02);
  };
  AU.pause = function () { AU.paused = true; if (ctx && ctx.state === 'running') ctx.suspend(); };
  AU.resume = function () { AU.paused = false; if (ctx && ctx.state === 'suspended') ctx.resume(); };
  AU.now = () => (ctx ? ctx.currentTime : 0);

  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ───────────────────────── instruments ─────────────────────────
  function env(g, t, a, peak, d, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, d / 3);
    g.gain.setTargetAtTime(0.0001, end, rel / 4);
  }
  function noise(t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return s;
  }
  const I = {
    kick(out, t, v = 1) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      g.gain.setValueAtTime(1.0 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
      const n = noise(t, 0.02), ng = ctx.createGain(), hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2500;
      ng.gain.setValueAtTime(0.25 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      n.connect(hp); hp.connect(ng); ng.connect(out);
    },
    snare(out, t, v = 1) {
      const n = noise(t, 0.2), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
      g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      n.connect(bp); bp.connect(g); g.connect(out); g.connect(verb);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
      og.gain.setValueAtTime(0.35 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.15);
    },
    clap(out, t, v = 1) {
      const n = noise(t, 0.25), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.5 * v, t + i * 0.011); g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.011 + 0.009); }
      g.gain.setValueAtTime(0.45 * v, t + 0.034); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      n.connect(bp); bp.connect(g); g.connect(out); g.connect(verb);
    },
    hat(out, t, v = 1, open = false) {
      const n = noise(t, open ? 0.3 : 0.06), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 7200;
      const d = open ? 0.22 : 0.045;
      g.gain.setValueAtTime(0.22 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      n.connect(hp); hp.connect(g); g.connect(out);
    },
    crash(out, t, v = 1) {
      const n = noise(t, 1.6), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 4500;
      g.gain.setValueAtTime(0.28 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      n.connect(hp); hp.connect(g); g.connect(out); g.connect(verb);
    },
    riser(out, t, dur, v = 1) {
      const n = noise(t, dur), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.22 * v, t + dur);
      g.gain.setValueAtTime(0.0001, t + dur + 0.01);
      n.connect(bp); bp.connect(g); g.connect(out); g.connect(verb);
    },
    bass(out, t, note, dur, v = 1, wave = 'sawtooth') {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = wave; o.frequency.value = mtof(note);
      o2.type = 'square'; o2.frequency.value = mtof(note - 12);
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(260, t + Math.min(dur, 0.25));
      env(g, t, 0.006, 0.34 * v, 0.12, 0.7, 0.05, t + dur);
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(out);
      o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    },
    lead(out, t, note, dur, v = 1, wave = 'sawtooth', bright = 1) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(900 + 3600 * bright, t); f.frequency.setTargetAtTime(700 + 2200 * bright, t + 0.02, 0.15);
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = wave; o.frequency.value = mtof(note); o.detune.value = det;
        const vib = ctx.createOscillator(), vg = ctx.createGain();
        vib.frequency.value = 5.5; vg.gain.value = dur > 0.3 ? 9 : 0;
        vib.connect(vg); vg.connect(o.detune);
        o.connect(f); o.start(t); o.stop(t + dur + 0.3); vib.start(t); vib.stop(t + dur + 0.3);
      }
      env(g, t, 0.01, 0.16 * v, 0.2, 0.75, 0.12, t + dur);
      f.connect(g); g.connect(out); g.connect(delay);
    },
    pluck(out, t, note, dur, v = 1, wave = 'square') {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = wave; o.frequency.value = mtof(note);
      f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.18);
      g.gain.setValueAtTime(0.13 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.12, dur));
      o.connect(f); f.connect(g); g.connect(out); g.connect(delay);
      o.start(t); o.stop(t + dur + 0.2);
    },
    chord(out, t, notes, dur, v = 1, pump = 0, beat = 0.5) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07 * v, t + 0.03);
      if (pump) {
        // side-chain feel: duck on every beat
        for (let b = 0; b * beat < dur; b++) {
          const tb = t + b * beat;
          g.gain.setValueAtTime(0.012 * v, tb + 0.001);
          g.gain.linearRampToValueAtTime(0.07 * v, tb + beat * 0.55);
        }
      }
      g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
      for (const n of notes) for (const det of [-12, 0, 12]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.4);
      }
      f.connect(g); g.connect(out); g.connect(verb);
    },
    pad(out, t, notes, dur, v = 1) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 1300;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * v, t + Math.min(0.6, dur * 0.4));
      g.gain.setTargetAtTime(0.0001, t + dur, 0.25);
      for (const n of notes) for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = mtof(n); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 1.2);
      }
      f.connect(g); g.connect(out); g.connect(verb);
    },
  };

  // ───────────────────────── composition ─────────────────────────
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
  function deg(style, d, oct = 0) {
    const sc = style.scale;
    const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
    return style.key + sc[i] + 12 * (o + oct);
  }
  // chord for bar b: [rootDegree] → triad from the scale
  function triad(style, root, oct = 0) { return [deg(style, root, oct), deg(style, root + 2, oct), deg(style, root + 4, oct)]; }

  // Styles — keys, progressions (scale degrees per bar), motifs ([step, degree, length] in 16ths over 2 bars).
  const STYLES = {
    lowtide: {
      key: 57, scale: MINOR, prog: [0, 5, 2, 6], wave: 'sawtooth', bassWave: 'sawtooth',
      motif: [[0, 7, 2], [2, 9, 2], [4, 11, 3], [7, 10, 1], [8, 9, 2], [10, 7, 2], [12, 9, 4], [16, 7, 2], [18, 9, 2], [20, 11, 2], [22, 12, 2], [24, 11, 3], [27, 9, 1], [28, 8, 4]],
      arp: [0, 2, 4, 7, 4, 2], hatOff: true,
    },
    crabwalk: {
      key: 52, scale: MINOR, prog: [0, 3, 6, 4], wave: 'square', bassWave: 'square',
      motif: [[0, 7, 1], [1, 7, 1], [2, 11, 2], [4, 9, 2], [6, 7, 1], [7, 9, 1], [8, 11, 3], [11, 12, 1], [12, 11, 2], [14, 9, 2], [16, 7, 2], [18, 6, 2], [20, 7, 2], [22, 9, 2], [24, 7, 6], [30, 4, 2]],
      arp: [0, 4, 7, 11, 7, 4], hatOff: true,
    },
    coral: {
      key: 55, scale: MAJOR, prog: [0, 4, 5, 3], wave: 'sawtooth', bassWave: 'sawtooth',
      motif: [[0, 4, 2], [2, 7, 2], [4, 9, 2], [6, 8, 2], [8, 7, 4], [12, 4, 2], [14, 5, 2], [16, 6, 2], [18, 7, 2], [20, 11, 3], [23, 9, 1], [24, 8, 2], [26, 7, 2], [28, 6, 4]],
      arp: [0, 2, 4, 2, 7, 4], hatOff: false,
    },
    shell: {
      key: 50, scale: MINOR, prog: [0, 0, 5, 6], wave: 'sawtooth', bassWave: 'square',
      motif: [[0, 7, 1], [2, 7, 1], [3, 8, 1], [4, 7, 2], [6, 5, 2], [8, 4, 1], [10, 4, 1], [11, 5, 1], [12, 7, 4], [16, 9, 1], [18, 9, 1], [19, 10, 1], [20, 9, 2], [22, 7, 2], [24, 8, 3], [27, 7, 1], [28, 5, 4]],
      arp: [0, 3, 7, 10, 7, 3], hatOff: true,
    },
    riptide: {
      key: 54, scale: MINOR, prog: [0, 5, 3, 4], wave: 'square', bassWave: 'sawtooth',
      motif: [[0, 11, 1], [1, 9, 1], [2, 7, 1], [3, 9, 1], [4, 11, 2], [6, 12, 2], [8, 14, 3], [11, 12, 1], [12, 11, 2], [14, 9, 2], [16, 7, 1], [17, 9, 1], [18, 11, 1], [19, 12, 1], [20, 14, 2], [22, 16, 2], [24, 14, 4], [28, 11, 4]],
      arp: [0, 7, 3, 10, 7, 14], hatOff: false,
    },
    abyss: {
      key: 49, scale: MINOR, prog: [0, 6, 5, 4], wave: 'sawtooth', bassWave: 'sawtooth',
      motif: [[0, 7, 3], [3, 6, 1], [4, 7, 2], [6, 9, 2], [8, 10, 4], [12, 9, 2], [14, 7, 2], [16, 5, 3], [19, 4, 1], [20, 5, 2], [22, 7, 2], [24, 6, 6], [30, 4, 2]],
      arp: [0, 1, 4, 7, 4, 1], hatOff: true,
    },
    menu: {
      key: 60, scale: MAJOR, prog: [0, 5, 3, 4], wave: 'triangle', bassWave: 'triangle',
      motif: [[0, 4, 2], [3, 5, 1], [4, 7, 4], [10, 5, 2], [12, 4, 4], [16, 2, 2], [19, 4, 1], [20, 5, 4], [26, 4, 2], [28, 2, 4]],
      arp: [0, 2, 4, 7, 4, 2], hatOff: true,
    },
    practice: {
      key: 62, scale: MAJOR, prog: [0, 3, 5, 4], wave: 'triangle', bassWave: 'triangle',
      motif: [[0, 7, 4], [6, 6, 2], [8, 4, 4], [12, 2, 4], [16, 5, 4], [22, 4, 2], [24, 2, 6], [30, 1, 2]],
      arp: [0, 4, 7, 4], hatOff: false,
    },
  };
  AU.STYLES = STYLES;

  // What plays in one 16th-note step of a given part.
  function playStep(bus, style, part, barInSec, barsInSec, barAbs, step, t, spb) {
    const s16 = spb / 4;
    const chordDeg = style.prog[barAbs % style.prog.length];
    const last = barInSec === barsInSec - 1;
    const full = part === 'drop' || part === 'drop2';
    const beat = step % 4 === 0, bi = step >> 2;
    // drums
    if (part !== 'break' && part !== 'ambient') {
      if (full || part === 'verse' || part === 'verse2') { if (beat) I.kick(bus, t, full ? 1 : 0.85); }
      else if (part === 'intro' && barInSec >= barsInSec / 2) { if (beat && bi % 2 === 0) I.kick(bus, t, 0.75); }
      else if (part === 'build') {
        const k = barInSec / barsInSec;
        if (beat) I.kick(bus, t, 0.8);
        const div = k < 0.5 ? 4 : k < 0.75 ? 2 : 1;
        if (step % div === 0) I.snare(bus, t, 0.25 + 0.6 * k);
      } else if (part === 'outro') { if (beat && barInSec < barsInSec - 1) I.kick(bus, t, 0.7); }
      if ((full || part === 'verse' || part === 'verse2') && (bi === 1 || bi === 3) && step % 4 === 0) (full ? I.clap : I.snare)(bus, t, 0.8);
      if (full || part === 'verse' || part === 'verse2' || part === 'intro') {
        if (style.hatOff) { if (step % 4 === 2) I.hat(bus, t, full ? 0.9 : 0.6, full && step % 8 === 6); }
        else if (step % 2 === 0) I.hat(bus, t, step % 4 === 2 ? 0.8 : 0.45);
      }
      if (full && barInSec === 0 && step === 0) I.crash(bus, t);
      if (part === 'build' && barInSec === 0 && step === 0) I.riser(bus, t, barsInSec * 4 * spb - 0.05);
    }
    // bass
    const root = deg(style, chordDeg, -2);
    if (part !== 'intro' && part !== 'break' && part !== 'ambient') {
      if (full) { if (step % 4 === 2 || (step % 8 === 7 && barInSec % 2)) I.bass(bus, t, step % 8 === 7 ? root + 12 : root, s16 * 1.8, 1, style.bassWave); }
      else if (step % 4 === 2) I.bass(bus, t, root, s16 * 1.6, 0.8, style.bassWave);
    }
    // harmony
    if (step === 0) {
      const ch = triad(style, chordDeg, 0);
      if (full) I.chord(bus, t, ch, spb * 4, 1, 1, spb);
      else if (part === 'break' || part === 'intro' || part === 'outro' || part === 'ambient') I.pad(bus, t, ch, spb * 4, part === 'outro' && last ? 0.5 : 1);
      else if (part === 'build') I.pad(bus, t, ch, spb * 4, 0.8);
    }
    // arpeggio
    if (part === 'verse' || part === 'verse2' || part === 'build' || part === 'intro' || part === 'ambient' || (full && step % 2 === 1)) {
      if (step % 2 === 0 || full) {
        const a = style.arp[(barAbs * 8 + (step >> 1)) % style.arp.length];
        I.pluck(bus, t, deg(style, chordDeg + a, 1), s16 * 1.5, part === 'intro' || part === 'ambient' ? 0.7 : 0.9, style.wave === 'triangle' ? 'triangle' : 'square');
      }
    }
    // lead motif
    if (full || part === 'break' || part === 'ambient' || (part === 'verse2')) {
      const phraseStep = (barInSec % 2) * 16 + step;
      for (const [st, d, len] of style.motif) {
        if (st === phraseStep) I.lead(bus, t, deg(style, d, 0), len * s16 * 0.95, part === 'break' ? 0.7 : 1, style.wave, full ? 1 : 0.4);
      }
    }
  }

  // ───────────────────────── song playback ─────────────────────────
  let song = null;
  // sections: [{bars, part}] — the song loops the whole list when loop = true.
  AU.playSong = function (styleName, bpm, sections, opts = {}) {
    if (!ctx) return;
    AU.stopSong(0.02);
    const style = STYLES[styleName] || STYLES.lowtide;
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(musicBus);
    const spb = 60 / bpm;
    delay.delayTime.setValueAtTime(spb * 0.75, ctx.currentTime);
    const secs = [];
    let bar = 0;
    for (const s of sections) { secs.push({ bar0: bar, bars: s.bars, part: s.part }); bar += s.bars; }
    const start = ctx.currentTime + (opts.delay || 0.05) - (opts.offset || 0);
    song = { style, bus, spb, secs, totalBars: bar, start, nextStep: Math.max(0, Math.ceil((ctx.currentTime - start) / (spb / 4))), loop: !!opts.loop, tail: opts.tail != null ? opts.tail : 2 };
    return start;
  };
  AU.songTime = () => (song && ctx ? ctx.currentTime - song.start : 0);
  AU.beatPhase = function () {
    if (!song || !ctx) return 0;
    const b = (ctx.currentTime - song.start) / song.spb;
    return b < 0 ? 0 : b - Math.floor(b);
  };
  AU.stopSong = function (fade = 0.05) {
    if (!song || !ctx) { song = null; return; }
    const b = song.bus;
    b.gain.setTargetAtTime(0.0001, ctx.currentTime, Math.max(0.005, fade / 3));
    setTimeout(() => { try { b.disconnect(); } catch (e) { /* already gone */ } }, fade * 1000 + 400);
    song = null;
  };
  function schedule() {
    if (!ctx || !song || AU.paused) return;
    const ahead = ctx.currentTime + 0.14;
    const s16 = song.spb / 4;
    while (song && song.start + song.nextStep * s16 < ahead) {
      const st = song.nextStep++;
      const t = song.start + st * s16;
      let barAbs = Math.floor(st / 16);
      const step = st % 16;
      if (barAbs >= song.totalBars) {
        if (song.loop) barAbs %= song.totalBars;
        else if (barAbs >= song.totalBars + song.tail) { AU.stopSong(1); return; }
        else continue;
      }
      const sec = song.secs.find((x) => barAbs >= x.bar0 && barAbs < x.bar0 + x.bars) || song.secs[song.secs.length - 1];
      if (t < ctx.currentTime - 0.01) continue; // skipped (tab was hidden)
      playStep(song.bus, song.style, sec.part, barAbs - sec.bar0, sec.bars, barAbs, step, t, song.spb);
    }
  }

  // ───────────────────────── sound effects ─────────────────────────
  AU.sfx = function (name, v = 1, at) {
    if (!ctx) return;
    const t = at != null ? at : ctx.currentTime + 0.005;
    const out = sfxBus;
    switch (name) {
      case 'death': {
        const n = noise(t, 0.6), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.45);
        g.gain.setValueAtTime(0.7 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        n.connect(f); f.connect(g); g.connect(out);
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
        og.gain.setValueAtTime(0.8 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.45);
        break;
      }
      case 'start': {
        [0, 4, 7, 12].forEach((d, i) => tone(out, 'triangle', 72 + d, t + i * 0.055, 0.35, 0.2 * v));
        const n = noise(t, 0.5), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(6000, t + 0.4); f.Q.value = 1.5;
        g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        n.connect(f); f.connect(g); g.connect(out);
        break;
      }
      case 'complete': {
        const seq = [60, 64, 67, 72, 76, 79, 84];
        seq.forEach((m, i) => tone(out, 'square', m, t + i * 0.07, 0.5 + (i === seq.length - 1 ? 0.8 : 0), 0.09 * v));
        [72, 76, 79].forEach((m) => tone(out, 'sawtooth', m, t + 0.5, 1.4, 0.05 * v));
        break;
      }
      case 'coin':
        tone(out, 'square', 88, t, 0.08, 0.12 * v); tone(out, 'square', 95, t + 0.07, 0.35, 0.12 * v); break;
      case 'checkpoint':
        tone(out, 'triangle', 84, t, 0.12, 0.25 * v); tone(out, 'triangle', 91, t + 0.05, 0.16, 0.2 * v); break;
      case 'click':
        tone(out, 'triangle', 79, t, 0.05, 0.12 * v); break;
      case 'back':
        tone(out, 'triangle', 72, t, 0.06, 0.12 * v); break;
      case 'newbest':
        [76, 81, 88].forEach((m, i) => tone(out, 'square', m, t + i * 0.09, 0.25, 0.1 * v)); break;
      case 'unlock':
        [67, 71, 74, 79].forEach((m, i) => tone(out, 'triangle', m, t + i * 0.06, 0.3, 0.18 * v)); break;
    }
  };
  function tone(out, wave, note, t, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.value = mtof(note);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  // ───────────────────────── offline rendering (for videos) ─────────────────────────
  // Renders song time t0..t1 of a level's soundtrack to an AudioBuffer, faster than real time and sample-exact,
  // plus any sound effects given as { t, name } in song time. A preroll lets notes that began before t0 ring in.
  AU.renderOffline = async function (styleName, bpm, sections, t0, t1, opts = {}) {
    const rate = opts.rate || 48000, pre = opts.preroll == null ? 2 : opts.preroll, tail = opts.tail == null ? 1 : opts.tail;
    const OAC = G.OfflineAudioContext || G.webkitOfflineAudioContext;
    const off = new OAC(2, Math.ceil((t1 - t0 + pre + tail) * rate), rate);
    const saved = ctx ? { c: ctx, g: { comp, master, musicBus, sfxBus, delay, delayFb, delayWet, verb, verbWet, noiseBuf } } : null;
    useGraph(off, buildGraph(off));
    try {
      const style = STYLES[styleName] || STYLES.lowtide, spb = 60 / bpm, s16 = spb / 4;
      delay.delayTime.value = spb * 0.75;
      const secs = [];
      let bars = 0;
      for (const s of sections) { secs.push({ bar0: bars, bars: s.bars, part: s.part }); bars += s.bars; }
      const bus = off.createGain();
      bus.connect(musicBus);
      const shift = pre - t0; // offline clock = song time + shift
      for (let st = Math.max(0, Math.ceil((t0 - pre) / s16)); st * s16 <= t1; st++) {
        const barAbs = Math.floor(st / 16);
        if (barAbs >= bars) break;
        const sec = secs.find((x) => barAbs >= x.bar0 && barAbs < x.bar0 + x.bars);
        playStep(bus, style, sec.part, barAbs - sec.bar0, sec.bars, barAbs, st % 16, st * s16 + shift, spb);
      }
      const end = t1 + shift, fade = opts.fade == null ? 0.5 : opts.fade;
      bus.gain.setValueAtTime(1, end - fade);
      bus.gain.linearRampToValueAtTime(0.0001, end);
      for (const e of opts.events || []) if (e.t >= t0 && e.t <= t1) AU.sfx(e.name, e.v || 1, e.t + shift);
    } finally {
      if (saved) useGraph(saved.c, saved.g); else ctx = null;
    }
    return { buffer: await off.startRendering(), preroll: pre };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
