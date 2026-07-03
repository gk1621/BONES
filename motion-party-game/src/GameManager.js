const PLAYER_STORAGE_KEY = "motion-party-game:players:v1";
const CALIBRATION_STORAGE_KEY = "motion-party-game:calibration:v1";

export default class GameManager {
  constructor({
    eventBus,
    trackingEngine,
    gestureRecognizer,
    sceneManager,
    uiManager,
    scoreManager,
    keyboardFallback,
    config
  }) {
    this.eventBus = eventBus;
    this.trackingEngine = trackingEngine;
    this.gestureRecognizer = gestureRecognizer;
    this.sceneManager = sceneManager;
    this.uiManager = uiManager;
    this.scoreManager = scoreManager;
    this.keyboardFallback = keyboardFallback;
    this.config = config;

    this.state = "welcome";
    this.players = this.loadPlayers();
    this.calibrationData = this.loadCalibration();
    this.modes = new Map();
    this.currentMode = null;
    this.currentModeMeta = null;
    this.currentModeId = null;
    this.elapsedTime = 0;
    this.remainingTime = 0;
    this.calibrationIndex = 0;
    this.keyboardDemo = false;

    this.onUiAction = this.handleUiAction.bind(this);
    this.onTrackingWarning = this.handleTrackingWarning.bind(this);
    this.onModeFeedback = (payload) => this.uiManager.showToast(payload.message, "info");
  }

  init() {
    this.uiManager.init();
    this.eventBus.on("ui-action", this.onUiAction);
    this.eventBus.on("tracking-warning", this.onTrackingWarning);
    this.eventBus.on("mode-feedback", this.onModeFeedback);
    this.trackingEngine.setFallbackProvider(() => this.keyboardFallback.getSyntheticTrackingFrame(this.players));
    this.setState("welcome");
  }

  setState(nextState) {
    this.state = nextState;
    this.eventBus.emit("state-changed", { state: nextState });
    if (nextState === "welcome") {
      this.uiManager.showWelcome();
    } else if (nextState === "camera-permission") {
      this.uiManager.showCameraPermission();
    } else if (nextState === "player-setup") {
      this.uiManager.showPlayerSetup();
    } else if (nextState === "calibration") {
      this.uiManager.showCalibration(this.players, this.calibrationIndex);
    } else if (nextState === "mode-select") {
      this.uiManager.showModeSelect([...this.modes.values()].map((row) => row.metadata));
    }
  }

  async startCameraFlow() {
    this.keyboardDemo = false;
    this.keyboardFallback.stop();
    this.trackingEngine.setKeyboardMode(false);
    this.setState("camera-permission");
    this.uiManager.setTrackingStatus({ message: "Requesting webcam permissions...", type: "loading" });
    try {
      if (!this.trackingEngine.isReady()) {
        await this.trackingEngine.init();
      }
      this.trackingEngine.start();
      if (this.trackingEngine.isCameraAvailable()) {
        this.uiManager.setTrackingStatus({ message: "Camera connected. Tracking ready.", type: "ok" });
        this.setState("player-setup");
      } else {
        this.uiManager.setTrackingStatus({
          message: "Camera unavailable. Continue with keyboard demo mode.",
          type: "warning"
        });
      }
    } catch (error) {
      this.uiManager.setTrackingStatus({
        message: "Camera permission denied or unavailable. Keyboard mode is still available.",
        type: "error"
      });
      this.uiManager.showToast("Camera setup failed. Try keyboard demo mode.", "error");
    }
  }

  startKeyboardDemo() {
    this.keyboardDemo = true;
    this.keyboardFallback.start();
    this.trackingEngine.setKeyboardMode(true);
    this.trackingEngine.start();
    this.eventBus.emit("keyboard-demo-started");
    this.uiManager.showToast("Keyboard demo mode enabled.", "ok");
    this.setState("player-setup");
  }

  setPlayers(players) {
    this.players = players;
    this.trackingEngine.setExpectedPlayers(players.length);
    this.persistPlayers();
  }

  beginCalibration() {
    this.calibrationIndex = 0;
    this.setState("calibration");
    if (this.keyboardDemo) {
      this.uiManager.setTrackingStatus({
        message: "Keyboard mode active. Capture or skip calibration.",
        type: "warning"
      });
    }
  }

