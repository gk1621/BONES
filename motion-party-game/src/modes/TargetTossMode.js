import * as THREE from "three";
import IGameMode from "./IGameMode.js";
import { clamp } from "../utils/math.js";

const RINGS = [
  { radius: 1.5, points: 10, color: "#6fe7ff" },
  { radius: 1.1, points: 25, color: "#87f779" },
  { radius: 0.7, points: 50, color: "#ffd166" },
  { radius: 0.35, points: 100, color: "#ff5d7f" }
];

export default class TargetTossMode extends IGameMode {
  constructor(deps) {
    super(deps);
    this.modeId = "target-toss";
    this.players = [];
    this.currentPlayerIndex = 0;
    this.throwsTaken = {};
    this.scores = {};
    this.projectiles = [];
    this.targets = [];
    this.objects = [];
    this.complete = false;
  }

  init(players) {
    this.players = players;
    this.currentPlayerIndex = 0;
    this.complete = false;
    this.projectiles = [];
    this.targets = [];
    this.throwsTaken = Object.fromEntries(players.map((player) => [player.playerId, 0]));
    this.scores = Object.fromEntries(players.map((player) => [player.playerId, 0]));

    this.sceneManager.clearScene();
    this.sceneManager.setCameraMode("perspective");
    const scene = this.sceneManager.getScene();

    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 20),
      new THREE.MeshStandardMaterial({ color: "#1f2f45" })
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.z = -1;
    scene.add(lane);
    this.objects.push(lane);

    this.buildTarget(0, -8);
    this.buildTarget(-2.5, -10.2);
    this.buildTarget(2.5, -10.2);
  }

  update(dt) {
    if (this.complete) {
      return;
    }
    this.updateTargets(dt);
    this.projectiles.forEach((projectile) => {
      projectile.velocity.y -= 8.6 * dt;
      projectile.mesh.position.addScaledVector(projectile.velocity, dt);
      projectile.life -= dt;
    });
    this.checkProjectileHits();
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0 && projectile.mesh.position.y > -1);

    this.checkCompletion();
  }

  handleGesture(gesture) {
    const currentPlayer = this.players[this.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.playerId !== gesture.playerId) {
      return;
    }
    if (gesture.type !== "throw" && gesture.type !== "swing") {
      return;
    }
    this.throwProjectile(gesture.playerId, gesture.metadata?.power ?? 0.7, gesture.metadata?.angle ?? 0);
  }

  throwProjectile(playerId, power = 0.7, angle = 0) {
    if (this.complete) {
      return;
    }
    const currentPlayer = this.players[this.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.playerId !== playerId) {
      return;
    }
    const alreadyThrown = this.throwsTaken[playerId];
    if (alreadyThrown >= this.config.game.targetTossThrowsPerPlayer) {
      return;
    }

    const scene = this.sceneManager.getScene();
    const projectile = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({ color: currentPlayer.color ?? "#ffffff" })
    );
    projectile.position.set(0, 1.4, 5.6);
    scene.add(projectile);

    const speed = 7.5 + clamp(power, 0.2, 1) * 7;
    const vx = Math.sin(angle) * 2;
    const velocity = new THREE.Vector3(vx, 2.2 + power * 1.4, -speed);
    this.projectiles.push({ mesh: projectile, velocity, owner: playerId, life: 2.4, scored: false });

    this.throwsTaken[playerId] += 1;
    this.advanceTurn();
  }

  buildTarget(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 1.6, z);
    RINGS.forEach((ring, index) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(ring.radius, 0.07, 10, 48),
        new THREE.MeshStandardMaterial({ color: ring.color, emissive: ring.color, emissiveIntensity: 0.2 })
      );
      mesh.rotation.y = Math.PI / 2;
      mesh.position.x = index * 0.01;
      group.add(mesh);
    });
    this.sceneManager.getScene().add(group);
    this.targets.push({
      group,
      baseX: x,
      phase: Math.random() * Math.PI * 2,
      amplitude: 1.4 + Math.random() * 0.7
    });
    this.objects.push(group);
  }

  updateTargets(dt) {
    this.targets.forEach((target) => {
      target.phase += dt;
      target.group.position.x = target.baseX + Math.sin(target.phase) * target.amplitude;
    });
  }

  checkProjectileHits() {
    this.projectiles.forEach((projectile) => {
      if (projectile.scored) {
        return;
      }
      this.targets.forEach((target) => {
        const worldTargetPos = new THREE.Vector3();
        target.group.getWorldPosition(worldTargetPos);
        const distance = projectile.mesh.position.distanceTo(worldTargetPos);
        for (const ring of RINGS) {
          if (distance <= ring.radius) {
            projectile.scored = true;
            this.scores[projectile.owner] += ring.points;
            this.scoreManager.setScore(projectile.owner, this.modeId, this.scores[projectile.owner]);
            projectile.life = 0;
            return;
          }
        }
      });
    });
  }

  advanceTurn() {
    const attempts = this.players.length;
    for (let offset = 1; offset <= attempts; offset += 1) {
      const candidateIndex = (this.currentPlayerIndex + offset) % this.players.length;
      const candidate = this.players[candidateIndex];
      if (this.throwsTaken[candidate.playerId] < this.config.game.targetTossThrowsPerPlayer) {
        this.currentPlayerIndex = candidateIndex;
        return;
      }
    }
  }

  checkCompletion() {
    this.complete = this.players.every(
      (player) => this.throwsTaken[player.playerId] >= this.config.game.targetTossThrowsPerPlayer
    );
  }

  getResults() {
    const sorted = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
    return {
      modeId: this.modeId,
      winnerId: sorted[0]?.[0] ?? null,
      scores: this.scores,
      throwsTaken: this.throwsTaken,
      isComplete: this.complete
    };
  }

  teardown() {
    const scene = this.sceneManager.getScene();
    this.objects.forEach((object) => scene.remove(object));
    this.projectiles.forEach((projectile) => scene.remove(projectile.mesh));
    this.objects = [];
    this.projectiles = [];
    this.targets = [];
  }
}
