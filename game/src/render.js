'use strict';
/* Chase-view renderer: projects the heightfield island, the runway, the
   ring course and the scenery onto a 2D canvas with a painter's sort.
   The camera sits behind and above the Kestrel, looking where it flies. */

const VIEW = {
  fov: 1.15,          // focal length factor relative to canvas height
  near: 4,            // metres; closer geometry is clipped
  far: 6500,          // metres of terrain drawn
  cell: 55,           // terrain cell size near the camera, metres
  fogStart: 2700,
  fogEnd: 6500,
  skyTop: '#4d84c4',
  skyHorizon: '#cfe4f2',
  fogColour: '#a9c9e2',
};

/* Build the camera basis from the flight state. */
function makeCamera(f, w, h) {
  const back = f.camera === 'cockpit' ? 0 : 26;
  const up = f.camera === 'cockpit' ? 3.4 : 8.5;
  const fx = Math.sin(f.heading);
  const fz = -Math.cos(f.heading);
  const camX = f.x - fx * back;
  const camZ = f.z - fz * back;
  let camY = f.y + up - Math.sin(f.pitch) * back * 0.55;
  const floorY = groundBelow(camX, camZ) + 3;
  if (camY < floorY) camY = floorY;
  // Look direction: mostly the flight heading, eased by pitch and bank.
  const lookPitch = f.pitch * 0.55 - 0.03;
  const dir = {
    x: fx * Math.cos(lookPitch),
    y: Math.sin(lookPitch),
    z: fz * Math.cos(lookPitch),
  };
  // Right vector, then true up, with a touch of roll for feel.
  const right0 = { x: -dir.z, y: 0, z: dir.x };
  const rl = Math.hypot(right0.x, right0.z) || 1;
  right0.x /= rl; right0.z /= rl;
  const up0 = {
    x: right0.y * dir.z - right0.z * dir.y,
    y: right0.z * dir.x - right0.x * dir.z,
    z: right0.x * dir.y - right0.y * dir.x,
  };
  const rollView = f.roll * 0.35;
  const cr = Math.cos(rollView);
  const sr = Math.sin(rollView);
  const right = {
    x: right0.x * cr + up0.x * sr,
    y: right0.y * cr + up0.y * sr,
    z: right0.z * cr + up0.z * sr,
  };
  const upv = {
    x: up0.x * cr - right0.x * sr,
    y: up0.y * cr - right0.y * sr,
    z: up0.z * cr - right0.z * sr,
  };
  return {
    x: camX, y: camY, z: camZ, dir, right, up: upv,
    focal: h * VIEW.fov, cx: w / 2, cy: h / 2,
  };
}

/* Project a world point; returns null when behind the camera. */
function project(cam, x, y, z) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const depth = dx * cam.dir.x + dy * cam.dir.y + dz * cam.dir.z;
  if (depth < VIEW.near) return null;
  const sx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const sy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return {
    x: cam.cx + (sx / depth) * cam.focal,
    y: cam.cy - (sy / depth) * cam.focal,
    depth,
  };
}

function fogMix(colour, depth) {
  const t = clamp((depth - VIEW.fogStart) / (VIEW.fogEnd - VIEW.fogStart), 0, 1);
  if (t <= 0) return colour;
  const a = parseInt(colour.slice(1), 16);
  const b = parseInt(VIEW.fogColour.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

function drawSky(ctx, w, h, cam) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, VIEW.skyTop);
  grad.addColorStop(0.55, '#8fb8dd');
  grad.addColorStop(0.78, VIEW.skyHorizon);
  grad.addColorStop(1, '#b9d2e4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Sun: a soft disc toward the south-east sky.
  const sun = project(cam, cam.x + 4200, cam.y + 2600, cam.z + 5200);
  if (sun) {
    const rg = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
    rg.addColorStop(0, 'rgba(255,250,220,0.95)');
    rg.addColorStop(0.25, 'rgba(255,240,190,0.55)');
    rg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(sun.x - 130, sun.y - 130, 260, 260);
  }
}

/* One terrain quad between four heightfield corners. */
function drawQuad(ctx, cam, pts, colour) {
  const p0 = project(cam, pts[0][0], pts[0][1], pts[0][2]);
  const p1 = project(cam, pts[1][0], pts[1][1], pts[1][2]);
  const p2 = project(cam, pts[2][0], pts[2][1], pts[2][2]);
  const p3 = project(cam, pts[3][0], pts[3][1], pts[3][2]);
  if (!p0 || !p1 || !p2 || !p3) return;
  const depth = (p0.depth + p2.depth) / 2;
  ctx.fillStyle = fogMix(colour, depth);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fill();
}

function drawTerrain(ctx, cam) {
  const cell = VIEW.cell;
  const reach = Math.ceil(VIEW.far / cell);
  const cx = Math.round(cam.x / cell);
  const cz = Math.round(cam.z / cell);
  // Collect visible cells, then paint far-to-near.
  const cells = [];
  for (let iz = -reach; iz <= reach; iz++) {
    for (let ix = -reach; ix <= reach; ix++) {
      const gx = (cx + ix) * cell;
      const gz = (cz + iz) * cell;
      const dx = gx - cam.x;
      const dz = gz - cam.z;
      const dist = Math.hypot(dx, dz);
      if (dist > VIEW.far) continue;
      // Skip cells behind the camera cheaply.
      if (dx * cam.dir.x + dz * cam.dir.z < -cell * 2) continue;
      cells.push({ gx, gz, dist });
    }
  }
  cells.sort((a, b) => b.dist - a.dist);
  for (const c of cells) {
    const x0 = c.gx - cell / 2;
    const x1 = c.gx + cell / 2;
    const z0 = c.gz - cell / 2;
    const z1 = c.gz + cell / 2;
    const h00 = terrainHeight(x0, z0);
    const h10 = terrainHeight(x1, z0);
    const h11 = terrainHeight(x1, z1);
    const h01 = terrainHeight(x0, z1);
    const mid = (h00 + h10 + h11 + h01) / 4;
    const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00), Math.abs(h11 - h10), Math.abs(h11 - h01)) / cell;
    const sea = mid < 0.6;
    const y = (v) => (sea ? 0 : v);
    drawQuad(ctx, cam, [
      [x0, y(h00), z0], [x1, y(h10), z0], [x1, y(h11), z1], [x0, y(h01), z1],
    ], terrainColour(mid, slope));
  }
}

