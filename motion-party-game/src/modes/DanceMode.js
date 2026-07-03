import * as THREE from "three";
import IGameMode from "./IGameMode.js";
import { clamp } from "../utils/math.js";

const TARGET_POSES = ["hands-up", "lean-left", "lean-right", "crouch", "star"];

export default class DanceMode extends IGameMode {
  constructor(deps) {
    super(deps);
    this.modeId = "dance";
    this.players = [];
    this.scores = {};
    this.combos = {};
    this.currentPoseIndex = 0;
    this.poseTimer = 0;
    this.complete = false;
    this.visuals = [];
  }

  init(players) {
    this.players = players;
    this.scores = Object.fromEntries(players.map((player) => [player.playerId, 0]));
    this.combos = Object.fromEntries(players.map((player) => [player.playerId, 1]));
    this.currentPoseIndex = 0;
    this.poseTimer = 0;
    this.complete = false;

    this.sceneManager.clearScene();
    this.sceneManager.setCameraMode("orthographic");
    const scene = this.sceneManager.getScene();

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 14),
      new THREE.MeshStandardMaterial({ color: "#2b1548" })
    );
    backdrop.position.z = -6;
    scene.add(backdrop);
    this.visuals.push(backdrop);

    this.drawTargetPose();
    players.forEach((player) => this.scoreManager.setScore(player.playerId, this.modeId, 0));
  }

  update(dt, context) {
    if (this.complete) {
      return;
    }

    this.poseTimer += dt;
    if (this.poseTimer >= 4.2) {
      this.nextPose();
    }

    const framePlayers = context.trackingFrame?.players ?? [];
    this.players.forEach((player) => {
      const tracked = framePlayers.find((row) => row.playerId === player.playerId);
      const similarity = this.computeSimilarity(this.currentPose, tracked?.joints);
      this.scorePoseMatch(player.playerId, similarity, dt);
    });

    if (context.remainingTime <= 0) {
      this.complete = true;
    }
  }

  handleGesture(gesture) {
    if (gesture.type === "pose-match") {
      this.scorePoseMatch(gesture.playerId, gesture.metadata?.similarity ?? 0.7, 0.3);
    }
  }

  nextPose() {
    this.poseTimer = 0;
    this.currentPoseIndex = (this.currentPoseIndex + 1) % TARGET_POSES.length;
    this.drawTargetPose();
  }

  scorePoseMatch(playerId, similarity, dt) {
    const clampedSimilarity = clamp(similarity, 0, 1);
    if (clampedSimilarity >= this.config.gestures.poseSimilarityGood) {
      this.combos[playerId] = Math.min(5, this.combos[playerId] + dt * 0.8);
    } else {
      this.combos[playerId] = Math.max(1, this.combos[playerId] - dt * 1.3);
    }

    const gained = clampedSimilarity * this.combos[playerId] * dt * 25;
    this.scores[playerId] += gained;
    this.scoreManager.setScore(playerId, this.modeId, Math.floor(this.scores[playerId]));
  }

  drawTargetPose() {
    const scene = this.sceneManager.getScene();
    this.visuals.forEach((visual, index) => {
      if (index === 0) {
        return;
      }
      scene.remove(visual);
    });
    this.visuals = this.visuals.slice(0, 1);

    this.currentPose = TARGET_POSES[this.currentPoseIndex];
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: "#d7f4ff" });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 12), material);
    torso.position.y = 0;
    group.add(torso);

    const limb = () => new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 10), material);
    const leftArm = limb();
    const rightArm = limb();
    const leftLeg = limb();
    const rightLeg = limb();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), material);
    head.position.y = 1.6;
    group.add(head, leftArm, rightArm, leftLeg, rightLeg);

    leftLeg.position.set(-0.35, -1.6, 0);
    rightLeg.position.set(0.35, -1.6, 0);
    leftLeg.rotation.z = 0.1;
    rightLeg.rotation.z = -0.1;

    const pose = this.currentPose;
    if (pose === "hands-up") {
      leftArm.position.set(-0.7, 0.8, 0);
      rightArm.position.set(0.7, 0.8, 0);
      leftArm.rotation.z = -0.6;
      rightArm.rotation.z = 0.6;
    } else if (pose === "lean-left") {
      group.rotation.z = 0.35;
      leftArm.position.set(-0.9, 0.2, 0);
      rightArm.position.set(0.9, 0.1, 0);
    } else if (pose === "lean-right") {
      group.rotation.z = -0.35;
      leftArm.position.set(-0.9, 0.1, 0);
      rightArm.position.set(0.9, 0.2, 0);
    } else if (pose === "crouch") {
      group.scale.y = 0.72;
      leftArm.position.set(-0.8, -0.3, 0);
      rightArm.position.set(0.8, -0.3, 0);
    } else {
      leftArm.position.set(-1.1, 0.5, 0);
      rightArm.position.set(1.1, 0.5, 0);
      leftArm.rotation.z = -1;
      rightArm.rotation.z = 1;
      leftLeg.rotation.z = 0.45;
      rightLeg.rotation.z = -0.45;
    }

    group.position.set(0, 0.3, -1.5);
    scene.add(group);
    this.visuals.push(group);
  }

  computeSimilarity(targetPose, joints) {
    if (!joints) {
      return 0.2;
    }

    const shouldersMidX = (joints.leftShoulder.x + joints.rightShoulder.x) / 2;
    const hipsMidX = (joints.leftHip.x + joints.rightHip.x) / 2;
    const hipsMidY = (joints.leftHip.y + joints.rightHip.y) / 2;
    const shouldersMidY = (joints.leftShoulder.y + joints.rightShoulder.y) / 2;
    const handsUp =
      joints.leftWrist.y < joints.leftShoulder.y && joints.rightWrist.y < joints.rightShoulder.y ? 1 : 0.2;
    const lean = clamp(Math.abs(shouldersMidX - hipsMidX) * 8, 0, 1);
    const crouch = clamp((hipsMidY - shouldersMidY - 0.17) * 6, 0, 1);
    const starSpread =
      clamp(Math.abs(joints.leftWrist.x - joints.rightWrist.x) * 2.2, 0, 1) *
      clamp(Math.abs(joints.leftAnkle.x - joints.rightAnkle.x) * 2.4, 0, 1);

    switch (targetPose) {
      case "hands-up":
        return handsUp;
      case "lean-left":
        return shouldersMidX < hipsMidX ? lean : 0.15;
      case "lean-right":
        return shouldersMidX > hipsMidX ? lean : 0.15;
      case "crouch":
        return crouch;
      default:
        return starSpread;
    }
  }

  getResults() {
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    return {
      modeId: this.modeId,
      winnerId: sorted[0]?.[0] ?? null,
      scores: Object.fromEntries(Object.entries(this.scores).map(([id, score]) => [id, Math.floor(score)])),
      isComplete: this.complete
    };
  }

  teardown() {
    const scene = this.sceneManager.getScene();
    this.visuals.forEach((visual) => scene.remove(visual));
    this.visuals = [];
  }
}
