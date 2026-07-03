const SKELETON_CONNECTIONS = [
  ["head", "leftShoulder"],
  ["head", "rightShoulder"],
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"]
];

const PLAYER_COLORS = ["#53e0d7", "#ff6b6b"];

export default class DebugOverlay {
  constructor(canvas, eventBus, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.eventBus = eventBus;
    this.config = config;
    this.enabled = Boolean(config.debug.showSkeletonDefault);
    this.latestFrame = null;

    this.onToggleDebug = this.toggle.bind(this);
    this.onTrackingUpdated = this.handleTrackingUpdated.bind(this);
    this.onResize = this.resize.bind(this);
  }

  init() {
    this.eventBus.on("toggle-debug", this.onToggleDebug);
    this.eventBus.on("tracking-updated", this.onTrackingUpdated);
    window.addEventListener("resize", this.onResize);
    this.resize();
    this.updateVisibility();
  }

  destroy() {
    this.eventBus.off("toggle-debug", this.onToggleDebug);
    this.eventBus.off("tracking-updated", this.onTrackingUpdated);
    window.removeEventListener("resize", this.onResize);
  }

  toggle() {
    this.enabled = !this.enabled;
    this.updateVisibility();
    if (!this.enabled) {
      this.clear();
    }
  }

  handleTrackingUpdated(frame) {
    this.latestFrame = frame;
  }

  render(frame) {
    if (!this.enabled) {
      return;
    }

    this.latestFrame = frame ?? this.latestFrame;
    const data = this.latestFrame;
    this.clear();
    if (!data?.players?.length) {
      this.drawLabel("No tracked players", 12, 24, "#f9c74f");
      return;
    }

    data.players.forEach((player, index) => {
      this.drawPlayerSkeleton(player, PLAYER_COLORS[index % PLAYER_COLORS.length]);
    });

    const source = data.source ?? "unknown";
    this.drawLabel(`debug: ${source}`, 12, this.canvas.height / window.devicePixelRatio - 14, "#9ec8ff");
  }

  drawPlayerSkeleton(player, color) {
    const joints = player.joints ?? {};
    if (!Object.keys(joints).length) {
      return;
    }

    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = color;
    this.ctx.globalAlpha = 0.9;

    SKELETON_CONNECTIONS.forEach(([from, to]) => {
      const a = joints[from];
      const b = joints[to];
      if (!a || !b) {
        return;
      }
      const p1 = this.normalizedToCanvas(a);
      const p2 = this.normalizedToCanvas(b);
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
    });

    this.ctx.fillStyle = color;
    Object.values(joints).forEach((joint) => {
      const p = this.normalizedToCanvas(joint);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      this.ctx.fill();
    });

    const head = joints.head ?? joints.leftShoulder;
    if (head) {
      const labelPos = this.normalizedToCanvas(head);
      const confidence = Math.round((player.confidence ?? 0) * 100);
      this.drawLabel(`${player.playerId.toUpperCase()} ${confidence}%`, labelPos.x + 8, labelPos.y - 8, color);
    }
  }

  normalizedToCanvas(point) {
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (point.x ?? 0) * (this.canvas.width / dpr),
      y: (point.y ?? 0) * (this.canvas.height / dpr)
    };
  }

  drawLabel(text, x, y, color) {
    this.ctx.font = "12px Inter, sans-serif";
    this.ctx.fillStyle = "rgba(7, 12, 26, 0.7)";
    const metrics = this.ctx.measureText(text);
    this.ctx.fillRect(x - 4, y - 12, metrics.width + 8, 16);
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clear();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  updateVisibility() {
    this.canvas.style.display = this.enabled ? "block" : "none";
  }
}
