import "./styles.css";
import { CONFIG } from "./config.js";
import EventBus from "./EventBus.js";
import TrackingEngine from "./TrackingEngine.js";
import GestureRecognizer from "./GestureRecognizer.js";
import SceneManager from "./SceneManager.js";
import UIManager from "./UIManager.js";
import ScoreManager from "./ScoreManager.js";
import KeyboardFallback from "./KeyboardFallback.js";
import GameManager from "./GameManager.js";
import DebugOverlay from "./DebugOverlay.js";
import DebugPanel from "./DebugPanel.js";
import QAOverlay from "./QAOverlay.js";
import HealthMonitor from "./HealthMonitor.js";
import TennisMode from "./modes/TennisMode.js";
import BowlingMode from "./modes/BowlingMode.js";
import ObstacleDashMode from "./modes/ObstacleDashMode.js";
import DanceMode from "./modes/DanceMode.js";
import TargetTossMode from "./modes/TargetTossMode.js";
import { initAudio, setMasterVolume } from "./utils/audio.js";

const eventBus = new EventBus();
const canvas = document.getElementById("game-canvas");
const debugCanvas = document.getElementById("debug-canvas");
const appRoot = document.getElementById("app");
const uiRoot = document.getElementById("ui-root");
const sceneManager = new SceneManager(canvas, CONFIG);
sceneManager.init();
const debugOverlay = new DebugOverlay(debugCanvas, eventBus, CONFIG);
debugOverlay.init();
const debugPanel = new DebugPanel(appRoot, eventBus, CONFIG);
debugPanel.init();
const qaOverlay = new QAOverlay(appRoot, eventBus);
qaOverlay.init();
const healthMonitor = new HealthMonitor(appRoot, eventBus, CONFIG);
healthMonitor.init();

const trackingEngine = new TrackingEngine(eventBus, CONFIG);
const gestureRecognizer = new GestureRecognizer(eventBus, CONFIG);
const scoreManager = new ScoreManager(eventBus);
const keyboardFallback = new KeyboardFallback(eventBus);
const uiManager = new UIManager(uiRoot, eventBus, CONFIG);

const gameManager = new GameManager({
  eventBus,
  trackingEngine,
  gestureRecognizer,
  sceneManager,
  uiManager,
  scoreManager,
  keyboardFallback,
  config: CONFIG
});

gameManager.registerMode("tennis", TennisMode, {
  id: "tennis",
  name: "Tennis Rally",
  description: "Time your swings to keep the rally alive and score first to 7.",
  controls: "Swing near ball timing (Space/Enter in keyboard mode).",
  supportsPlayers: [1, 2],
  isTurnBased: false
});

gameManager.registerMode("bowling", BowlingMode, {
  id: "bowling",
  name: "Bowling",
  description: "A fast 5-frame bowling showdown with strikes and spares.",
  controls: "Swing/throw to roll. Players alternate turns.",
  supportsPlayers: [1, 2],
  isTurnBased: true
});

gameManager.registerMode("obstacle-dash", ObstacleDashMode, {
  id: "obstacle-dash",
  name: "Obstacle Dash",
  description: "Jump, crouch, and lean through incoming obstacles.",
  controls: "WASD + Space / Arrow keys + Enter.",
  supportsPlayers: [1, 2],
  isTurnBased: false
});

gameManager.registerMode("dance", DanceMode, {
  id: "dance",
  name: "Dance Match",
  description: "Match target poses to build combos and top the score chart.",
  controls: "Pose matching via body tracking or keyboard gestures.",
  supportsPlayers: [1, 2],
  isTurnBased: false,
  roundSeconds: 45
});

gameManager.registerMode("target-toss", TargetTossMode, {
  id: "target-toss",
  name: "Target Toss",
  description: "Take turns throwing at moving rings for high-value hits.",
  controls: "Throw gesture or Space/Enter for each shot.",
  supportsPlayers: [1, 2],
  isTurnBased: true
});

