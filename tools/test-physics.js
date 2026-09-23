// Checks the engine against the published Geometry Dash numbers.
// Run: node tools/test-physics.js
require('../js/core.js');
const CD = globalThis.CD;

function flatLevel(len, objects = []) {
  return CD.compileLevel({ length: len, objects });
}

// 1) Cube jump on flat ground at each speed: peak rise and horizontal distance.
for (let si = 0; si < 5; si++) {
  const lvl = flatLevel(200);
  lvl.startSpeed = si;
  const sim = CD.createSim(lvl);
  let peak = 0, took = null, landed = null, ticks = 0;
  for (let i = 0; i < 400; i++) {
    const ev = CD.tick(sim, i === 0, i === 0);
    ticks++;
    if (ev & CD.EV.JUMP) took = sim.p.x;
    peak = Math.max(peak, sim.p.y - 15);
    if (took !== null && (ev & CD.EV.LAND)) { landed = sim.p.x; break; }
  }
  const bps = CD.xSpeed(si) * 60 / 30;
  console.log(`speed ${CD.SPEEDS[si].label}: ${bps.toFixed(3)} blocks/s | cube jump rise ${(peak / 30).toFixed(3)} blocks | length ${((landed - took) / 30).toFixed(3)} blocks | airtime ${((landed - took) / CD.xSpeed(si)).toFixed(2)} frames`);
}

// 2) Derived launch velocities at 1x, normal size.
const T = CD.launchTable();
for (const kind of Object.keys(T)) {
  const row = Object.keys(T[kind]).map((m) => `${m} ${T[kind][m][0][1].toFixed(2)}`).join('  ');
  console.log(`${kind}: ${row}`);
}

// 3) Ship: hold from the floor — time to reach the 10-block ceiling, and fall time back.
{
  const lvl = flatLevel(400);
  lvl.startMode = 'ship';
  const sim = CD.createSim(lvl);
  let t = 0;
  while (sim.p.y + 15 < sim.p.ceilY - 0.01 && t < 2000) { CD.tick(sim, true, t === 0); t++; }
  const up = t;
  t = 0;
  while (sim.p.y - 15 > sim.p.floorY + 0.01 && t < 2000) { CD.tick(sim, false, false); t++; }
  console.log(`ship: floor→ceiling holding ${(up / 240).toFixed(3)} s, ceiling→floor released ${(t / 240).toFixed(3)} s`);
}

// 4) Spike hitbox: triple-spike clearance window at 1x (frames of 60 Hz where a jump survives).
function survives(objects, jumpTick, speed = 1) {
  const lvl = flatLevel(60, objects);
  lvl.startSpeed = speed;
  const sim = CD.createSim(lvl);
  for (let i = 0; i < 240 * 4; i++) {
    const held = i >= jumpTick && i < jumpTick + 4;
    const ev = CD.tick(sim, held, i === jumpTick);
    if (ev & CD.EV.DIE) return false;
    if (sim.p.x > 20 * 30) return true;
  }
  return true;
}
for (const n of [1, 2, 3]) {
  const objs = [];
  for (let k = 0; k < n; k++) objs.push({ t: 'spike', x: 10 + k, y: 0 });
  let ok = 0, first = null, last = null;
  for (let j = 0; j < 240 * 1.5; j++) { if (survives(objs, j)) { ok++; if (first === null) first = j; last = j; } }
  console.log(`${n}-spike at 1x: ${ok} surviving ticks (${(ok / 4).toFixed(1)} frames @60Hz, ${(ok / 240 * 1000).toFixed(0)} ms)`);
}
