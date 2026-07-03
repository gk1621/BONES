const TRACKING_REQUIRED_STATES = new Set(["camera-permission", "calibration", "playing", "paused"]);

export default class HealthMonitor {
  constructor(container, eventBus, config) {
    this.container = container;
    this.eventBus = eventBus;
    this.config = config;
    this.element = null;
    this.checkTimer = null;
    this.lastRenderTick = performance.now();
    this.lastTrackingTick = performance.now();
    this.currentState = "welcome";
    this.previousModeId = null;
    this.lastModeStartAt = 0;
    this.telemetry = {
      modeStarts: 0,
      modeRestarts: 0,
      confidenceDrops: 0,
      gesturesTotal: 0,
      gesturesOutOfContext: 0
    };

    this.onTrackingUpdated = this.handleTrackingUpdated.bind(this);
    this.onStateChanged = this.handleStateChanged.bind(this);
    this.onTrackingWarning = this.handleTrackingWarning.bind(this);
    this.onModeStarted = this.handleModeStarted.bind(this);
    this.onGestureDetected = this.handleGestureDetected.bind(this);
  }

  init() {
    this.element = document.createElement("aside");
    this.element.className = "health-indicator healthy";
    this.container.appendChild(this.element);

    this.eventBus.on("tracking-updated", this.onTrackingUpdated);
    this.eventBus.on("state-changed", this.onStateChanged);
    this.eventBus.on("tracking-warning", this.onTrackingWarning);
    this.eventBus.on("mode-started", this.onModeStarted);
    this.eventBus.on("gesture-detected", this.onGestureDetected);

    this.checkTimer = window.setInterval(() => this.check(), 400);
    this.render({ state: "healthy", message: "System healthy" });
  }

  destroy() {
    this.eventBus.off("tracking-updated", this.onTrackingUpdated);
    this.eventBus.off("state-changed", this.onStateChanged);
    this.eventBus.off("tracking-warning", this.onTrackingWarning);
    this.eventBus.off("mode-started", this.onModeStarted);
    this.eventBus.off("gesture-detected", this.onGestureDetected);
    if (this.checkTimer) {
      window.clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  reportRenderTick(now) {
    this.lastRenderTick = now ?? performance.now();
  }

  handleTrackingUpdated() {
    this.lastTrackingTick = performance.now();
  }

  handleStateChanged({ state }) {
    this.currentState = state;
    if (!TRACKING_REQUIRED_STATES.has(this.currentState)) {
      this.lastTrackingTick = performance.now();
    }
  }

  handleTrackingWarning(warning) {
    if (warning?.type === "confidence") {
      this.telemetry.confidenceDrops += 1;
    }
  }

  handleModeStarted({ modeId }) {
    const now = performance.now();
    this.telemetry.modeStarts += 1;
    if (this.previousModeId === modeId && now - this.lastModeStartAt < 90_000) {
      this.telemetry.modeRestarts += 1;
    }
    this.previousModeId = modeId;
    this.lastModeStartAt = now;
  }

  handleGestureDetected() {
    this.telemetry.gesturesTotal += 1;
    if (this.currentState !== "playing") {
      this.telemetry.gesturesOutOfContext += 1;
    }
  }

  check() {
    const now = performance.now();
    const renderLagMs = now - this.lastRenderTick;
    const trackingLagMs = now - this.lastTrackingTick;
    const stallThreshold = this.config.debug.healthStallMs;
    const trackingRequired = TRACKING_REQUIRED_STATES.has(this.currentState);

    const renderState = renderLagMs > stallThreshold * 2 ? "critical" : renderLagMs > stallThreshold ? "warning" : "ok";
    const trackingState = trackingRequired
      ? trackingLagMs > stallThreshold * 2
        ? "critical"
        : trackingLagMs > stallThreshold
          ? "warning"
          : "ok"
      : "ok";

    if (renderState === "critical" || trackingState === "critical") {
      this.render({
        state: "critical",
        message: `Critical stall | render ${Math.round(renderLagMs)}ms | tracking ${Math.round(trackingLagMs)}ms`
      });
      return;
    }
    if (renderState === "warning" || trackingState === "warning") {
      this.render({
        state: "warning",
        message: `Degraded | render ${Math.round(renderLagMs)}ms | tracking ${Math.round(trackingLagMs)}ms`
      });
      return;
    }
    this.render({ state: "healthy", message: "System healthy" });
  }

  render({ state, message }) {
    if (!this.element) {
      return;
    }
    const missRate = this.telemetry.gesturesTotal
      ? Math.round((this.telemetry.gesturesOutOfContext / this.telemetry.gesturesTotal) * 100)
      : 0;
    this.element.className = `health-indicator ${state}`;
    this.element.innerHTML = `
      <strong>Health: ${message}</strong>
      <div class="health-telemetry">
        <span>Modes ${this.telemetry.modeStarts}</span>
        <span>Restarts ${this.telemetry.modeRestarts}</span>
        <span>Confidence drops ${this.telemetry.confidenceDrops}</span>
        <span>Gesture miss-rate ${missRate}%</span>
      </div>
    `;
  }
}
