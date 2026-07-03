import * as THREE from "three";
import IGameMode from "./IGameMode.js";

const OBSTACLE_TYPES = ["low", "high", "left", "right"];

export default class ObstacleDashMode extends IGameMode {
  constructor(deps) {
    super(deps);
    this.modeId = "obstacle-dash";
    this.players = [];
    this.playerStates = {};
    this.obstacles = [];
    this.objects = [];
    this.spawnTimer = 0;
    this.speed = this.config.game.obstacleSpeedStart;
    this.elapsed = 0;
    this.complete = false;
    this.recentActions = {};
  }

  init(players) {
    this.players = players;
    this.complete = false;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.speed = this.config.game.obstacleSpeedStart;
    this.playerStates = {};
    this.recentActions = {};
    this.obstacles = [];

    this.sceneManager.clearScene();
    this.sceneManager.setCameraMode("perspective");
    const scene = this.sceneManager.getScene();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 30),
      new THREE.MeshStandardMaterial({ color: "#153f52" })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    this.objects.push(floor);

    players.forEach((player, index) => {
      const laneX = players.length === 1 ? 0 : index === 0 ? -4 : 4;
      this.playerStates[player.playerId] = {
        laneX,
        lives: 3,
        score: 0
      };
      this.scoreManager.setScore(player.playerId, this.modeId, 0);

      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.04, 28),
        new THREE.MeshStandardMaterial({ color: index === 0 ? "#2bb4ad" : "#ec5c70", transparent: true, opacity: 0.24 })
      );
      marker.position.set(laneX, 0.02, -2);
      scene.add(marker);
      this.objects.push(marker);
    });
  }

  update(dt, context) {
    if (this.complete) {
      return;
    }

    this.elapsed += dt;
    this.spawnTimer += dt;
    this.speed = this.config.game.obstacleSpeedStart + this.elapsed * this.config.game.obstacleSpeedRamp;

    if (this.spawnTimer >= this.config.game.obstacleSpawnSeconds) {
      this.spawnObstacle();
      this.spawnTimer = 0;
    }

    this.updateObstacles(dt);
    this.checkCollisions();
    this.updateScores(dt);

    if (context.remainingTime <= 0 || Object.values(this.playerStates).every((p) => p.lives <= 0)) {
      this.complete = true;
    }
  }

  handleGesture(gesture) {
    if (!this.playerStates[gesture.playerId]) {
      return;
    }
    this.recentActions[gesture.playerId] = {
      type: gesture.type,
      direction: gesture.metadata?.direction,
      at: performance.now()
    };
  }

  spawnObstacle() {
    const scene = this.sceneManager.getScene();
    const players = Object.values(this.playerStates).filter((p) => p.lives > 0);
    if (!players.length) {
      return;
    }

    const randomState = players[Math.floor(Math.random() * players.length)];
    const playerId = Object.entries(this.playerStates).find(([, value]) => value === randomState)?.[0];
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];

    const colorMap = {
      low: "#ffb84d",
      high: "#8f7cff",
      left: "#50e3c2",
      right: "#ff6f91"
    };
    const heightMap = { low: 0.6, high: 1.8, left: 1.2, right: 1.2 };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, heightMap[type], 1.1),
      new THREE.MeshStandardMaterial({ color: colorMap[type] })
    );
    mesh.position.set(randomState.laneX, heightMap[type] / 2, -16);
    scene.add(mesh);

    this.obstacles.push({ mesh, type, playerId, passed: false, hit: false });
  }

  updateObstacles(dt) {
    const scene = this.sceneManager.getScene();
    this.obstacles.forEach((obstacle) => {
      obstacle.mesh.position.z += this.speed * dt;
    });
    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.mesh.position.z > 10) {
        scene.remove(obstacle.mesh);
        return false;
      }
      return true;
    });
  }

  checkCollisions() {
    const now = performance.now();
    this.obstacles.forEach((obstacle) => {
      if (obstacle.hit || Math.abs(obstacle.mesh.position.z - 5.5) > 0.8) {
        return;
      }
      const action = this.recentActions[obstacle.playerId];
      const fresh = action && now - action.at < 650;
      const avoided = this.matchesObstacle(action, obstacle.type, fresh);
      if (!avoided) {
        obstacle.hit = true;
        this.damagePlayer(obstacle.playerId);
      }
    });
  }

  matchesObstacle(action, type, fresh) {
    if (!fresh || !action) {
      return false;
    }
    if (type === "low") {
      return action.type === "jump";
    }
    if (type === "high") {
      return action.type === "crouch";
    }
    if (type === "left") {
      return action.type === "lean" && action.direction === "right";
    }
    return action.type === "lean" && action.direction === "left";
  }

  updateScores(dt) {
    for (const [playerId, state] of Object.entries(this.playerStates)) {
      if (state.lives <= 0) {
        continue;
      }
      state.score += dt * 12;
      this.scoreManager.setScore(playerId, this.modeId, Math.floor(state.score));
    }
  }

  damagePlayer(playerId) {
    const state = this.playerStates[playerId];
    if (!state || state.lives <= 0) {
      return;
    }
    state.lives -= 1;
    this.eventBus.emit("mode-feedback", {
      modeId: this.modeId,
      message: `${playerId.toUpperCase()} hit! ${state.lives} lives left.`
    });
  }

  getResults() {
    const scoreboard = Object.entries(this.playerStates).map(([playerId, state]) => ({
      playerId,
      score: Math.floor(state.score),
      lives: state.lives
    }));
    scoreboard.sort((a, b) => b.score - a.score);
    return {
      modeId: this.modeId,
      winnerId: scoreboard[0]?.playerId,
      scores: Object.fromEntries(scoreboard.map((row) => [row.playerId, row.score])),
      lives: Object.fromEntries(scoreboard.map((row) => [row.playerId, row.lives])),
      isComplete: this.complete
    };
  }

  teardown() {
    const scene = this.sceneManager.getScene();
    this.objects.forEach((object) => scene.remove(object));
    this.obstacles.forEach((obstacle) => scene.remove(obstacle.mesh));
    this.objects = [];
    this.obstacles = [];
  }
}