  finishCalibration() {
    this.persistCalibration();
    this.setState("mode-select");
  }

  registerMode(modeId, ModeClass, metadata) {
    this.modes.set(modeId, { modeId, ModeClass, metadata });
  }

  startMode(modeId) {
    const mode = this.modes.get(modeId);
    if (!mode) {
      this.uiManager.showToast("Mode not found.", "error");
      return;
    }

    if (this.currentMode) {
      this.currentMode.teardown();
      this.currentMode = null;
    }

    this.currentModeId = modeId;
    this.currentModeMeta = mode.metadata;
    this.currentMode = new mode.ModeClass({
      eventBus: this.eventBus,
      sceneManager: this.sceneManager,
      scoreManager: this.scoreManager,
      config: this.config
    });
    this.currentMode.init(this.players);
    this.eventBus.emit("mode-started", { modeId });
    this.elapsedTime = 0;
    this.remainingTime = mode.metadata.roundSeconds ?? this.config.game.defaultRoundSeconds;
    this.setState("playing");
    this.uiManager.showGameplay(mode.metadata, this.players);
  }

  update(dt, trackingFrame, gestures) {
    const confidence = this.getTrackingConfidence(trackingFrame);
    if (this.state !== "playing" || !this.currentMode) {
      if (this.state === "calibration") {
        this.uiManager.setTrackingStatus({
          message: `Tracking confidence: ${Math.round(confidence * 100)}%`,
          type: confidence >= this.config.tracking.confidenceMin ? "ok" : "warning"
        });
      }
      return;
    }

    this.elapsedTime += dt;
    this.remainingTime -= dt;

    const context = {
      players: this.players,
      trackingFrame,
      gestures,
      elapsedTime: this.elapsedTime,
      remainingTime: this.remainingTime,
      gameState: this.state
    };

    gestures.forEach((gesture) => this.currentMode.handleGesture(gesture, context));
    this.currentMode.update(dt, context);

    this.uiManager.updateHUD({
      remainingTime: this.remainingTime,
      scoreboard: this.players.map((player) => ({
        playerId: player.playerId,
        score: this.scoreManager.getScore(player.playerId, this.currentModeId)
      }))
    });

    this.uiManager.setTrackingStatus({
      message: `Tracking confidence: ${Math.round(confidence * 100)}%`,
      type: confidence >= this.config.tracking.confidenceMin ? "ok" : "warning"
    });

    const modeResults = this.currentMode.getResults();
    if (this.remainingTime <= 0 || modeResults.isComplete) {
      this.endRound(this.remainingTime <= 0 ? "timer" : "mode-complete");
    }
  }

  pause() {
    if (this.state !== "playing") {
      return;
    }
    this.state = "paused";
    this.uiManager.showToast("Paused. Press Resume to continue.", "info");
    this.uiManager.render(`
      <section class="screen panel">
        <h2>Paused</h2>
        <div class="actions">
          <button class="btn btn-primary" data-action="resume-game">Resume</button>
          <button class="btn btn-secondary" data-action="exit-mode">Exit to Menu</button>
        </div>
      </section>
    `);
  }

  resume() {
    if (this.state !== "paused") {
      return;
    }
    this.state = "playing";
    if (this.currentModeMeta) {
      this.uiManager.showGameplay(this.currentModeMeta, this.players);
    }
  }

  endRound(reason) {
    if (!this.currentMode) {
      return;
    }
    const results = this.currentMode.getResults();
    const winnerName = this.players.find((player) => player.playerId === results.winnerId)?.name;
    const normalizedResults = {
      ...results,
      modeId: this.currentModeId,
      winnerName,
      reason
    };

    this.players.forEach((player) => {
      const score = this.scoreManager.getScore(player.playerId, this.currentModeId);
      this.scoreManager.saveHighScore(this.currentModeId, player.name, score);
    });

    this.currentMode.teardown();
    this.currentMode = null;
    this.state = "results";
    this.uiManager.showResults(normalizedResults);
  }

  returnToModeSelect() {
    if (this.currentMode) {
      this.currentMode.teardown();
      this.currentMode = null;
    }
    this.currentModeId = null;
    this.currentModeMeta = null;
    this.setState("mode-select");
  }

