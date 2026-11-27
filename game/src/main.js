'use strict';
/* Sky Courier: Ring Run — game loop, input, and screens.
   You are the island courier of Vesper Cay: take off from the strip,
   thread eight glowing rings over coast and ridge, then land back home
   before the fuel runs dry. Keyboard and mouse, fully offline. */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

let flight = newFlight();
let screen = 'title';        // title | flying | crashed | finished
let lastTs = 0;
let crashPlayed = false;

const keys = {};
let mouseSteer = null;       // { x, y } in canvas pixels while held

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const AUTOTEST = params.get('autotest');

function readControls() {
  const c = { pitch: 0, roll: 0, throttleDelta: 0, brake: false };
  if (keys.ArrowUp || keys.KeyW) c.pitch += 1;
  if (keys.ArrowDown || keys.KeyS) c.pitch -= 1;
  if (keys.ArrowLeft || keys.KeyA) c.roll -= 1;
  if (keys.ArrowRight || keys.KeyD) c.roll += 1;
  if (keys.ShiftLeft || keys.ShiftRight || keys.Equal) c.throttleDelta += 1;
  if (keys.ControlLeft || keys.ControlRight || keys.Minus) c.throttleDelta -= 1;
  if (keys.Space) c.brake = true;
  if (mouseSteer) {
    c.roll += clamp((mouseSteer.x - W / 2) / (W / 4), -1, 1);
    c.pitch += clamp((H / 2 - mouseSteer.y) / (H / 4), -1, 1);
  }
  c.pitch = clamp(c.pitch, -1, 1);
  c.roll = clamp(c.roll, -1, 1);
  return c;
}

function resetFlight() {
  flight = newFlight();
  screen = 'flying';
  crashPlayed = false;
}

function drawTitle() {
  // A posed beauty shot behind the title: airborne over the west coast.
  const demo = newFlight();
  demo.x = -900; demo.y = 320; demo.z = -1400;
  demo.heading = 0.5; demo.pitch = 0.05; demo.roll = 0.3;
  demo.speed = 62; demo.throttle = 0.7; demo.onGround = false; demo.time = 8;
  demo.nextRing = 1; demo.ringsHit = 1; demo.score = 160;
  const cam = renderScene(ctx, demo, W, H);
  drawHud(ctx, demo, W, H, cam);
  ctx.fillStyle = 'rgba(8,18,32,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffc440';
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.fillText('SKY COURIER', W / 2, 210);
  ctx.fillStyle = '#eaf4fc';
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText('R I N G   R U N', W / 2, 258);
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillText('Deliver the island mail: thread all 8 rings over Vesper Cay,', W / 2, 310);
  ctx.fillText('then land back on the strip before the tank runs dry.', W / 2, 338);
  ctx.font = '500 16px system-ui, sans-serif';
  ctx.fillStyle = '#cfe4f2';
  const lines = [
    'Shift / Ctrl  throttle up / down        W A S D or arrows  pitch & bank',
    'Hold mouse    steer toward the pointer   Space  wheel brake',
    'C  chase / cockpit view                  P  pause      R  restart      M  mute',
    'Lift off past 34 m/s, mind the stall, and land gently on the runway.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 410 + i * 30));
  ctx.fillStyle = '#6fe08a';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText('Press ENTER to start your run', W / 2, 580);
}

function drawEndScreen(title, colour, lines) {
  const cam = renderScene(ctx, flight, W, H);
  drawHud(ctx, flight, W, H, cam);
  ctx.fillStyle = 'rgba(8,18,32,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = colour;
  ctx.font = '700 52px system-ui, sans-serif';
  ctx.fillText(title, W / 2, 240);
  ctx.fillStyle = '#eaf4fc';
  ctx.font = '500 20px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 300 + i * 34));
  ctx.fillStyle = '#6fe08a';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText('Press R to fly again', W / 2, 300 + lines.length * 34 + 40);
}

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;

  if (SHOT) { drawShot(SHOT); return; }
  if (screen === 'title') { drawTitle(); return; }

  if (screen === 'flying' && !flight.paused) {
    stepFlight(flight, AUTOTEST ? autopilot() : readControls(), dt);
    updateEngineSound(flight);
    if (flight.crashed && !crashPlayed) { crashSound(); crashPlayed = true; screen = 'crashed'; }
    if (flight.finished) screen = 'finished';
  }

  const cam = renderScene(ctx, flight, W, H);
  drawHud(ctx, flight, W, H, cam);
  if (flight.paused && screen === 'flying') {
    ctx.fillStyle = 'rgba(8,18,32,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eaf4fc';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
  }
  if (screen === 'crashed') {
    drawEndScreen('CRASHED', '#ff6b5e', [
      flight.crashed,
      'Rings threaded: ' + flight.ringsHit + ' / ' + RINGS.length,
      'Score: ' + flight.score + '   Time: ' + formatTime(flight.time),
    ]);
  } else if (screen === 'finished') {
    drawEndScreen('DELIVERY COMPLETE', '#6fe08a', [
      'All ' + RINGS.length + ' rings threaded and home safe.',
      'Final score: ' + flight.score,
      'Time: ' + formatTime(flight.time) + '   Fuel left: ' + Math.round(flight.fuel) + '%',
    ]);
  }
  if (AUTOTEST) reportAutotest();
}

/* A simple autopilot used only by ?autotest=1 to prove the game plays:
   throttle up, climb, steer ring to ring, then descend to the strip. */
