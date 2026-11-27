'use strict';
/* Flight model and mission state for the courier plane "Kestrel".
   A forgiving arcade model: throttle drives speed, pitch trades speed for
   height, bank turns the nose, and the ground is unforgiving. */

const PLANE = {
  maxSpeed: 118,        // m/s at full throttle, level
  stallSpeed: 26,       // below this the wing lets go
  rotateSpeed: 34,      // ground speed needed to lift off
  climbRate: 26,        // m/s of vertical speed at full pitch, healthy speed
  turnRate: 0.62,       // rad/s at full bank
  pitchRate: 0.85,      // rad/s of pitch input
  rollRate: 1.7,        // rad/s of roll input
  maxPitch: 0.62,
  maxRoll: 1.15,
  fuelBurn: 0.55,       // percent per second at full throttle
  gearHeight: 2.2,      // fuselage centre above the ground when parked
};

function newFlight() {
  const r = WORLD.runway;
  return {
    x: r.x, y: r.elevation + PLANE.gearHeight, z: r.zEnd - 80,
    heading: 0,              // radians, 0 = north (-z), grows clockwise
    pitch: 0, roll: 0,
    speed: 0, throttle: 0,
    vy: 0,
    onGround: true,
    fuel: 100,
    ringsHit: 0,
    nextRing: 0,
    score: 0,
    time: 0,
    finished: false,
    crashed: '',
    message: '',
    messageUntil: 0,
    camera: 'chase',
    paused: false,
  };
}

/* Advance the flight by dt seconds under the given control inputs.
   controls: { pitch: -1..1, roll: -1..1, throttleDelta: -1..1, brake: bool } */
function stepFlight(f, controls, dt) {
  if (f.finished || f.crashed) return;
  f.time += dt;

  // Throttle and fuel.
  f.throttle = clamp(f.throttle + controls.throttleDelta * dt * 0.55, 0, 1);
  if (f.fuel > 0) f.fuel = Math.max(0, f.fuel - PLANE.fuelBurn * f.throttle * dt);
  const power = f.fuel > 0 ? f.throttle : 0;

  // Attitude.
  f.pitch = clamp(f.pitch + controls.pitch * PLANE.pitchRate * dt, -PLANE.maxPitch, PLANE.maxPitch);
  f.roll = clamp(f.roll + controls.roll * PLANE.rollRate * dt, -PLANE.maxRoll, PLANE.maxRoll);
  if (Math.abs(controls.roll) < 0.05) f.roll = lerp(f.roll, 0, Math.min(1, dt * 1.4));
  if (Math.abs(controls.pitch) < 0.05) f.pitch = lerp(f.pitch, 0, Math.min(1, dt * 0.8));

  // Speed: engine pushes toward a throttle-set target, gravity trades off.
  const targetSpeed = 12 + power * (PLANE.maxSpeed - 12);
  f.speed += (targetSpeed - f.speed) * Math.min(1, dt * 0.45);
  f.speed -= Math.sin(f.pitch) * 14 * dt;              // climbing bleeds speed
  f.speed += Math.max(0, -Math.sin(f.pitch)) * 9 * dt; // diving gains it back
  if (controls.brake && f.onGround) f.speed = Math.max(0, f.speed - 22 * dt);
  f.speed = clamp(f.speed, 0, 150);

  // Heading follows bank; the runway keeps us straight on the ground.
  if (!f.onGround) {
    f.heading += Math.sin(f.roll) * PLANE.turnRate * dt * clamp(f.speed / 60, 0.35, 1.15);
  } else if (f.speed > 4) {
    f.heading += controls.roll * 0.22 * dt;            // gentle ground steering
  }
  f.heading = wrapAngle(f.heading);

  // Vertical motion.
  const lift = clamp((f.speed - PLANE.stallSpeed) / 30, 0, 1);
  let vy = Math.sin(f.pitch) * PLANE.climbRate * lift;
  if (f.speed < PLANE.stallSpeed && !f.onGround) vy -= (PLANE.stallSpeed - f.speed) * 0.55;
  f.vy = vy;

  // Position.
  const fx = Math.sin(f.heading);
  const fz = -Math.cos(f.heading);
  f.x += fx * f.speed * dt;
  f.z += fz * f.speed * dt;
  if (f.onGround) {
    if (f.speed >= PLANE.rotateSpeed && f.pitch > 0.06) {
      f.onGround = false;
      f.y += Math.max(1.5, vy * dt);
    } else {
      f.y = groundBelow(f.x, f.z) + PLANE.gearHeight;
    }
  } else {
    f.y += vy * dt;
  }

  // World edge: turn the courier back with a warning, never a hard wall.
  const distHome = Math.hypot(f.x, f.z);
  if (distHome > 9000) {
    f.message = 'Vesper Cay is behind you — turn back!';
    f.messageUntil = f.time + 3;
  }

  // Ground contact.
  const ground = groundBelow(f.x, f.z);
  if (!f.onGround && f.y <= ground + PLANE.gearHeight) {
    f.y = ground + PLANE.gearHeight;
    const gentle = f.vy > -9 && Math.abs(f.roll) < 0.42 && f.speed < 78;
    if (isOnRunway(f.x, f.z) && gentle) {
      f.onGround = true;
      f.pitch = 0; f.roll = 0;
      if (f.ringsHit === RINGS.length) finishFlight(f);
      else { f.message = 'Touchdown! Roll out, then take off again for the next ring.'; f.messageUntil = f.time + 4; }
    } else if (ground > 0.6 && gentle && f.speed < 55) {
      f.onGround = true;
      f.pitch = 0; f.roll = 0;
      f.message = 'Rough-field landing. The strip is at the island centre.';
      f.messageUntil = f.time + 4;
    } else {
      f.crashed = ground <= 0.6 ? 'Ditched in the sea.' : 'Struck the terrain.';
    }
    return;
  }

  // Ring scoring: pass within the hoop of the next ring in course order.
  if (!f.onGround && f.nextRing < RINGS.length) {
    const ring = RINGS[f.nextRing];
    const d = Math.hypot(f.x - ring.x, f.y - ring.y, f.z - ring.z);
    if (d < WORLD.ringRadius) {
      f.ringsHit += 1;
      f.nextRing += 1;
      const bonus = 100 + Math.round(f.speed);
      f.score += bonus;
      f.message = 'Ring ' + f.ringsHit + '/' + RINGS.length + ' — ' + ring.name + '  +' + bonus;
      f.messageUntil = f.time + 3.5;
      if (typeof onRingScored === 'function') onRingScored(f.ringsHit);
    }
  }
}

function finishFlight(f) {
  f.finished = true;
  const timeBonus = Math.max(0, Math.round(1200 - f.time * 2));
  const fuelBonus = Math.round(f.fuel * 4);
  f.score += timeBonus + fuelBonus;
  f.message = 'Delivery complete! Time bonus +' + timeBonus + ', fuel bonus +' + fuelBonus + '.';
  f.messageUntil = f.time + 9999;
  if (typeof onFlightFinished === 'function') onFlightFinished(f.score);
}

/* Where the nose points, as a unit vector. */
function forwardVector(f) {
  const cp = Math.cos(f.pitch);
  return {
    x: Math.sin(f.heading) * cp,
    y: Math.sin(f.pitch),
    z: -Math.cos(f.heading) * cp,
  };
}

/* Compass heading in degrees, 0 = north, for the HUD. */
function headingDegrees(f) {
  let deg = (f.heading * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  return deg;
}
