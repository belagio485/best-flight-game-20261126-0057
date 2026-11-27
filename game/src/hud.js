'use strict';
/* Cockpit instruments and mission readouts, drawn over the 3D view:
   airspeed and altitude tapes, a heading strip, an artificial horizon,
   throttle and fuel gauges, the ring-course tracker and messages. */

const HUD = {
  panel: 'rgba(10,22,38,0.62)',
  edge: 'rgba(160,205,240,0.55)',
  text: '#eaf4fc',
  dim: '#9fc2dd',
  amber: '#ffc440',
  green: '#6fe08a',
  red: '#ff6b5e',
  font: '600 15px system-ui, sans-serif',
  small: '500 12px system-ui, sans-serif',
  big: '700 30px system-ui, sans-serif',
};

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = HUD.panel;
  ctx.strokeStyle = HUD.edge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/* A vertical tape showing value with neighbouring ticks, like a real PFD. */
function drawTape(ctx, x, y, w, h, value, step, unit, label, dangerBelow) {
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  const centre = y + h / 2;
  const pxPerUnit = 1.6;
  ctx.font = HUD.small;
  ctx.textAlign = 'center';
  const first = Math.floor((value - h / 2 / pxPerUnit) / step) * step;
  for (let v = first; v < value + h / 2 / pxPerUnit + step; v += step) {
    if (v < 0) continue;
    const ty = centre - (v - value) * pxPerUnit;
    ctx.fillStyle = HUD.dim;
    ctx.fillRect(x + w - 12, ty - 0.5, 8, 1);
    ctx.fillText(String(Math.round(v)), x + w / 2 - 4, ty + 4);
  }
  ctx.restore();
  // Current value box in the middle.
  const danger = dangerBelow !== undefined && value < dangerBelow;
  ctx.fillStyle = danger ? '#5a1f1a' : '#12314f';
  ctx.strokeStyle = danger ? HUD.red : HUD.amber;
  ctx.beginPath();
  ctx.roundRect(x + 4, centre - 13, w - 8, 26, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = danger ? HUD.red : HUD.text;
  ctx.font = HUD.font;
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(value) + '', x + w / 2, centre + 5);
  ctx.fillStyle = HUD.dim;
  ctx.font = HUD.small;
  ctx.fillText(label + ' ' + unit, x + w / 2, y - 6);
}

/* Heading strip across the top with cardinal letters and a course bug. */
function drawCompass(ctx, w, f) {
  const cw = 460;
  const x = w / 2 - cw / 2;
  const y = 12;
  panel(ctx, x, y, cw, 34);
  const hdg = headingDegrees(f);
  const pxPerDeg = 3.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, cw - 6, 28);
  ctx.clip();
  ctx.font = HUD.small;
  ctx.textAlign = 'center';
  const letters = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  const base = Math.round(hdg / 5) * 5;
  for (let k = -36; k <= 36; k++) {
    const deg = ((base + k * 5) % 360 + 360) % 360;
    const rel = ((deg - hdg + 540) % 360) - 180;
    const tx = w / 2 + rel * pxPerDeg;
    if (deg % 45 === 0) {
      ctx.fillStyle = HUD.text;
      ctx.fillText(letters[deg], tx, y + 22);
    } else if (deg % 30 === 0) {
      ctx.fillStyle = HUD.dim;
      ctx.fillText(String(deg / 10), tx, y + 22);
    } else {
      ctx.fillStyle = HUD.dim;
      ctx.fillRect(tx, y + 24, 1, 5);
    }
  }
  // Bug marking the bearing to the next ring.
  if (f.nextRing < RINGS.length) {
    const ring = RINGS[f.nextRing];
    const bearing = Math.atan2(ring.x - f.x, -(ring.z - f.z)) * 180 / Math.PI;
    let rel = ((bearing - hdg + 540) % 360) - 180;
    const bx = clamp(w / 2 + rel * pxPerDeg, x + 10, x + cw - 10);
    ctx.fillStyle = HUD.amber;
    ctx.beginPath();
    ctx.moveTo(bx, y + 30);
    ctx.lineTo(bx - 6, y + 38);
    ctx.lineTo(bx + 6, y + 38);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = HUD.amber;
  ctx.beginPath();
  ctx.moveTo(w / 2, y + 34);
  ctx.lineTo(w / 2 - 7, y + 44);
  ctx.lineTo(w / 2 + 7, y + 44);
  ctx.closePath();
  ctx.fill();
  ctx.font = HUD.font;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', w / 2, y + 60);
}

/* Artificial horizon: sky/ground split that pitches and rolls with the plane. */
function drawHorizon(ctx, cx, cy, r, f) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-f.roll);
  const pitchPx = f.pitch * r * 1.5;
  ctx.fillStyle = '#5d9bd6';
  ctx.fillRect(-r * 2, -r * 2 + pitchPx, r * 4, r * 2);
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(-r * 2, pitchPx, r * 4, r * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 2, pitchPx);
  ctx.lineTo(r * 2, pitchPx);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  for (const off of [-30, -15, 15, 30]) {
    const yy = pitchPx + off * r / 45;
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, yy);
    ctx.lineTo(r * 0.35, yy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = HUD.edge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol.
  ctx.strokeStyle = HUD.amber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy);
  ctx.lineTo(cx - r * 0.18, cy);
  ctx.moveTo(cx + r * 0.18, cy);
  ctx.lineTo(cx + r * 0.55, cy);
  ctx.stroke();
  ctx.fillStyle = HUD.amber;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawGauges(ctx, x, y, f) {
  panel(ctx, x, y, 190, 96);
  ctx.font = HUD.small;
  ctx.textAlign = 'left';
  ctx.fillStyle = HUD.dim;
  ctx.fillText('THROTTLE', x + 12, y + 22);
  ctx.fillText('FUEL', x + 12, y + 52);
  ctx.fillText('VERT SPEED', x + 12, y + 82);
  // Throttle bar.
  ctx.fillStyle = '#1c3a58';
  ctx.fillRect(x + 78, y + 12, 100, 12);
  ctx.fillStyle = f.fuel > 0 ? HUD.green : HUD.red;
  ctx.fillRect(x + 78, y + 12, 100 * f.throttle, 12);
  // Fuel bar.
  ctx.fillStyle = '#1c3a58';
  ctx.fillRect(x + 78, y + 42, 100, 12);
  ctx.fillStyle = f.fuel > 22 ? HUD.green : HUD.red;
  ctx.fillRect(x + 78, y + 42, 100 * f.fuel / 100, 12);
  ctx.fillStyle = HUD.text;
  ctx.font = HUD.font;
  ctx.fillText(Math.round(f.fuel) + '%', x + 128, y + 52);
  // Vertical speed readout.
  const vs = Math.round(f.vy * 10) / 10;
  ctx.fillStyle = vs < -8 ? HUD.red : HUD.text;
  ctx.fillText((vs > 0 ? '+' : '') + vs.toFixed(1) + ' m/s', x + 100, y + 84);
}

