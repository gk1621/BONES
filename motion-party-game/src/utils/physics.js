import { clamp, vectorLength } from "./math.js";

export function createBody(position, velocity = { x: 0, y: 0, z: 0 }, radius = 0.5) {
  return {
    position: { ...position },
    velocity: { ...velocity },
    radius
  };
}

export function integrate(body, dt, gravity = -9.8) {
  body.velocity.y += gravity * dt;
  body.position.x += body.velocity.x * dt;
  body.position.y += body.velocity.y * dt;
  body.position.z += body.velocity.z * dt;
  return body;
}

export function applyFriction(body, friction = 0.985) {
  body.velocity.x *= friction;
  body.velocity.z *= friction;
  return body;
}

export function sphereSphereCollision(a, b) {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const dz = a.position.z - b.position.z;
  const distance = Math.hypot(dx, dy, dz);
  return distance <= a.radius + b.radius;
}

export function aabbCollision(a, b) {
  return (
    Math.abs(a.position.x - b.position.x) * 2 < a.size.x + b.size.x &&
    Math.abs(a.position.y - b.position.y) * 2 < a.size.y + b.size.y &&
    Math.abs(a.position.z - b.position.z) * 2 < a.size.z + b.size.z
  );
}

export function bounceVelocity(velocity, normal, restitution = 0.72) {
  const dot = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  return {
    x: velocity.x - (1 + restitution) * dot * normal.x,
    y: velocity.y - (1 + restitution) * dot * normal.y,
    z: velocity.z - (1 + restitution) * dot * normal.z
  };
}

export function clampSpeed(velocity, min, max) {
  const speed = vectorLength(velocity);
  if (speed === 0) {
    return velocity;
  }
  const target = clamp(speed, min, max);
  const scale = target / speed;
  return {
    x: velocity.x * scale,
    y: velocity.y * scale,
    z: velocity.z * scale
  };
}
