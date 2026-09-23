// Level solver: proves a level can be beaten with 60 Hz inputs, and measures how precise each input must be.
// Breadth-first over frames (one hold/release decision per 1/60 s, 4 physics ticks each), deduplicating
// near-identical states. A found path is exact (states are stored, not rounded), so it always replays.
require('../js/core.js');
const CD = globalThis.CD;
const TPF = 4; // ticks per 60 Hz frame

const MODE_I = { cube: 0, ship: 1, ball: 2, ufo: 3, wave: 4, robot: 5, spider: 6 };
// Dedup key. Triggers the player has already passed can never be touched again, so only the "used" marks of
// objects still ahead or under the player are part of the key; coins only count when a coin run asks for them.
function keyOf(p, held, level, withCoins) {
  const flags = (p.mini ? 1 : 0) | (p.flip ? 2 : 0) | (p.onGround ? 4 : 0) | (p.rising ? 8 : 0) | (p.accel ? 16 : 0) |
    (p.buffer ? 32 : 0) | (p.lock ? 64 : 0) | (held ? 128 : 0);
  let u = 0;
  const behind = p.x - 60;
  for (let i = 0; i < p.used.length; i++) {
    const id = p.used[i];
    if (id < 0 || level.objs[id].x1 < behind) continue;
    u += (id + 1) * 2654435761 % 1000003;
  }
  return `${MODE_I[p.mode]}${p.speed}${flags},${Math.round(p.x * 2)},${Math.round(p.y * 2)},${Math.round(p.vy * 4)},${Math.round(p.robotT * 20)},${u},${withCoins ? p.coins : 0},${p.floorY}`;
}

function runFrame(sim, held, prevHeld) {
  let ev = 0;
  for (let k = 0; k < TPF; k++) {
    ev |= CD.tick(sim, held, held && !prevHeld && k === 0);
    if (sim.p.dead || sim.p.done) break;
  }
  return ev;
}

// Keep at most `cap` of the candidate states, spread over height × vertical speed so that no
// (position, motion) combination is starved — a ship has to be low AND already climbing to clear a slalom.
function thin(list, cap, pick = (s) => s.p) {
  if (list.length <= cap) return list.map((_, i) => i);
  const buckets = new Map();
  for (let i = 0; i < list.length; i++) {
    const p = pick(list[i]);
    const k = Math.floor(p.y / 6) * 100 + Math.floor(p.vy);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  const keys = [...buckets.keys()];
  const out = [];
  // round-robin over buckets
  for (let r = 0; out.length < cap; r++) {
    let added = false;
    for (const k of keys) {
      const b = buckets.get(k);
      if (r < b.length) { out.push(b[r]); added = true; if (out.length >= cap) break; }
    }
    if (!added) break;
  }
  return out;
}

function solve(level, opts = {}) {
  const cap = opts.cap || 500;
  const needCoins = opts.coins || 0; // bitmask of coins that must be collected
  const maxFrames = opts.maxFrames || 60 * 60 * 5;
  const sim = CD.createSim(level);
  let frontier = [{ p: CD.clonePlayer(sim.p), held: false }];
  // history[f] holds, for every state of frame f+1, its parent index in frame f and the input used
  const parents = [], inputsAt = [];
  for (let f = 0; f < maxFrames; f++) {
    const next = [], nParent = [], nInput = [];
    const seen = new Set();
    for (let i = 0; i < frontier.length; i++) {
      const st = frontier[i];
      for (const held of [false, true]) {
        sim.p = CD.clonePlayer(st.p);
        runFrame(sim, held, st.held);
        const p = sim.p;
        if (p.dead) continue;
        if (p.done) {
          if ((p.coins & needCoins) !== needCoins) continue;
          const inputs = [held ? 1 : 0];
          let idx = i;
          for (let fr = f - 1; fr >= 0; fr--) { inputs.push(inputsAt[fr][idx]); idx = parents[fr][idx]; }
          inputs.reverse();
          return { ok: true, frames: f + 1, inputs, coins: p.coins };
        }
        const k = keyOf(p, held, level, !!needCoins);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ p, held });
        nParent.push(i);
        nInput.push(held ? 1 : 0);
      }
    }
    if (next.length === 0) {
      const far = Math.max(...frontier.map((s) => s.p.x));
      return { ok: false, frames: f, reachedX: far / CD.BLOCK };
    }
    let keep = null;
    if (next.length > cap) {
      // keep a spread across height and velocity so no route is starved; on coin runs, states that already
      // hold the wanted coins get their own half of the budget so the rare coin routes survive
      const all = next.map((_, j) => j);
      const pickFrom = (idx, n) => thin(idx.map((j) => next[j]), n).map((q) => idx[q]);
      if (needCoins) {
        const has = all.filter((j) => next[j].p.coins & needCoins), not = all.filter((j) => !(next[j].p.coins & needCoins));
        const a = pickFrom(has, Math.max(cap / 2, cap - not.length));
        keep = a.concat(pickFrom(not, cap - a.length));
      } else keep = pickFrom(all, cap);
    }
    if (keep) {
      frontier = keep.map((j) => next[j]);
      parents.push(Int32Array.from(keep.map((j) => nParent[j])));
      inputsAt.push(Uint8Array.from(keep.map((j) => nInput[j])));
    } else {
      frontier = next;
      parents.push(Int32Array.from(nParent));
      inputsAt.push(Uint8Array.from(nInput));
    }
  }
  return { ok: false, frames: maxFrames, reachedX: -1 };
}