function drawMission(ctx, x, y, f) {
  panel(ctx, x, y, 272, 118);
  ctx.textAlign = 'left';
  ctx.font = HUD.font;
  ctx.fillStyle = HUD.text;
  ctx.fillText('RING RUN — VESPER CAY', x + 12, y + 24);
  ctx.font = HUD.small;
  if (f.nextRing < RINGS.length) {
    const ring = RINGS[f.nextRing];
    const dist = Math.round(Math.hypot(ring.x - f.x, ring.y - f.y, ring.z - f.z));
    ctx.fillStyle = HUD.amber;
    ctx.fillText('Next: ' + ring.name + '  ' + dist + ' m', x + 12, y + 44);
  } else {
    ctx.fillStyle = HUD.green;
    ctx.fillText('All rings threaded — land on the strip!', x + 12, y + 44);
  }
  ctx.fillStyle = HUD.dim;
  ctx.fillText('Rings  ' + f.ringsHit + ' / ' + RINGS.length, x + 12, y + 64);
  ctx.fillText('Score  ' + f.score, x + 12, y + 82);
  ctx.fillText('Time   ' + formatTime(f.time), x + 12, y + 100);
  // Ring pips.
  for (let i = 0; i < RINGS.length; i++) {
    ctx.fillStyle = i < f.ringsHit ? HUD.green : i === f.nextRing ? HUD.amber : '#33506e';
    ctx.beginPath();
    ctx.arc(x + 130 + i * 16, y + 96, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* A screen-space arrow pointing toward the next ring when it is off view. */
function drawRingGuide(ctx, w, h, f, cam) {
  if (f.nextRing >= RINGS.length || f.onGround) return;
  const ring = RINGS[f.nextRing];
  const p = project(cam, ring.x, ring.y, ring.z);
  const cx = w / 2;
  const cy = h / 2;
  let tx;
  let ty;
  if (p && p.x > 40 && p.x < w - 40 && p.y > 40 && p.y < h - 40) {
    // On screen: bracket the ring itself.
    ctx.strokeStyle = HUD.amber;
    ctx.lineWidth = 2;
    const r = 26;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(p.x + sx * r, p.y + sy * r - sy * 10);
      ctx.lineTo(p.x + sx * r, p.y + sy * r);
      ctx.lineTo(p.x + sx * r - sx * 10, p.y + sy * r);
      ctx.stroke();
    }
    return;
  }
  if (p) { tx = p.x; ty = p.y; }
  else {
    const rel = angleDelta(f.heading, Math.atan2(ring.x - f.x, -(ring.z - f.z)));
    tx = cx + Math.sin(rel) * w;
    ty = cy - clamp((ring.y - f.y) / 300, -1, 1) * h * 0.4;
  }
  const ang = Math.atan2(ty - cy, tx - cx);
  const ax = cx + Math.cos(ang) * (w * 0.34);
  const ay = cy + Math.sin(ang) * (h * 0.3);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.fillStyle = HUD.amber;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx, f, w, h, cam) {
  drawCompass(ctx, w, f);
  drawTape(ctx, 18, h / 2 - 110, 86, 220, f.speed * 1.944, 10, 'kt', 'AIRSPEED', PLANE.stallSpeed * 1.944);
  const agl = Math.max(0, f.y - groundBelow(f.x, f.z));
  drawTape(ctx, w - 104, h / 2 - 110, 86, 220, f.y * 3.281, 100, 'ft', 'ALTITUDE');
  ctx.font = HUD.small;
  ctx.textAlign = 'center';
  ctx.fillStyle = agl < 60 && !f.onGround ? HUD.red : HUD.dim;
  ctx.fillText('AGL ' + Math.round(agl) + ' m', w - 61, h / 2 + 132);
  drawHorizon(ctx, w / 2, h - 92, 58, f);
  drawGauges(ctx, 18, h - 118, f);
  drawMission(ctx, w - 288, 16, f);
  drawRingGuide(ctx, w, h, f, cam);

  if (f.message && f.time < f.messageUntil) {
    ctx.font = HUD.font;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(f.message).width + 36;
    panel(ctx, w / 2 - tw / 2, h * 0.24, tw, 36);
    ctx.fillStyle = HUD.text;
    ctx.fillText(f.message, w / 2, h * 0.24 + 24);
  }
  if (!f.onGround && f.speed < PLANE.stallSpeed && !f.crashed) {
    ctx.font = HUD.big;
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD.red;
    ctx.fillText('STALL', w / 2, h * 0.36);
  }
}
