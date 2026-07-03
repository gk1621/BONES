export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export function distance2D(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return Math.hypot(dx, dy);
}

export function distance3D(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dy, dz);
}

export function vectorLength(v) {
  return Math.hypot(v.x ?? 0, v.y ?? 0, v.z ?? 0);
}

export function normalizeVector(v) {
  const len = vectorLength(v);
  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: (v.x ?? 0) / len, y: (v.y ?? 0) / len, z: (v.z ?? 0) / len };
}

export function angleBetween(a, b) {
  const na = normalizeVector(a);
  const nb = normalizeVector(b);
  const dot = clamp(na.x * nb.x + na.y * nb.y + na.z * nb.z, -1, 1);
  return Math.acos(dot);
}

export function midpoint(a, b) {
  return {
    x: ((a.x ?? 0) + (b.x ?? 0)) / 2,
    y: ((a.y ?? 0) + (b.y ?? 0)) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2
  };
}

export function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) {
    return outMin;
  }
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, t);
}

export function smoothDamp(current, target, smoothing, dt) {
  return lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

export function poseSimilarity(poseA, poseB) {
  if (!poseA || !poseB) {
    return 0;
  }

  const keys = Object.keys(poseB);
  if (!keys.length) {
    return 0;
  }

  let total = 0;
  let count = 0;
  keys.forEach((key) => {
    if (!poseA[key] || !poseB[key]) {
      return;
    }
    const d = distance3D(poseA[key], poseB[key]);
    total += clamp(1 - d * 2.5, 0, 1);
    count += 1;
  });

  return count ? total / count : 0;
}