gameManager.init();

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
let appDisposed = false;
let animationFrameId = null;
let qaSmokeSession = null;
let lastSmokeReport = null;

const emitSmokeStatus = (running, message) => {
  eventBus.emit("qa-smoke-status", { running, message });
};

const emitSmokeReport = (report) => {
  lastSmokeReport = report;
  eventBus.emit("qa-smoke-report", report);
};

const isSmokeSessionActive = (session) =>
  Boolean(
    session &&
      qaSmokeSession &&
      qaSmokeSession.id === session.id &&
      !qaSmokeSession.cancelled &&
      !appDisposed
  );

const runQaSmoke = async () => {
  if (appDisposed) {
    return;
  }
  if (qaSmokeSession?.running) {
    uiManager.showToast("Smoke run already in progress.", "warning");
    return;
  }

  const session = { id: Date.now() + Math.random(), cancelled: false, running: true };
  qaSmokeSession = session;
  const player = { playerId: "p1", name: "Player 1", color: "#4ecdc4" };
  const modeIds = ["tennis", "bowling", "obstacle-dash", "dance", "target-toss"];
  const runStartedAt = performance.now();
  const completedModes = [];
  let currentStep = "init";
  let finalReport = null;

  const stepWait = async (ms) => {
    await wait(ms);
    return isSmokeSessionActive(session);
  };

  try {
    currentStep = "start-keyboard-demo";
    emitSmokeStatus(true, "Starting keyboard demo");
    gameManager.startKeyboardDemo();
    if (!(await stepWait(180))) {
      return;
    }

    currentStep = "setup-player";
    emitSmokeStatus(true, "Preparing single-player setup");
    gameManager.setPlayers([player]);
    gameManager.beginCalibration();
    if (!(await stepWait(180))) {
      return;
    }

    currentStep = "calibration-skip";
    emitSmokeStatus(true, "Skipping calibration for smoke path");
    gameManager.advanceCalibration(true);
    if (!(await stepWait(220))) {
      return;
    }

    for (const modeId of modeIds) {
      currentStep = `mode:${modeId}`;
      emitSmokeStatus(true, `Testing mode: ${modeId}`);
      gameManager.startMode(modeId);
      if (!(await stepWait(320))) {
        return;
      }

      gameManager.endRound("qa-smoke");
      if (!(await stepWait(220))) {
        return;
      }

      gameManager.returnToModeSelect();
      if (!(await stepWait(180))) {
        return;
      }
      completedModes.push(modeId);
    }

    finalReport = {
      result: "completed",
      durationMs: Math.round(performance.now() - runStartedAt),
      modesTested: completedModes,
      finishedAt: new Date().toISOString()
    };
    emitSmokeStatus(false, "Smoke run complete");
    emitSmokeReport(finalReport);
    uiManager.showToast("Keyboard smoke sequence complete.", "ok");
  } catch (error) {
    finalReport = {
      result: "failed",
      durationMs: Math.round(performance.now() - runStartedAt),
      modesTested: completedModes,
      step: currentStep,
      error: error?.message ?? String(error),
      finishedAt: new Date().toISOString()
    };
    emitSmokeStatus(false, "Smoke run failed");
    emitSmokeReport(finalReport);
    uiManager.showToast("Smoke sequence failed. Check console.", "error");
    console.error("QA smoke sequence failed", error);
  } finally {
    const wasCurrent = qaSmokeSession && qaSmokeSession.id === session.id;
    if (!wasCurrent) {
      return;
    }
    const cancelled = qaSmokeSession.cancelled;
    qaSmokeSession.running = false;
    qaSmokeSession = null;
    if (cancelled && !appDisposed && !finalReport) {
      finalReport = {
        result: "cancelled",
        durationMs: Math.round(performance.now() - runStartedAt),
        modesTested: completedModes,
        step: currentStep,
        finishedAt: new Date().toISOString()
      };
      emitSmokeStatus(false, "Smoke run cancelled");
      emitSmokeReport(finalReport);
      uiManager.showToast("Smoke run cancelled.", "warning");
    }
  }
};

