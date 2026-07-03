import * as THREE from "three";
import IGameMode from "./IGameMode.js";
import { clamp } from "../utils/math.js";
import { clampSpeed } from "../utils/physics.js";

export default class TennisMode extends IGameMode {
  constructor(deps) {
    super(deps);
    this.modeId = "tennis";
    this.players = [];
    this.scores = {};
    this.ball = { mesh: null, velocity: new THREE.Vector3() };
    this.targetScore = 7;
    this.complete = false;
    this.winnerId = null;
    this.objects = [];
    this.courtDepth = 16;
  }

  init(players) {
    this.players = players;
    this.scores = Object.fromEntries(players.map((player) => [player.playerId, 0]));
    this.complete = false;
    this.winnerId = null;

    this.sceneManager.clearScene();
    this.sceneManager.setCameraMode("perspective");
    const scene = this.sceneManager.getScene();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, this.courtDepth),
      new THREE.MeshStandardMaterial({ color: "#145a7a" })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    this.objects.push(floor);

    const net = new THREE.Mesh(
      new THREE.BoxGeometry(12, 1.1, 0.12),
      new THREE.MeshStandardMaterial({ color: "#d5dee8", transparent: true, opacity: 0.75 })
    );
    net.position.set(0, 0.55, 0);
    scene.add(net);
    this.objects.push(net);

    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 20, 20),
      new THREE.MeshStandardMaterial({ color: "#f7f96b", emissive: "#434400" })
    );
    scene.add(ballMesh);
    this.objects.push(ballMesh);
    this.ball.mesh = ballMesh;

    this.players.forEach((player, index) => {
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.05, 0.7),
        new THREE.MeshStandardMaterial({ color: player.color ?? (index === 0 ? "#4ecdc4" : "#ff6b6b") })
      );
      marker.position.set(index === 0 ? -2.5 : 2.5, 0.03, index === 0 ? 6 : -6);
      scene.add(marker);
      this.objects.push(marker);
    });

    this.resetBall(this.players[0]?.playerId);
  }

  update(dt, context) {
    if (!this.ball.mesh || this.complete) {
      return;
    }

    this.ball.mesh.position.addScaledVector(this.ball.velocity, dt);

    if (this.ball.mesh.position.x > 5.6 || this.ball.mesh.position.x < -5.6) {
      this.ball.velocity.x *= -1;
      this.ball.mesh.position.x = clamp(this.ball.mesh.position.x, -5.6, 5.6);
    }

    if (this.ball.mesh.position.y <= 0.28) {
      this.ball.mesh.position.y = 0.28;
      this.ball.velocity.y = Math.abs(this.ball.velocity.y) * 0.8;
    }
    this.ball.velocity.y -= 9.8 * dt;
    this.ball.velocity.multiplyScalar(0.998);

    if (this.ball.mesh.position.z > this.courtDepth / 2) {
      const opponentId = this.players[1]?.playerId ?? this.players[0]?.playerId;
      this.scorePoint(opponentId);
      this.resetBall(opponentId);
    } else if (this.ball.mesh.position.z < -this.courtDepth / 2) {
      this.scorePoint(this.players[0]?.playerId);
      this.resetBall(this.players[0]?.playerId);
    }

    if (this.players.length === 1 && this.ball.mesh.position.z < -4.8) {
      this.ball.velocity.z = Math.abs(this.ball.velocity.z);
      this.ball.velocity.y = 2.4;
    }

    if (context.remainingTime <= 0) {
      this.finishByScore();
    }
  }

  handleGesture(gesture) {
    if (this.complete || gesture.type !== "swing" || !this.ball.mesh) {
      return;
    }
    const playerIndex = this.players.findIndex((player) => player.playerId === gesture.playerId);
    if (playerIndex === -1) {
      return;
    }

    const isFrontPlayer = playerIndex === 0;
    const zTarget = isFrontPlayer ? 5.8 : -5.8;
    const closeEnough = Math.abs(this.ball.mesh.position.z - zTarget) < 1.8;
    if (!closeEnough) {
      return;
    }

    const direction = isFrontPlayer ? -1 : 1;
    const power = clamp(gesture.metadata?.velocity ?? 1, 0.6, 1.9);
    this.ball.velocity.set(
      (Math.random() - 0.5) * 3.2,
      3 + Math.random() * 1.6,
      direction * (5 + power * 2.5)
    );
    const bounded = clampSpeed(this.ball.velocity, 3, 16);
    this.ball.velocity.set(bounded.x, bounded.y, bounded.z);
  }

  resetBall(servingPlayerId) {
    if (!this.ball.mesh) {
      return;
    }
    const servingIndex = this.players.findIndex((player) => player.playerId === servingPlayerId);
    const fromFront = servingIndex !== 1;
    this.ball.mesh.position.set(0, 1.7, fromFront ? 5.3 : -5.3);
    this.ball.velocity.set((Math.random() - 0.5) * 2, 2.7, fromFront ? -6.6 : 6.6);
  }

  scorePoint(playerId) {
    if (!playerId) {
      return;
    }
    this.scores[playerId] = (this.scores[playerId] ?? 0) + 1;
    this.scoreManager.setScore(playerId, this.modeId, this.scores[playerId]);
    if (this.scores[playerId] >= this.targetScore) {
      this.complete = true;
      this.winnerId = playerId;
    }
  }

  finishByScore() {
    const entries = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    this.complete = true;
    this.winnerId = entries[0]?.[0] ?? this.players[0]?.playerId;
  }

  getResults() {
    return {
      modeId: this.modeId,
      winnerId: this.winnerId,
      scores: this.scores,
      isComplete: this.complete
    };
  }

  teardown() {
    const scene = this.sceneManager.getScene();
    this.objects.forEach((object) => scene.remove(object));
    this.objects = [];
    this.ball.mesh = null;
  }
}