  handleUiAction(event) {
    const { action, modeId, payload } = event;
    if (action === "start-camera") {
      this.startCameraFlow();
    } else if (action === "start-keyboard") {
      this.startKeyboardDemo();
    } else if (action === "back-welcome") {
      this.setState("welcome");
    } else if (action === "submit-player-setup") {
      this.setPlayers(payload.players);
      this.beginCalibration();
    } else if (action === "calibration-capture") {
      this.captureCalibrationSample();
    } else if (action === "calibration-skip") {
      this.advanceCalibration(true);
    } else if (action === "play-mode") {
      this.startMode(modeId);
    } else if (action === "pause-game") {
      this.pause();
    } else if (action === "resume-game") {
      this.resume();
    } else if (action === "exit-mode") {
      this.returnToModeSelect();
    } else if (action === "play-again") {
      this.startMode(modeId ?? this.currentModeId);
    } else if (action === "choose-another") {
      this.returnToModeSelect();
    } else if (action === "reset-scores") {
      this.scoreManager.resetSession();
      this.scoreManager.clearHighScores();
      this.uiManager.showToast("Scores reset.", "ok");
    } else if (action === "toggle-debug") {
      this.eventBus.emit("toggle-debug");
      this.uiManager.showToast("Debug skeleton toggle requested.", "info");
    }
  }

  captureCalibrationSample() {
    const player = this.players[this.calibrationIndex];
    if (!player) {
      return;
    }

    const frame = this.trackingEngine.getLatestFrame();
    const tracked = frame.players.find((row) => row.playerId === player.playerId) ?? frame.players[0];
    if (!tracked) {
      this.uiManager.showToast("No player detected. Try moving into frame.", "warning");
      return;
    }

    const joints = tracked.joints;
    const neutralHipY = (joints.leftHip.y + joints.rightHip.y) / 2;
    const neutralShoulderX = (joints.leftShoulder.x + joints.rightShoulder.x) / 2;
    const centerX = tracked.centerX;
    const reachEstimate = Math.abs(joints.rightWrist.x - joints.leftWrist.x) * 0.5;

    this.calibrationData[player.playerId] = {
      playerId: player.playerId,
      name: player.name,
      color: player.color,
      neutralHipY,
      neutralShoulderX,
      centerX,
      reachEstimate,
      calibratedAt: Date.now()
    };

    this.uiManager.showToast(`${player.name} calibration captured.`, "ok");
    this.advanceCalibration(false);
  }

  advanceCalibration(skipped) {
    if (skipped) {
      const player = this.players[this.calibrationIndex];
      this.calibrationData[player.playerId] = {
        playerId: player.playerId,
        name: player.name,
        color: player.color,
        neutralHipY: 0.62,
        neutralShoulderX: player.playerId === "p1" ? 0.35 : 0.65,
        centerX: player.playerId === "p1" ? 0.35 : 0.65,
        reachEstimate: 0.35,
        calibratedAt: Date.now()
      };
    }

    this.calibrationIndex += 1;
    if (this.calibrationIndex >= this.players.length) {
      this.finishCalibration();
      return;
    }
    this.setState("calibration");
  }

  getTrackingConfidence(trackingFrame) {
    const players = trackingFrame?.players ?? [];
    if (!players.length) {
      return 0;
    }
    const avg = players.reduce((sum, player) => sum + (player.confidence ?? 0), 0) / players.length;
    return Math.max(0, Math.min(1, avg));
  }

  handleTrackingWarning(payload) {
    this.uiManager.setTrackingStatus({ message: payload.message, type: "warning" });
  }

  loadPlayers() {
    try {
      const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
      if (!raw) {
        return [
          { playerId: "p1", name: "Player 1", color: "#4ecdc4" },
          { playerId: "p2", name: "Player 2", color: "#ff6b6b" }
        ];
      }
      return JSON.parse(raw);
    } catch (error) {
      return [
        { playerId: "p1", name: "Player 1", color: "#4ecdc4" },
        { playerId: "p2", name: "Player 2", color: "#ff6b6b" }
      ];
    }
  }

  loadCalibration() {
    try {
      const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  persistPlayers() {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(this.players));
  }

  persistCalibration() {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(this.calibrationData));
  }
}
