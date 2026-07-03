export default class DebugPanel {
  constructor(container, eventBus, config) {
    this.container = container;
    this.eventBus = eventBus;
    this.config = config;
    this.enabled = Boolean(config.debug.showSkeletonDefault);
    this.element = null;
    this.lastGesture = "none";
    this.stats = {
      fps: 0,
      source: "none",
      players: 0,
      confidence: 0
    };

    this.onToggleDebug = this.toggle.bind(this);
    this.onTrackingUpdated = this.handleTrackingUpdated.bind(this);
    this.onGestureDetected = this.handleGestureDetected.bind(this);
  }

  init() {
    this.element = document.createElement("aside");
    this.element.className = "debug-panel";
    this.container.appendChild(this.element);

    this.eventBus.on("toggle-debug", this.onToggleDebug);
    this.eventBus.on("tracking-updated", this.onTrackingUpdated);
    this.eventBus.on("gesture-detected", this.onGestureDetected);

    this.render();
    this.updateVisibility();
  }

  destroy() {
    this.eventBus.off("toggle-debug", this.onToggleDebug);
    this.eventBus.off("tracking-updated", this.onTrackingUpdated);
    this.eventBus.off("gesture-detected", this.onGestureDetected);
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  toggle() {
    this.enabled = !this.enabled;
    this.updateVisibility();
  }

  updateFrameStats(fps) {
    const clampedFps = Math.max(0, Math.min(240, fps || 0));
    this.stats.fps = this.stats.fps === 0 ? clampedFps : this.stats.fps * 0.85 + clampedFps * 0.15;
    if (this.enabled) {
      this.render();
    }
  }

  handleTrackingUpdated(frame) {
    const players = frame?.players ?? [];
    const avgConfidence = players.length
      ? players.reduce((sum, player) => sum + (player.confidence ?? 0), 0) / players.length
      : 0;
    this.stats.source = frame?.source ?? "none";
    this.stats.players = players.length;
    this.stats.confidence = avgConfidence;
    if (this.enabled) {
      this.render();
    }
  }

  handleGestureDetected(gesture) {
    this.lastGesture = `${gesture.type} (${gesture.playerId})`;
    if (this.enabled) {
      this.render();
    }
  }

  updateVisibility() {
    if (!this.element) {
      return;
    }
    this.element.style.display = this.enabled ? "block" : "none";
  }

  render() {
    if (!this.element) {
      return;
    }
    this.element.innerHTML = `
      <strong>Debug Stats</strong>
      <div>FPS: ${Math.round(this.stats.fps)}</div>
      <div>Source: ${this.stats.source}</div>
      <div>Players: ${this.stats.players}</div>
      <div>Confidence: ${Math.round(this.stats.confidence * 100)}%</div>
      <div>Last Gesture: ${this.lastGesture}</div>
    `;
  }
}