// Replays an input list; returns {ok, x, ev log}.
function replay(level, inputs, shiftAt = -1, shift = 0) {
  const sim = CD.createSim(level);
  let prev = false;
  const edges = [];
  for (let f = 0; f < inputs.length; f++) {
    const held = !!inputs[f];
    if (held !== prev) edges.push(f);
    runFrame(sim, held, prev);
    prev = held;
    if (sim.p.dead) return { ok: false, x: sim.p.x / CD.BLOCK, frame: f };
    if (sim.p.done) return { ok: true, x: sim.p.x / CD.BLOCK, frame: f };
  }
  return { ok: false, x: sim.p.x / CD.BLOCK, frame: inputs.length };
}

function ticksOf(inputs) {
  const ticks = [];
  for (const v of inputs) for (let k = 0; k < TPF; k++) ticks.push(v ? 1 : 0);
  return ticks;
}
function pulsesOf(ticks) {
  const N = ticks.length, pulses = [];
  for (let t = 0; t < N; t++) {
    if (ticks[t] && (t === 0 || !ticks[t - 1])) pulses.push({ on: t, off: N });
    if (!ticks[t] && t > 0 && ticks[t - 1]) pulses[pulses.length - 1].off = t;
  }
  return pulses;
}
function winsWith(level, ticks) {
  const sim = CD.createSim(level);
  let pv = false;
  for (let t = 0; t < ticks.length; t++) {
    const held = !!ticks[t];
    CD.tick(sim, held, held && !pv);
    pv = held;
    if (sim.p.dead) return false;
    if (sim.p.done) return true;
  }
  return false;
}

// Remove presses that change nothing (the solver taps freely in mid-air), then shorten the rest to one
// frame where that still wins. What is left are the inputs a player actually has to make.
function minimise(level, inputs) {
  const ticks = ticksOf(inputs);
  // join presses separated by a short release when that still wins: a person holds through, they don't flutter
  let ps = pulsesOf(ticks);
  for (let i = 0; i + 1 < ps.length; i++) {
    const gap = ps[i + 1].on - ps[i].off;
    if (gap > 6 * TPF) continue;
    for (let t = ps[i].off; t < ps[i + 1].on; t++) ticks[t] = 1;
    if (!winsWith(level, ticks)) for (let t = ps[i].off; t < ps[i + 1].on; t++) ticks[t] = 0;
    else { ps[i + 1].on = ps[i].on; }
  }
  for (const P of pulsesOf(ticks)) {
    for (let t = P.on; t < P.off; t++) ticks[t] = 0;
    if (winsWith(level, ticks)) continue;
    for (let t = P.on; t < P.off; t++) ticks[t] = 1;
    if (P.off - P.on > TPF) {
      for (let t = P.on + TPF; t < P.off; t++) ticks[t] = 0;
      if (!winsWith(level, ticks)) for (let t = P.on + TPF; t < P.off; t++) ticks[t] = 1;
    }
  }
  return ticks;
}

