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

const runQaSmoke = async () => {
  if (appDisposed) {
    return;
  }
  const player = { playerId: "p1", name: "Player 1", color: "#4ecdc4" };
  eventBus.emit("qa-smoke-status", { running: true });
  try {
    gameManager.startKeyboardDemo();
    await wait(180);
    if (appDisposed) {
      return;
    }
    gameManager.setPlayers([player]);
    gameManager.beginCalibration();
    await wait(180);
    if (appDisposed) {
      return;
    }
    gameManager.advanceCalibration(true);
    await wait(220);
    if (appDisposed) {
      return;
    }

    const modeIds = ["tennis", "bowling", "obstacle-dash", "dance", "target-toss"];
    for (const modeId of modeIds) {
      if (appDisposed) {
        return;
      }
      gameManager.startMode(modeId);
      await wait(320);
      if (appDisposed) {
        return;
      }
      gameManager.endRound("qa-smoke");
      await wait(220);
      if (appDisposed) {
        return;
      }
      gameManager.returnToModeSelect();
      await wait(180);
    }

    eventBus.emit("qa-smoke-status", { running: false });
    uiManager.showToast("Keyboard smoke sequence complete.", "ok");
  } catch (error) {
    eventBus.emit("qa-smoke-status", { running: false });
    uiManager.showToast("Smoke sequence failed. Check console.", "error");
    console.error("QA smoke sequence failed", error);
  }
};

eventBus.on("qa-run-smoke", runQaSmoke);

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
