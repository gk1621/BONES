export default class KeyboardFallback {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.active = false;
    this.activeActions = new Map();
    this.bursts = new Map();

    this.keyMap = {
      KeyA: { playerId: "p1", action: "lean-left" },
      KeyD: { playerId: "p1", action: "lean-right" },
      KeyW: { playerId: "p1", action: "jump" },
      KeyS: { playerId: "p1", action: "crouch" },
      Space: { playerId: "p1", action: "swing" },
      ArrowLeft: { playerId: "p2", action: "lean-left" },
      ArrowRight: { playerId: "p2", action: "lean-right" },
      ArrowUp: { playerId: "p2", action: "jump" },
      ArrowDown: { playerId: "p2", action: "crouch" },
      Enter: { playerId: "p2", action: "swing" }
    };

    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
  }

  start() {
    if (this.active) {
      return;
    }
    this.active = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  stop() {
    if (!this.active) {
      return;
    }
    this.active = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.activeActions.clear();
    this.bursts.clear();
  }

  getActiveActions() {
    const output = {};
    for (const [playerId, state] of this.activeActions.entries()) {
      output[playerId] = { ...state };
    }
    return output;
  }

  getSyntheticTrackingFrame(players = []) {
    const timestamp = performance.now();
    const defaultPlayers = players.length
      ? players
      : [{ playerId: "p1", name: "Player 1" }, { playerId: "p2", name: "Player 2" }];

    const syntheticPlayers = defaultPlayers.map((player, index) => {
      const playerId = player.playerId ?? `p${index + 1}`;
      const actions = this.activeActions.get(playerId) ?? {};
      const burst = this.bursts.get(playerId) ?? 0;
      if (burst > 0) {
        this.bursts.set(playerId, burst - 1);
      }

      const baseX = player.centerX ?? (index === 0 ? 0.35 : 0.65);
      const leanOffset = actions["lean-left"] ? -0.08 : actions["lean-right"] ? 0.08 : 0;
      const jumpOffset = actions.jump ? -0.1 : 0;
      const crouchOffset = actions.crouch ? 0.08 : 0;
      const hipY = 0.62 + jumpOffset + crouchOffset;
      const shoulderY = 0.42 + jumpOffset + crouchOffset;
      const swingOffset = burst > 0 ? (index === 0 ? 0.09 : -0.09) : 0;

      const joints = {
        head: { x: baseX + leanOffset, y: 0.24 + jumpOffset + crouchOffset, z: 0 },
        leftShoulder: { x: baseX - 0.05 + leanOffset, y: shoulderY, z: 0 },
        rightShoulder: { x: baseX + 0.05 + leanOffset, y: shoulderY, z: 0 },
        leftElbow: { x: baseX - 0.08 + leanOffset, y: 0.5 + jumpOffset + crouchOffset, z: 0 },
        rightElbow: { x: baseX + 0.08 + leanOffset, y: 0.5 + jumpOffset + crouchOffset, z: 0 },
        leftWrist: { x: baseX - 0.12 + leanOffset + swingOffset, y: 0.56 + jumpOffset + crouchOffset, z: -0.02 },
        rightWrist: { x: baseX + 0.12 + leanOffset + swingOffset, y: 0.56 + jumpOffset + crouchOffset, z: -0.02 },
        leftHip: { x: baseX - 0.04 + leanOffset, y: hipY, z: 0 },
        rightHip: { x: baseX + 0.04 + leanOffset, y: hipY, z: 0 },
        leftKnee: { x: baseX - 0.04 + leanOffset, y: 0.76 + jumpOffset + crouchOffset, z: 0 },
        rightKnee: { x: baseX + 0.04 + leanOffset, y: 0.76 + jumpOffset + crouchOffset, z: 0 },
        leftAnkle: { x: baseX - 0.04 + leanOffset, y: 0.92, z: 0 },
        rightAnkle: { x: baseX + 0.04 + leanOffset, y: 0.92, z: 0 }
      };

      return {
        playerId,
        centerX: baseX + leanOffset,
        centerY: 0.56 + jumpOffset + crouchOffset,
        confidence: 0.99,
        poseLandmarks: [],
        handLandmarks: [],
        joints,
        actions: {
          ...actions,
          swing: burst > 0,
          throw: burst > 0
        }
      };
    });

    const frame = {
      timestamp,
      source: "keyboard",
      players: syntheticPlayers
    };
    return frame;
  }

  ensurePlayer(playerId) {
    if (!this.activeActions.has(playerId)) {
      this.activeActions.set(playerId, {});
    }
  }

  handleKeyDown(event) {
    const mapped = this.keyMap[event.code];
    if (!mapped) {
      return;
    }
    event.preventDefault();
    this.ensurePlayer(mapped.playerId);
    const state = this.activeActions.get(mapped.playerId);
    state[mapped.action] = true;

    if (mapped.action === "swing") {
      this.bursts.set(mapped.playerId, 4);
    }
  }

  handleKeyUp(event) {
    const mapped = this.keyMap[event.code];
    if (!mapped) {
      return;
    }
    const state = this.activeActions.get(mapped.playerId);
    if (!state) {
      return;
    }
    state[mapped.action] = false;
  }
}