function autopilot() {
  const f = flight;
  const c = { pitch: 0, roll: 0, throttleDelta: 0, brake: false };
  c.throttleDelta = f.throttle < 0.62 ? 1 : 0;
  let tx;
  let ty;
  let tz;
  if (f.nextRing < RINGS.length) {
    const r = RINGS[f.nextRing];
    tx = r.x; ty = r.y; tz = r.z;
  } else {
    tx = WORLD.runway.x; ty = WORLD.runway.elevation + 40; tz = 0;
  }
  const want = Math.atan2(tx - f.x, -(tz - f.z));
  const rel = angleDelta(f.heading, want);
  c.roll = clamp(rel * 1.6, -1, 1);
  if (f.onGround) {
    c.pitch = f.speed > PLANE.rotateSpeed + 6 ? 0.7 : 0;
  } else {
    // Stay above the ground ahead, but aim straight at the ring when close.
    const distTarget = Math.hypot(tx - f.x, tz - f.z);
    const aheadX = f.x + Math.sin(f.heading) * 420;
    const aheadZ = f.z - Math.cos(f.heading) * 420;
    const safeY = distTarget < 700
      ? ty
      : Math.max(ty, terrainHeight(aheadX, aheadZ) + 110, groundBelow(f.x, f.z) + 80);
    const dy = safeY - f.y;
    c.pitch = clamp(dy / 120, -0.8, 0.8);
    if (f.speed < PLANE.stallSpeed + 8) c.pitch = -0.4;
    // On final approach, ease the throttle so the touchdown is gentle.
    if (f.nextRing >= RINGS.length) {
      const distStrip = Math.hypot(f.x - WORLD.runway.x, f.z);
      c.throttleDelta = distStrip < 900 ? -0.6 : 0;
      if (f.y < WORLD.runway.elevation + 70) c.pitch = clamp(c.pitch, -0.25, 0.3);
    }
  }
  return c;
}

let autotestReported = false;
function reportAutotest() {
  if (autotestReported) return;
  if (flight.time > 150 || flight.crashed || flight.finished) {
    autotestReported = true;
    const verdict = {
      rings: flight.ringsHit,
      crashed: flight.crashed,
      finished: flight.finished,
      score: flight.score,
      time: Math.round(flight.time),
      x: Math.round(flight.x), y: Math.round(flight.y), z: Math.round(flight.z),
    };
    document.title = 'AUTOTEST ' + JSON.stringify(verdict);
    console.log('AUTOTEST ' + JSON.stringify(verdict));
  }
}

/* Screenshot poses: ?shot=1..4 renders one composed frame of the real game
   (runway departure, coast chase, ridge bank, final approach). */
function drawShot(n) {
  const f = newFlight();
  f.onGround = false;
  f.throttle = 0.78;
  if (n === '1') {
    // Just airborne off the strip, runway below ahead, departure gate beyond.
    f.x = 0; f.y = 42; f.z = -160; f.heading = 0; f.pitch = 0.09; f.roll = 0;
    f.speed = 44; f.time = 12; f.nextRing = 0;
  } else if (n === '2') {
    // Chase view over the western sea, coast and second ring ahead.
    f.x = -2650; f.y = 265; f.z = -2950; f.heading = 1.99; f.pitch = 0.02; f.roll = 0.18;
    f.speed = 66; f.time = 40; f.nextRing = 1; f.ringsHit = 1; f.score = 175;
  } else if (n === '3') {
    // Banking over the high spine toward the summit ring.
    f.x = -1850; f.y = 500; f.z = -250; f.heading = 0.9; f.pitch = 0.1; f.roll = 0.62;
    f.speed = 72; f.time = 75; f.nextRing = 3; f.ringsHit = 3; f.score = 540;
  } else {
    // Final approach from the south: strip ahead, all rings threaded.
    f.x = 30; f.y = 105; f.z = 1450; f.heading = 0.02; f.pitch = -0.07; f.roll = 0.04;
    f.speed = 48; f.time = 160; f.nextRing = RINGS.length; f.ringsHit = RINGS.length; f.score = 1180;
    f.fuel = 34;
  }
  f.vy = Math.sin(f.pitch) * 20;
  const cam = renderScene(ctx, f, W, H);
  drawHud(ctx, f, W, H, cam);
  document.title = 'SHOT ' + n + ' READY';
}

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  startAudio();
  if (e.code === 'Enter' && screen === 'title') resetFlight();
  if (e.code === 'KeyR' && screen !== 'title') resetFlight();
  if (e.code === 'KeyP' && screen === 'flying') flight.paused = !flight.paused;
  if (e.code === 'KeyC') flight.camera = flight.camera === 'chase' ? 'cockpit' : 'chase';
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => {
  startAudio();
  const rect = canvas.getBoundingClientRect();
  mouseSteer = { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
  if (screen === 'title') resetFlight();
});
canvas.addEventListener('pointermove', (e) => {
  if (!mouseSteer) return;
  const rect = canvas.getBoundingClientRect();
  mouseSteer = { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
});
window.addEventListener('pointerup', () => { mouseSteer = null; });

/* Exposed for play-testing: lets a test driver read and pose the flight. */
window.__skycourier = {
  get flight() { return flight; },
  get screen() { return screen; },
  start: resetFlight,
  RINGS,
  WORLD,
};

if (AUTOTEST) resetFlight();
requestAnimationFrame(frame);