// Timing window of each necessary press: shift the whole press (other presses fixed) earlier and later,
// and find the contiguous range of shifts that survives until shortly after the press after next.
function timingWindows(level, ticks, maxShift = 60) {
  const N = ticks.length;
  const pulses = pulsesOf(ticks);
  const cur = CD.createSim(level);
  let curT = 0, curPrev = false;
  const advance = (to) => {
    for (; curT < to; curT++) {
      const held = !!ticks[curT];
      CD.tick(cur, held, held && !curPrev);
      curPrev = held;
    }
  };
  const res = [];
  for (let i = 0; i < pulses.length; i++) {
    const P = pulses[i];
    const prevOff = i > 0 ? pulses[i - 1].off : 0;
    const nextOn = i + 1 < pulses.length ? pulses[i + 1].on : N;
    const dMin = Math.max(-maxShift, prevOff + 1 - P.on);
    const dMax = Math.min(maxShift, nextOn - 1 - P.off);
    const startT = Math.max(0, P.on + dMin);
    advance(startT);
    const snap = CD.clonePlayer(cur.p), snapPrev = curPrev;
    const horizon = Math.min(N, (i + 2 < pulses.length ? pulses[i + 2].on : N) + 60);
    const ok = (d) => {
      const sim = { level, p: CD.clonePlayer(snap) };
      let pv = snapPrev;
      const on = P.on + d, off = P.off + d;
      for (let t = startT; t < horizon; t++) {
        const held = (t >= Math.min(P.on, on) && t < Math.max(P.off, off)) ? (t >= on && t < off) : !!ticks[t];
        CD.tick(sim, held, held && !pv);
        pv = held;
        if (sim.p.dead) return false;
        if (sim.p.done) return true;
      }
      return true;
    };
    let a = 0, b = 0;
    while (a > dMin && ok(a - 1)) a--;
    while (b < dMax && ok(b + 1)) b++;
    // the press position at x: where the player is when the press lands
    const xs = CD.createSim(level); xs.p = CD.clonePlayer(snap);
    let pv = snapPrev;
    for (let t = startT; t < P.on; t++) { const held = !!ticks[t]; CD.tick(xs, held, held && !pv); pv = held; }
    res.push({ i, x: xs.p.x / CD.BLOCK, mode: xs.p.mode, width: b - a + 1, clipped: a === dMin || b === dMax });
  }
  return res;
}