const stopQaSmoke = () => {
  if (!qaSmokeSession?.running) {
    uiManager.showToast("No smoke run active.", "info");
    return;
  }
  qaSmokeSession.cancelled = true;
  emitSmokeStatus(true, "Cancelling smoke run...");
};

const onDiagnosticsReset = () => {
  lastSmokeReport = null;
  if (!qaSmokeSession?.running) {
    return;
  }
  qaSmokeSession.cancelled = true;
  emitSmokeStatus(true, "Cancelling smoke run...");
};

eventBus.on("qa-run-smoke", runQaSmoke);
eventBus.on("qa-stop-smoke", stopQaSmoke);
eventBus.on("qa-diagnostics-reset", onDiagnosticsReset);

const exportDiagnostics = () => {
  if (appDisposed) {
    return;
  }
  try {
    const frame = trackingEngine.getLatestFrame();
    const snapshot = {
      generatedAt: new Date().toISOString(),
      app: {
        state: gameManager.state,
        currentModeId: gameManager.currentModeId,
        players: gameManager.players,
        calibrationPlayers: Object.keys(gameManager.calibrationData ?? {})
      },
      tracking: {
        ready: trackingEngine.isReady(),
        cameraAvailable: trackingEngine.isCameraAvailable(),
        frame: frame
          ? {
              timestamp: frame.timestamp,
              source: frame.source,
              playerCount: frame.players?.length ?? 0,
              players: (frame.players ?? []).map((player) => ({
                playerId: player.playerId,
                confidence: player.confidence,
                centerX: player.centerX,
                centerY: player.centerY
              }))
            }
          : null
      },
      health: healthMonitor.getSnapshot(),
      qa: {
        smokeRunning: Boolean(qaSmokeSession?.running),
        lastSmokeReport
      }
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `motion-party-diagnostics-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    uiManager.showToast("Diagnostics JSON exported.", "ok");
  } catch (error) {
    console.error("Failed to export diagnostics", error);
    uiManager.showToast("Failed to export diagnostics.", "error");
  }
};

eventBus.on("qa-export-diagnostics", exportDiagnostics);

const onFirstPointerDown = () => {
  initAudio();
  setMasterVolume(CONFIG.audio.masterVolume);
};
window.addEventListener(
  "pointerdown",
  onFirstPointerDown,
  { once: true }
);

let lastTime = performance.now();
function loop(now) {
  if (appDisposed) {
    return;
  }
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const fps = dt > 0 ? 1 / dt : 0;
  healthMonitor.reportRenderTick(now);

  const trackingFrame = trackingEngine.getLatestFrame();
  const gestures = gestureRecognizer.process(trackingFrame, gameManager.players, gameManager.calibrationData);
  gameManager.update(dt, trackingFrame, gestures);
  sceneManager.render();
  debugOverlay.render(trackingFrame);
  debugPanel.updateFrameStats(fps);

  animationFrameId = requestAnimationFrame(loop);
}

function cleanupApp() {
  if (appDisposed) {
    return;
  }
  appDisposed = true;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  window.removeEventListener("pointerdown", onFirstPointerDown);
  eventBus.off("qa-run-smoke", runQaSmoke);
  eventBus.off("qa-stop-smoke", stopQaSmoke);
  eventBus.off("qa-diagnostics-reset", onDiagnosticsReset);
  eventBus.off("qa-export-diagnostics", exportDiagnostics);

  qaOverlay.destroy();
  healthMonitor.destroy();
  debugPanel.destroy();
  debugOverlay.destroy();
  gameManager.destroy();
  trackingEngine.destroy();
  sceneManager.destroy();
  eventBus.clear();
}

window.addEventListener("beforeunload", cleanupApp);
window.addEventListener("pagehide", cleanupApp);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupApp();
  });
}

animationFrameId = requestAnimationFrame(loop);
