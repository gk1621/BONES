import * as THREE from "three";
import IGameMode from "./IGameMode.js";
import { clamp } from "../utils/math.js";

const PIN_LAYOUT = [
  [0, -12],
  [-0.55, -12.9],
  [0.55, -12.9],
  [-1.1, -13.8],
  [0, -13.8],
  [1.1, -13.8],
  [-1.65, -14.7],
  [-0.55, -14.7],
  [0.55, -14.7],
  [1.65, -14.7]
];

export default class BowlingMode extends IGameMode {
  constructor(deps) {
    super(deps);
    this.modeId = "bowling";
    this.players = [];
    this.currentPlayerIndex = 0;
    this.currentFrame = 1;
    this.currentRoll = 1;
    this.playerFrames = {};
    this.totals = {};
    this.pinState = [];
    this.pinMeshes = [];
    this.ball = null;
    this.ballVelocity = new THREE.Vector3();
    this.ballInPlay = false;
    this.objects = [];
    this.complete = false;
  }

  init(players) {
    this.players = players;
    this.currentPlayerIndex = 0;
    this.currentFrame = 1;
    this.currentRoll = 1;
    this.complete = false;
    this.playerFrames = {};
    this.totals = {};

    players.forEach((player) => {
      this.playerFrames[player.playerId] = [];
      this.totals[player.playerId] = 0;
      this.scoreManager.setScore(player.playerId, this.modeId, 0);
    });

    this.sceneManager.clearScene();
    this.sceneManager.setCameraMode("perspective");
    const scene = this.sceneManager.getScene();

    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 24),
      new THREE.MeshStandardMaterial({ color: "#6f4e37" })
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.z = -4;
    scene.add(lane);
    this.objects.push(lane);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 18, 18),
      new THREE.MeshStandardMaterial({ color: "#f97316" })
    );
    this.ball.position.set(0, 0.32, 5.2);
    scene.add(this.ball);
    this.objects.push(this.ball);

    this.setupPins();
  }

  update(dt) {
    if (!this.ballInPlay || this.complete) {
      return;
    }

    this.ball.position.addScaledVector(this.ballVelocity, dt);
    this.ballVelocity.multiplyScalar(0.995);
    this.checkPinHits();

    if (this.ball.position.z < -16 || this.ballVelocity.length() < 0.6) {
      this.finalizeRoll();
    }
  }

  handleGesture(gesture) {
    const currentPlayer = this.players[this.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.playerId !== gesture.playerId || this.ballInPlay) {
      return;
    }
    if (gesture.type === "swing" || gesture.type === "throw") {
      const power = clamp(gesture.metadata?.power ?? 0.7, 0.3, 1);
      const curve = (gesture.metadata?.direction === "left" ? -1 : 1) * 0.15;
      this.rollBall(gesture.playerId, power, curve);
    }
  }

  rollBall(playerId, power, curve) {
    if (this.complete || this.ballInPlay) {
      return;
    }
    const current = this.players[this.currentPlayerIndex];
    if (!current || current.playerId !== playerId) {
      return;
    }
    this.ball.position.set(0, 0.32, 5.2);
    this.ballVelocity.set(curve * 4, 0, -(8 + power * 8));
    this.ballInPlay = true;
  }

  setupPins() {
    const scene = this.sceneManager.getScene();
    this.pinMeshes.forEach((pin) => scene.remove(pin.mesh));
    this.pinMeshes = [];
    this.pinState = PIN_LAYOUT.map(() => true);
    PIN_LAYOUT.forEach(([x, z], index) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.9, 12),
        new THREE.MeshStandardMaterial({ color: "#f8fafc" })
      );
      mesh.position.set(x, 0.45, z);
      scene.add(mesh);
      this.pinMeshes.push({ mesh, index });
      this.objects.push(mesh);
    });
  }

  checkPinHits() {
    this.pinMeshes.forEach((pin) => {
      if (!this.pinState[pin.index]) {
        return;
      }
      const distance = pin.mesh.position.distanceTo(this.ball.position);
      if (distance < 0.45) {
        this.pinState[pin.index] = false;
        pin.mesh.rotation.z = Math.PI / 2;
        pin.mesh.position.y = 0.15;
      }
    });
  }

  finalizeRoll() {
    this.ballInPlay = false;
    const standing = this.pinState.filter(Boolean).length;
    const knocked = 10 - standing;
    const frameList = this.playerFrames[this.players[this.currentPlayerIndex].playerId];
    if (!frameList[this.currentFrame - 1]) {
      frameList[this.currentFrame - 1] = { rolls: [] };
    }
    const frame = frameList[this.currentFrame - 1];
    const previousPins = frame.rolls.reduce((sum, roll) => sum + roll, 0);
    frame.rolls.push(Math.max(0, knocked - previousPins));
    this.calculateFrameScore();
    this.advanceTurn();
  }

  advanceTurn() {
    const currentPlayerId = this.players[this.currentPlayerIndex].playerId;
    const frame = this.playerFrames[currentPlayerId][this.currentFrame - 1];
    const isStrike = frame.rolls[0] === 10;
    const frameDone = isStrike || frame.rolls.length >= 2;

    if (frameDone) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      const wrapped = this.currentPlayerIndex === 0;
      if (wrapped) {
        this.currentFrame += 1;
      }
      this.setupPins();
      this.currentRoll = 1;
    } else {
      this.currentRoll += 1;
      if (this.pinState.filter(Boolean).length === 0) {
        this.setupPins();
      }
    }

    if (this.currentFrame > 5) {
      this.complete = true;
    }
  }

  calculateFrameScore() {
    this.players.forEach((player) => {
      const total = this.playerFrames[player.playerId].reduce((sum, frame) => {
        if (!frame) {
          return sum;
        }
        const frameScore = frame.rolls.reduce((subtotal, value) => subtotal + value, 0);
        frame.strike = frame.rolls[0] === 10;
        frame.spare = frame.rolls[0] + (frame.rolls[1] ?? 0) === 10 && !frame.strike;
        return sum + frameScore;
      }, 0);
      this.totals[player.playerId] = total;
      this.scoreManager.setScore(player.playerId, this.modeId, total);
    });
  }

  getResults() {
    const sorted = Object.entries(this.totals).sort((a, b) => b[1] - a[1]);
    return {
      modeId: this.modeId,
      winnerId: sorted[0]?.[0] ?? null,
      scores: this.totals,
      frames: this.playerFrames,
      isComplete: this.complete
    };
  }

  teardown() {
    const scene = this.sceneManager.getScene();
    this.objects.forEach((object) => scene.remove(object));
    this.objects = [];
    this.pinMeshes = [];
    this.ball = null;
    this.ballInPlay = false;
  }
}