function drawRunway(ctx, cam) {
  const r = WORLD.runway;
  const y = r.elevation + 0.15;
  drawQuad(ctx, cam, [
    [r.x - r.halfWidth, y, r.zStart], [r.x + r.halfWidth, y, r.zStart],
    [r.x + r.halfWidth, y, r.zEnd], [r.x - r.halfWidth, y, r.zEnd],
  ], '#3c4147');
  // Centreline dashes and threshold bars.
  for (let z = r.zStart + 40; z < r.zEnd - 30; z += 60) {
    drawQuad(ctx, cam, [
      [r.x - 1.4, y + 0.05, z], [r.x + 1.4, y + 0.05, z],
      [r.x + 1.4, y + 0.05, z + 26], [r.x - 1.4, y + 0.05, z + 26],
    ], '#e8ecf0');
  }
  for (const endZ of [r.zStart + 6, r.zEnd - 22]) {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const bx = r.x + i * 5.4;
      drawQuad(ctx, cam, [
        [bx - 1.6, y + 0.05, endZ], [bx + 1.6, y + 0.05, endZ],
        [bx + 1.6, y + 0.05, endZ + 16], [bx - 1.6, y + 0.05, endZ + 16],
      ], '#e8ecf0');
    }
  }
  // Edge lights: small lit dots down both sides.
  ctx.fillStyle = '#ffd873';
  for (let z = r.zStart; z <= r.zEnd; z += 65) {
    for (const side of [-1, 1]) {
      const p = project(cam, r.x + side * (r.halfWidth + 3), y + 1, z);
      if (p && p.depth < 2600) {
        const s = clamp(320 / p.depth, 1, 5);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
  }
}

function drawRing(ctx, cam, ring, isNext, done, time) {
  const seg = 28;
  const pts = [];
  // Rings face the course direction: keep them upright, facing north-south.
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const px = ring.x + Math.cos(a) * WORLD.ringRadius;
    const py = ring.y + Math.sin(a) * WORLD.ringRadius;
    pts.push(project(cam, px, py, ring.z));
  }
  if (pts.some((p) => !p)) return;
  const depth = pts[0].depth;
  if (depth > 5200) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  const pulse = 0.75 + 0.25 * Math.sin(time * 3.2);
  if (done) {
    ctx.strokeStyle = 'rgba(120,220,140,0.35)';
    ctx.lineWidth = clamp(900 / depth, 1.5, 7);
  } else if (isNext) {
    ctx.strokeStyle = 'rgba(255,196,64,' + pulse.toFixed(2) + ')';
    ctx.lineWidth = clamp(1500 / depth, 2.5, 13);
  } else {
    ctx.strokeStyle = 'rgba(110,205,255,0.5)';
    ctx.lineWidth = clamp(1000 / depth, 1.5, 8);
  }
  ctx.stroke();
  if (isNext && depth < 2600) {
    ctx.strokeStyle = 'rgba(255,240,200,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawScenery(ctx, cam, time) {
  // Clouds drift slowly east; drawn as soft billboard ellipses.
  for (const c of SCENERY.clouds) {
    const x = c.x + ((time * c.drift) % 12000) - 6000;
    const p = project(cam, x, c.y, c.z);
    if (!p || p.depth > 7000 || p.depth < 380) continue;
    const wpx = (c.s / p.depth) * cam.focal;
    if (wpx < 6) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, wpx * 0.62, wpx * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - wpx * 0.5, p.y + wpx * 0.07, wpx * 0.42, wpx * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + wpx * 0.52, p.y + wpx * 0.05, wpx * 0.4, wpx * 0.2, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - wpx * 0.18, p.y - wpx * 0.16, wpx * 0.38, wpx * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + wpx * 0.22, p.y - wpx * 0.12, wpx * 0.34, wpx * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Trees: little dark-green cones, only the nearer ones.
  ctx.fillStyle = '#2f5d2a';
  for (const t of SCENERY.trees) {
    const dx = t.x - cam.x;
    const dz = t.z - cam.z;
    if (dx * dx + dz * dz > 1500 * 1500) continue;
    const base = project(cam, t.x, t.y, t.z);
    const top = project(cam, t.x, t.y + t.s, t.z);
    if (!base || !top) continue;
    const halfW = clamp((t.s * 0.42 / base.depth) * cam.focal, 0.6, 26);
    ctx.beginPath();
    ctx.moveTo(base.x - halfW, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.lineTo(base.x + halfW, base.y);
    ctx.closePath();
    ctx.fill();
  }
  // Village houses: warm blocks with darker roofs near the harbour.
  for (const hs of SCENERY.houses) {
    const dx = hs.x - cam.x;
    const dz = hs.z - cam.z;
    if (dx * dx + dz * dz > 2200 * 2200) continue;
    const s = hs.s;
    const cs = Math.cos(hs.rot);
    const sn = Math.sin(hs.rot);
    const corner = (lx, lz, ly) => [hs.x + lx * cs - lz * sn, hs.y + ly, hs.z + lx * sn + lz * cs];
    drawQuad(ctx, cam, [corner(-s, -s, 0), corner(s, -s, 0), corner(s, -s, s * 0.8), corner(-s, -s, s * 0.8)], '#cbb59a');
    drawQuad(ctx, cam, [corner(-s, s, 0), corner(s, s, 0), corner(s, s, s * 0.8), corner(-s, s, s * 0.8)], '#bfa586');
    drawQuad(ctx, cam, [corner(-s, -s, s * 0.8), corner(s, -s, s * 0.8), corner(s, s, s * 0.8), corner(-s, s, s * 0.8)], '#8a4f3a');
  }
}

/* The Kestrel itself, seen from behind: fuselage, wings, tail, prop disc. */
function drawPlane(ctx, f, w, h, time) {
  if (f.camera === 'cockpit') return;
  const cx = w / 2;
  const cy = h * 0.66 + Math.sin(f.pitch) * -26;
  const bank = f.roll;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.85);
  const s = 1.35;
  // Wings.
  ctx.fillStyle = '#c8402e';
  ctx.beginPath();
  ctx.moveTo(-118 * s, 6 * s);
  ctx.lineTo(-16 * s, -4 * s);
  ctx.lineTo(16 * s, -4 * s);
  ctx.lineTo(118 * s, 6 * s);
  ctx.lineTo(112 * s, 14 * s);
  ctx.lineTo(18 * s, 8 * s);
  ctx.lineTo(-18 * s, 8 * s);
  ctx.lineTo(-112 * s, 14 * s);
  ctx.closePath();
  ctx.fill();
  // Fuselage.
  ctx.fillStyle = '#e8e4da';
  ctx.beginPath();
  ctx.ellipse(0, 2 * s, 15 * s, 34 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8402e';
  ctx.beginPath();
  ctx.ellipse(0, -22 * s, 11 * s, 13 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Canopy glass.
  ctx.fillStyle = '#7fc4e8';
  ctx.beginPath();
  ctx.ellipse(0, -8 * s, 9 * s, 15 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#c8402e';
  ctx.beginPath();
  ctx.moveTo(-40 * s, 30 * s);
  ctx.lineTo(40 * s, 30 * s);
  ctx.lineTo(34 * s, 38 * s);
  ctx.lineTo(-34 * s, 38 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-3 * s, 18 * s);
  ctx.lineTo(3 * s, 18 * s);
  ctx.lineTo(2 * s, 40 * s);
  ctx.lineTo(-2 * s, 40 * s);
  ctx.closePath();
  ctx.fill();
  // Propeller disc, blurred by throttle.
  if (f.throttle > 0.03 && f.fuel > 0) {
    ctx.fillStyle = 'rgba(40,44,52,' + (0.10 + f.throttle * 0.16).toFixed(2) + ')';
    ctx.beginPath();
    ctx.ellipse(0, -34 * s, 30 * s, 7 * s, Math.sin(time * 40) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Navigation lights: red left, green right, white tail strobe.
  ctx.fillStyle = '#ff4b4b';
  ctx.beginPath(); ctx.arc(-116 * s, 9 * s, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#51e07a';
  ctx.beginPath(); ctx.arc(116 * s, 9 * s, 3.2, 0, Math.PI * 2); ctx.fill();
  if (Math.sin(time * 6) > 0.86) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 39 * s, 3.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function renderScene(ctx, f, w, h) {
  const cam = makeCamera(f, w, h);
  drawSky(ctx, w, h, cam);
  drawTerrain(ctx, cam);
  drawRunway(ctx, cam);
  drawScenery(ctx, cam, f.time);
  for (let i = RINGS.length - 1; i >= 0; i--) {
    drawRing(ctx, cam, RINGS[i], i === f.nextRing, i < f.nextRing, f.time);
  }
  drawPlane(ctx, f, w, h, f.time);
  return cam;
}