// Decision windows from the full reachability graph.
// Forward: breadth-first over frames, recording both children (release / hold) of every kept state and its y.
// Backward: a state is "winning" if a child reaches the end or is winning.
// Then walk a player who keeps the button up unless pressing is required, and lets go as soon as that still wins.
// For each required press in a tap mode (cube, ball, UFO, robot, spider), the window is how many consecutive
// frames — ending at the last possible one — the press would have worked. 1 frame = 1/60 s.
// For ship and wave, where the button is held continuously, the measure is the corridor: the vertical spread
// (in blocks) of all winning states at that moment.
function analyze(level, opts = {}) {
  const cap = opts.cap || 500;
  const sim = CD.createSim(level);
  let frontier = [{ p: CD.clonePlayer(sim.p), held: false }];
  const kids = [], ys = [], modes = [];
  const maxFrames = 60 * 60 * 5;
  for (let f = 0; f < maxFrames && frontier.length; f++) {
    ys.push(Float32Array.from(frontier.map((s) => s.p.y)));
    modes.push(frontier.map((s) => s.p.mode));
    const next = [];
    const seen = new Map();
    const k2 = new Int32Array(frontier.length * 2).fill(-1);
    for (let i = 0; i < frontier.length; i++) {
      const st = frontier[i];
      for (let h = 0; h < 2; h++) {
        sim.p = CD.clonePlayer(st.p);
        runFrame(sim, !!h, st.held);
        const p = sim.p;
        if (p.dead) continue;
        if (p.done) { k2[i * 2 + h] = -2; continue; }
        const key = keyOf(p, !!h, level, false);
        let idx = seen.get(key);
        if (idx === undefined) { idx = next.length; seen.set(key, idx); next.push({ p, held: !!h }); }
        k2[i * 2 + h] = idx;
      }
    }
    if (next.length > cap) {
      const remap = new Int32Array(next.length).fill(-1);
      const kept = [];
      for (const o of thin(next, cap)) { remap[o] = kept.length; kept.push(next[o]); }
      for (let j = 0; j < k2.length; j++) if (k2[j] >= 0) k2[j] = remap[k2[j]];
      frontier = kept;
    } else frontier = next;
    kids.push(k2);
  }
  const win = new Array(kids.length);
  for (let fr = kids.length - 1; fr >= 0; fr--) {
    const k2 = kids[fr], n = k2.length / 2, w = new Uint8Array(n);
    const nw = win[fr + 1];
    for (let i = 0; i < n; i++) for (let h = 0; h < 2; h++) {
      const c = k2[i * 2 + h];
      if (c === -2 || (c >= 0 && nw && nw[c])) w[i] |= 1 << h;
    }
    win[fr] = w;
  }
  if (!win[0] || !win[0][0]) return { ok: false };
  const TAP = { cube: 1, ball: 1, ufo: 1, robot: 1, spider: 1 };
  const decisions = [], corridors = [];
  let i = 0, held = 0, run = 0;
  const xsim = CD.createSim(level);
  let pv = false;
  for (let fr = 0; fr < kids.length; fr++) {
    const w = win[fr][i];
    const mode = modes[fr][i];
    let next;
    if (w & 1) { next = 0; run = (w & 2) ? run + 1 : 0; }
    else {
      next = 1;
      if (!held && TAP[mode]) decisions.push({ x: xsim.p.x / CD.BLOCK, mode, width: run + 1 });
      run = 0;
    }
    if (!TAP[mode]) {
      let lo = Infinity, hi = -Infinity;
      const yy = ys[fr], wf = win[fr];
      for (let j = 0; j < yy.length; j++) if (wf[j] && modes[fr][j] === mode) { if (yy[j] < lo) lo = yy[j]; if (yy[j] > hi) hi = yy[j]; }
      corridors.push({ x: xsim.p.x / CD.BLOCK, mode, spread: (hi - lo) / CD.BLOCK });
    }
    held = next;
    const c = kids[fr][i * 2 + held];
    runFrame(xsim, !!held, pv); pv = !!held;
    if (c === -2) break;
    i = c;
  }
  return { ok: true, decisions, corridors, frames: kids.length };
}

// Can the player survive the next H frames from this state with some input sequence?
function feasible(level, p0, prevHeld, H = 60, cap = 120) {
  const sim = { level, p: null };
  let frontier = [{ p: p0, held: prevHeld }];
  for (let f = 0; f < H; f++) {
    const next = [], seen = new Set();
    for (const st of frontier) {
      for (let h = 0; h < 2; h++) {
        sim.p = CD.clonePlayer(st.p);
        runFrame(sim, !!h, st.held);
        if (sim.p.dead) continue;
        if (sim.p.done) return true;
        const k = keyOf(sim.p, !!h, level, false);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ p: sim.p, held: !!h });
      }
    }
    if (!next.length) return false;
    frontier = next.length > cap ? thin(next, cap).map((j) => next[j]) : next;
  }
  return true;
}

