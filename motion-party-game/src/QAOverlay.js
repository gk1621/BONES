const CHECK_ITEMS = [
  { key: "welcome", label: "Welcome screen reached" },
  { key: "keyboard", label: "Keyboard demo mode entered" },
  { key: "calibration", label: "Calibration step reached" },
  { key: "mode-select", label: "Mode selection reached" },
  { key: "all-modes", label: "All five modes launched" }
];

export default class QAOverlay {
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this.element = null;
    this.stateMap = Object.fromEntries(CHECK_ITEMS.map((item) => [item.key, false]));
    this.launchedModes = new Set();
    this.running = false;

    this.onStateChanged = this.handleStateChanged.bind(this);
    this.onKeyboardStarted = this.handleKeyboardStarted.bind(this);
    this.onModeStarted = this.handleModeStarted.bind(this);
    this.onSmokeStatus = this.handleSmokeStatus.bind(this);
    this.onClick = this.handleClick.bind(this);
  }

  init() {
    this.element = document.createElement("aside");
    this.element.className = "qa-panel";
    this.container.appendChild(this.element);
    this.element.addEventListener("click", this.onClick);

    this.eventBus.on("state-changed", this.onStateChanged);
    this.eventBus.on("keyboard-demo-started", this.onKeyboardStarted);
    this.eventBus.on("mode-started", this.onModeStarted);
    this.eventBus.on("qa-smoke-status", this.onSmokeStatus);
    this.render();
  }

  destroy() {
    this.eventBus.off("state-changed", this.onStateChanged);
    this.eventBus.off("keyboard-demo-started", this.onKeyboardStarted);
    this.eventBus.off("mode-started", this.onModeStarted);
    this.eventBus.off("qa-smoke-status", this.onSmokeStatus);
    if (this.element) {
      this.element.removeEventListener("click", this.onClick);
    }
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    if (button.dataset.action === "run-smoke") {
      if (this.running) {
        return;
      }
      this.eventBus.emit("qa-run-smoke");
      return;
    }

    if (button.dataset.action === "reset-diagnostics") {
      this.resetDiagnostics();
      this.eventBus.emit("qa-diagnostics-reset");
      return;
    }

    if (button.dataset.action === "export-diagnostics") {
      this.eventBus.emit("qa-export-diagnostics");
    }
  }

  resetDiagnostics() {
    this.stateMap = Object.fromEntries(CHECK_ITEMS.map((item) => [item.key, false]));
    this.launchedModes.clear();
    this.running = false;
    this.render();
  }

  handleStateChanged({ state }) {
    if (state === "welcome") {
      this.stateMap.welcome = true;
    } else if (state === "calibration") {
      this.stateMap.calibration = true;
    } else if (state === "mode-select") {
      this.stateMap["mode-select"] = true;
    }
    this.render();
  }

  handleKeyboardStarted() {
    this.stateMap.keyboard = true;
    this.render();
  }

  handleModeStarted({ modeId }) {
    this.launchedModes.add(modeId);
    this.stateMap["all-modes"] = this.launchedModes.size >= 5;
    this.render();
  }

  handleSmokeStatus({ running }) {
    this.running = Boolean(running);
    this.render();
  }

  render() {
    if (!this.element) {
      return;
    }
    const rows = CHECK_ITEMS.map((item) => {
      const passed = this.stateMap[item.key];
      return `<li class="${passed ? "pass" : "pending"}">${passed ? "✓" : "•"} ${item.label}</li>`;
    }).join("");

    this.element.innerHTML = `
      <strong>QA Checklist</strong>
      <ul>${rows}</ul>
      <button class="btn btn-ghost qa-btn" data-action="run-smoke" ${this.running ? "disabled" : ""}>
        ${this.running ? "Running..." : "Run Keyboard Smoke"}
      </button>
      <button class="btn btn-ghost qa-btn" data-action="reset-diagnostics">Reset Diagnostics</button>
      <button class="btn btn-ghost qa-btn" data-action="export-diagnostics">Export Diagnostics</button>
    `;
  }
}
