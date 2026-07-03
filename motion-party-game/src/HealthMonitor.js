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

    this.onTrackingUpdated = this.handleTrackingUpdated.bind(this);
    this.onStateChanged = this.handleStateChanged.bind(this);
  }

  init() {
    this.element = document.createElement("aside");
    this.element.className = "health-indicator healthy";
    this.container.appendChild(this.element);

    this.eventBus.on("tracking-updated", this.onTrackingUpdated);
    this.eventBus.on("state-changed", this.onStateChanged);

    this.checkTimer = window.setInterval(() => this.check(), 400);
    this.render({ state: "healthy", message: "System healthy" });
  }

  destroy() {
    this.eventBus.off("tracking-updated", this.onTrackingUpdated);
    this.eventBus.off("state-changed", this.onStateChanged);
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
    this.element.className = `health-indicator ${state}`;
    this.element.textContent = `Health: ${message}`;
  }
}