// For every press the (minimised) solution needs in a tap mode, slide the press earlier and later one frame
// at a time and check the player can still survive the following second. Window = frames that work.
function tapWindows(level, ticks, maxShift = 30) {
  const frames = [];
  for (let f = 0; f * TPF < ticks.length; f++) frames.push(ticks[f * TPF]);
  const snaps = [];
  const sim = CD.createSim(level);
  let pv = false;
  for (let f = 0; f < frames.length; f++) {
    snaps.push({ p: CD.clonePlayer(sim.p), prev: pv });
    runFrame(sim, !!frames[f], pv);
    pv = !!frames[f];
  }
  const pulses = [];
  for (let f = 0; f < frames.length; f++) {
    if (frames[f] && (f === 0 || !frames[f - 1])) pulses.push({ on: f, off: frames.length });
    if (!frames[f] && f > 0 && frames[f - 1]) pulses[pulses.length - 1].off = f;
  }
  const TAP = { cube: 1, ball: 1, ufo: 1, robot: 1, spider: 1 };
  const out = [];
  for (let i = 0; i < pulses.length; i++) {
    const P = pulses[i];
    const mode = snaps[P.on].p.mode;
    const prevOff = i > 0 ? pulses[i - 1].off : 0;
    // a player may hold for as long as the moment needs, so try several hold lengths for each start time
    const durs = [...new Set([Math.min(P.off - P.on, 30), 1, 3, 6, 10, 15, 22, 30])];
    const tryDur = (d, dur) => {
      const on = P.on + d;
      const base = Math.min(on, P.on);
      const s2 = { level, p: CD.clonePlayer(snaps[base].p) };
      let hv = snaps[base].prev;
      for (let f = base; f < on + dur; f++) {
        const held = f >= on;
        runFrame(s2, held, hv);
        hv = held;
        if (s2.p.dead) return false;
        if (s2.p.done) return true;
      }
      return feasible(level, s2.p, hv);
    };
    const test = (d) => {
      const on = P.on + d;
      if (on <= prevOff || on < 0 || on >= frames.length) return false;
      for (const dur of durs) if (tryDur(d, dur)) return true;
      return false;
    };
    let a = 0, b = 0;
    while (a > -maxShift && test(a - 1)) a--;
    while (b < maxShift && test(b + 1)) b++;
    out.push({ x: snaps[P.on].p.x / CD.BLOCK, mode, width: b - a + 1, capped: a === -maxShift || b === maxShift });
  }
  return out;
}

module.exports = { solve, replay, timingWindows, minimise, winsWith, ticksOf, analyze, tapWindows, feasible, TPF };

