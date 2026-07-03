import { angleBetween, midpoint, poseSimilarity as poseSimilarityFn } from "./utils/math.js";

export default class GestureRecognizer {
  constructor(eventBus, config) {
    this.eventBus = eventBus;
    this.config = config;
    this.previousByPlayer = new Map();
    this.baselines = new Map();
    this.cooldowns = new Map();
    this.targetPose = null;
  }

  process(trackingFrame, players = [], calibrationData = {}) {
    if (!trackingFrame) {
      return [];
    }

    const now = trackingFrame.timestamp ?? performance.now();
    const gestures = [];

    for (const trackedPlayer of trackingFrame.players ?? []) {
      const playerId = trackedPlayer.playerId;
      const joints = trackedPlayer.joints ?? {};
      const previous = this.previousByPlayer.get(playerId);
      const dt = previous ? Math.max((now - previous.timestamp) / 1000, 0.001) : 0.05;
      const calibration = calibrationData[playerId] ?? {};

      if (!this.baselines.has(playerId) && joints.leftHip && joints.rightHip) {
        const hips = midpoint(joints.leftHip, joints.rightHip);
        this.baselines.set(playerId, {
          neutralHipY: hips.y,
          neutralShoulderX: midpoint(joints.leftShoulder, joints.rightShoulder).x
        });
      }

      const baseline = {
        ...(this.baselines.get(playerId) ?? {}),
        ...calibration
      };

      gestures.push(...this.detectKinematicGestures(playerId, joints, previous, dt, now, baseline));
      gestures.push(...this.detectPoseEvents(playerId, joints, now));

      if (trackingFrame.source === "keyboard") {
        gestures.push(...this.detectKeyboardActions(trackedPlayer, now));
      }

      this.previousByPlayer.set(playerId, { timestamp: now, joints });
    }

    gestures.forEach((gesture) => this.eventBus.emit("gesture-detected", gesture));
    return gestures;
  }

  setTargetPose(targetPose) {
    this.targetPose = targetPose;
  }

  clearTargetPose() {
    this.targetPose = null;
  }

  comparePose(playerPose, targetPose) {
    return poseSimilarityFn(playerPose, targetPose);
  }

  detectKinematicGestures(playerId, joints, previous, dt, now, baseline) {
    const events = [];
    if (!joints.leftWrist || !joints.rightWrist || !previous?.joints) {
      return events;
    }

    const wristSamples = [
      { hand: "left", current: joints.leftWrist, previous: previous.joints.leftWrist },
      { hand: "right", current: joints.rightWrist, previous: previous.joints.rightWrist }
    ];

    wristSamples.forEach(({ hand, current, previous: prev }) => {
      if (!prev) {
        return;
      }
      const velocity = {
        x: (current.x - prev.x) / dt,
        y: (current.y - prev.y) / dt,
        z: (current.z - prev.z) / dt
      };
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const direction = velocity.x >= 0 ? "right" : "left";
      const angle = angleBetween({ x: 1, y: 0, z: 0 }, velocity);

      if (speed > this.config.gestures.swingVelocityThreshold && this.canEmit(playerId, "swing", now)) {
        events.push({
          type: "swing",
          playerId,
          timestamp: now,
          confidence: 0.9,
          metadata: { hand, velocity: speed, direction, angle }
        });
      }

      if (speed > this.config.gestures.throwVelocityThreshold && this.canEmit(playerId, "throw", now)) {
        const power = Math.min(1, speed / (this.config.gestures.throwVelocityThreshold * 4));
        events.push({
          type: "throw",
          playerId,
          timestamp: now,
          confidence: 0.88,
          metadata: { velocity: speed, angle, power }
        });
      }
    });

    const shoulderMid = midpoint(joints.leftShoulder, joints.rightShoulder);
    const hipMid = midpoint(joints.leftHip, joints.rightHip);
    const neutralHipY = baseline.neutralHipY ?? hipMid.y;
    const neutralShoulderX = baseline.neutralShoulderX ?? shoulderMid.x;

    const jumpDisplacement = neutralHipY - hipMid.y;
    if (jumpDisplacement > this.config.gestures.jumpThreshold && this.canEmit(playerId, "jump", now)) {
      events.push({
        type: "jump",
        playerId,
        timestamp: now,
        confidence: 0.9,
        metadata: { displacement: jumpDisplacement }
      });
    }

    const crouchAmount = hipMid.y - neutralHipY;
    if (crouchAmount > this.config.gestures.crouchThreshold && this.canEmit(playerId, "crouch", now)) {
      events.push({
        type: "crouch",
        playerId,
        timestamp: now,
        confidence: 0.85,
        metadata: { amount: crouchAmount }
      });
    }

    const leanAmount = shoulderMid.x - neutralShoulderX;
    if (Math.abs(leanAmount) > this.config.gestures.leanThreshold && this.canEmit(playerId, "lean", now)) {
      events.push({
        type: "lean",
        playerId,
        timestamp: now,
        confidence: 0.85,
        metadata: {
          direction: leanAmount < 0 ? "left" : "right",
          amount: Math.abs(leanAmount)
        }
      });
    }

    return events;
  }

  detectKeyboardActions(player, now) {
    const events = [];
    const actions = player.actions ?? {};
    const playerId = player.playerId;

    const pushIfActive = (action, type, metadata = {}) => {
      if (!actions[action]) {
        return;
      }
      if (!this.canEmit(playerId, type, now, 150)) {
        return;
      }
      events.push({ type, playerId, timestamp: now, confidence: 1, metadata });
    };

    pushIfActive("jump", "jump", { displacement: 0.12 });
    pushIfActive("crouch", "crouch", { amount: 0.1 });
    pushIfActive("lean-left", "lean", { direction: "left", amount: 0.1 });
    pushIfActive("lean-right", "lean", { direction: "right", amount: 0.1 });
    pushIfActive("swing", "swing", { hand: "right", velocity: 1, direction: "right", angle: 0 });
    pushIfActive("throw", "throw", { velocity: 1, angle: 0, power: 0.8 });

    return events;
  }

  detectPoseEvents(playerId, joints, now) {
    if (!this.targetPose) {
      return [];
    }
    const similarity = this.comparePose(joints, this.targetPose);
    if (!this.canEmit(playerId, "pose-match", now, 180)) {
      return [];
    }
    return [
      {
        type: "pose-match",
        playerId,
        timestamp: now,
        confidence: similarity,
        metadata: { similarity }
      }
    ];
  }

  canEmit(playerId, type, now, customCooldown) {
    const key = `${playerId}:${type}`;
    const previous = this.cooldowns.get(key) ?? 0;
    const cooldown = customCooldown ?? this.config.gestures.gestureCooldownMs;
    if (now - previous < cooldown) {
      return false;
    }
    this.cooldowns.set(key, now);
    return true;
  }
}