if (require.main === module) {
  require('../js/levels.js');
  const args = process.argv.slice(2);
  const wantCoins = args.includes('--coins');
  const which = args.filter((a) => !a.startsWith('--'))[0];
  const list = CD.LEVELS.filter((l) => !which || l.id === which || String(CD.LEVELS.indexOf(l)) === which);
  for (const def of list) {
    const level = CD.compileLevel(def);
    const t0 = Date.now();
    const r = solve(level);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!r.ok) { console.log(`✗ ${def.name}: NOT beatable — stuck near x=${r.reachedX.toFixed(1)} blocks (${secs}s)`); continue; }
    const rp = replay(level, r.inputs);
    // A pad should carry a player who simply runs onto it: from the winning path's state 3 blocks before
    // each floor pad, let go of the button and check the launch lands safely.
    {
      const sim = CD.createSim(level);
      let pv = false;
      const pads = level.objs.filter((o) => o.type === 'pad' && o.rot !== 180 && o.c !== 'B').sort((a, b) => a.x0 - b.x0);
      let pi = 0;
      const bad = [];
      for (const v of r.inputs) {
        const held = !!v;
        for (let k = 0; k < TPF; k++) {
          while (pi < pads.length && sim.p.x > pads[pi].x0 - 90) {
            const pad = pads[pi++];
            const p = sim.p;
            if (!p.onGround || p.flip || p.mode !== 'cube' || Math.abs(p.y - (pad.y0 + CD.playerSize(p) / 2)) > 1) continue;
            const s2 = { level, p: CD.clonePlayer(p) };
            let launched = false, ok = true;
            for (let t = 0; t < 240 * 2; t++) {
              const ev = CD.tick(s2, false, false);
              if (ev & CD.EV.PAD) launched = true;
              if (s2.p.dead) { ok = false; break; }
              if (launched && s2.p.onGround) break;
            }
            if (!ok) bad.push((pad.x0 / 30).toFixed(1));
          }
          CD.tick(sim, held, held && !pv && k === 0);
        }
        pv = held;
        if (sim.p.done || sim.p.dead) break;
      }
      if (bad.length) console.log(`   ⚠ running onto these pads is fatal: x ${bad.join(', ')}`);
    }
    // every portal on the winning path must actually be touched: a skippable portal is a design bug
    {
      const sim = CD.createSim(level);
      let pv = false;
      const touched = new Set();
      for (const v of r.inputs) {
        const held = !!v;
        for (let k = 0; k < TPF; k++) {
          const ev = CD.tick(sim, held, held && !pv && k === 0);
          if (ev & (CD.EV.PORTAL | CD.EV.SPEED | CD.EV.FLIP | CD.EV.PAD)) { touched.add(sim.p.lastUsed); }
          for (const id of sim.p.used) if (id >= 0) touched.add(id);
        }
        pv = held;
        if (sim.p.done || sim.p.dead) break;
      }
      const skipped = level.objs.filter((o) => (o.type === 'mode' || o.type === 'speed' || o.type === 'size') && !touched.has(o.id));
      if (skipped.length) console.log(`   ⚠ portals skipped by the winning path: ${skipped.map((o) => (o.p || 'speed' + o.speed) + '@' + (o.x0 / 30).toFixed(1)).join(', ')}`);
    }
    try {
      const fs = require('fs');
      fs.mkdirSync(__dirname + '/out', { recursive: true });
      fs.writeFileSync(__dirname + `/out/${def.id}.json`, JSON.stringify(r.inputs));
    } catch (e) { /* optional */ }
    const w = tapWindows(level, minimise(level, r.inputs));
    const report = (label, list) => {
      if (!list.length) return;
      const widths = list.map((e) => e.width).sort((a, b) => a - b);
      const pct = (q) => String(widths[Math.min(widths.length - 1, Math.floor(q * widths.length))]);
      const tight = list.slice().sort((a, b) => a.width - b.width).slice(0, 6).map((e) => `x${e.x.toFixed(1)}(${e.mode}):${e.width}`).join('  ');
      console.log(`   ${label} ${list.length} | window frames: min ${pct(0)} p10 ${pct(0.1)} median ${pct(0.5)} | tightest ${tight}`);
    };
    const FLY = { ship: 1, wave: 1, ufo: 1 };
    console.log(`✓ ${def.name}: beatable in ${(r.frames / 60).toFixed(1)}s, replay ${rp.ok ? 'ok' : 'FAILED at x=' + rp.x.toFixed(1)} (${secs}s)`);
    report('taps', w.filter((e) => !FLY[e.mode]));
    // Flying sections: the height of the free gap around the ship/wave along the winning path
    // (nearest obstacle above minus nearest obstacle below, over the player's width), in blocks.
    {
      const sim = CD.createSim(level);
      let pv = false, minGap = Infinity, at = 0, mode = '';
      const gaps = [];
      for (const v of r.inputs) {
        const held = !!v;
        for (let k = 0; k < TPF; k++) {
          CD.tick(sim, held, held && !pv && k === 0);
          const p = sim.p;
          if (FLY[p.mode] && !p.dead && !p.done) {
            let lo = p.floorY, hi = isFinite(p.ceilY) ? p.ceilY : p.y + 600;
            const x0 = p.x - 15, x1 = p.x + 15;
            for (const o of level.objs) {
              if ((o.k !== 'solid' && o.k !== 'haz') || o.x1 <= x0 || o.x0 >= x1) continue;
              if (o.y1 <= p.y && o.y1 > lo) lo = o.y1;
              if (o.y0 >= p.y && o.y0 < hi) hi = o.y0;
            }
            const g = (hi - lo) / 30;
            gaps.push(g);
            if (g < minGap) { minGap = g; at = p.x / 30; mode = p.mode; }
          }
        }
        pv = held;
        if (sim.p.done || sim.p.dead) break;
      }
      if (gaps.length) {
        gaps.sort((a, b) => a - b);
        console.log(`   flying gap (blocks): min ${minGap.toFixed(2)} at x${at.toFixed(1)} (${mode}) | p10 ${gaps[Math.floor(gaps.length * 0.1)].toFixed(2)} | median ${gaps[Math.floor(gaps.length / 2)].toFixed(2)}`);
      }
    }
    if (wantCoins) for (let c = 0; c < level.coinCount; c++) {
      const rc = solve(level, { coins: 1 << c, cap: 2000 });
      console.log(`   coin ${c + 1}: ${rc.ok ? 'reachable' : 'UNREACHABLE (stuck x=' + (rc.reachedX || 0).toFixed(1) + ')'}`);
    }
  }
}
