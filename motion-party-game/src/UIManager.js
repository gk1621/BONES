export default class UIManager {
  constructor(rootElement, eventBus, config) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.config = config;
    this.toastTimer = null;
    this.boundClick = this.handleClick.bind(this);
    this.boundSubmit = this.handleSubmit.bind(this);
  }

  init() {
    this.rootElement.addEventListener("click", this.boundClick);
    this.rootElement.addEventListener("submit", this.boundSubmit);
    this.showWelcome();
  }

  destroy() {
    this.rootElement.removeEventListener("click", this.boundClick);
    this.rootElement.removeEventListener("submit", this.boundSubmit);
    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  showWelcome() {
    this.render(`
      <section class="screen welcome-screen panel">
        <h1>Motion Party</h1>
        <p class="subtitle">Webcam-powered living room games</p>
        <div class="actions">
          <button class="btn btn-primary" data-action="start-camera">Start</button>
          <button class="btn btn-secondary" data-action="start-keyboard">Keyboard Demo Mode</button>
        </div>
        <p class="note">For best results, stand 5 to 8 feet from your webcam.</p>
      </section>
    `);
  }

  showCameraPermission() {
    this.render(`
      <section class="screen panel">
        <h2>Camera Permission</h2>
        <p>Requesting webcam access...</p>
        <div id="tracking-status" class="tracking-status loading">Waiting for permission</div>
        <div class="actions">
          <button class="btn btn-secondary" data-action="start-keyboard">Continue with Keyboard Demo</button>
          <button class="btn btn-ghost" data-action="back-welcome">Back</button>
        </div>
      </section>
    `);
  }

  showPlayerSetup() {
    this.render(`
      <section class="screen panel">
        <h2>Player Setup</h2>
        <form id="player-setup-form" class="stack">
          <label>
            Player Count
            <select name="playerCount">
              <option value="1">1 Player</option>
              <option value="2">2 Players</option>
            </select>
          </label>
          <div class="player-grid">
            <article class="card">
              <h3>Player 1</h3>
              <label>Name <input name="player1Name" value="Player 1" maxlength="20" /></label>
              <label>Color <input name="player1Color" type="color" value="#4ecdc4" /></label>
            </article>
            <article class="card">
              <h3>Player 2</h3>
              <label>Name <input name="player2Name" value="Player 2" maxlength="20" /></label>
              <label>Color <input name="player2Color" type="color" value="#ff6b6b" /></label>
            </article>
          </div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">Continue to Calibration</button>
          </div>
        </form>
      </section>
    `);
  }

  showCalibration(players, currentPlayerIndex) {
    const player = players[currentPlayerIndex];
    this.render(`
      <section class="screen panel calibration-screen">
        <h2>Calibration</h2>
        <p>Player <strong>${player?.name ?? "Unknown"}</strong>, stand in your area and wave or raise a hand.</p>
        <ul class="calibration-list">
          <li>Capture neutral pose</li>
          <li>Capture center position</li>
          <li>Estimate reach envelope</li>
        </ul>
        <div id="tracking-status" class="tracking-status">Ready to capture</div>
        <div class="actions">
          <button class="btn btn-primary" data-action="calibration-capture">Capture</button>
          <button class="btn btn-secondary" data-action="calibration-skip">Skip (Keyboard Mode)</button>
        </div>
      </section>
    `);
  }

  showModeSelect(modes) {
    const cards = modes
      .map(
        (mode) => `
          <article class="mode-card card">
            <h3>${mode.name}</h3>
            <p>${mode.description}</p>
            <p class="controls"><strong>Controls:</strong> ${mode.controls}</p>
            <button class="btn btn-primary" data-action="play-mode" data-mode-id="${mode.id}">Play</button>
          </article>
        `
      )
      .join("");

    this.render(`
      <section class="screen panel mode-select-screen">
        <h2>Choose a Game Mode</h2>
        <div class="mode-grid">${cards}</div>
      </section>
    `);
  }

  showGameplay(mode, players) {
    const scoreboard = players
      .map(
        (player) => `
          <div class="hud-player" data-player-id="${player.playerId}">
            <span class="swatch" style="background:${player.color}"></span>
            <span class="name">${player.name}</span>
            <strong class="score">0</strong>
          </div>
        `
      )
      .join("");

    this.render(`
      <section class="screen hud-screen">
        <div class="hud panel glass">
          <div>
            <h3>${mode.name}</h3>
            <p id="hud-timer">Time: --</p>
          </div>
          <div class="hud-row">${scoreboard}</div>
          <div class="hud-row controls-row">
            <button class="btn btn-ghost" data-action="toggle-debug">Toggle Debug Skeleton</button>
            <button class="btn btn-ghost" data-action="pause-game">Pause</button>
            <button class="btn btn-ghost" data-action="exit-mode">Exit to Menu</button>
          </div>
          <div id="tracking-status" class="tracking-status">Tracking ready</div>
        </div>
      </section>
    `);
  }

  showResults(results) {
    const rows = Object.entries(results.scores ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([playerId, score]) => `<li><strong>${playerId.toUpperCase()}</strong>: ${Math.floor(score)}</li>`)
      .join("");
    this.render(`
      <section class="screen panel results-screen">
        <h2>Results</h2>
        <p class="subtitle">Winner: ${results.winnerName ?? results.winnerId ?? "No winner"}</p>
        <ul class="leaderboard">${rows}</ul>
        <div class="actions">
          <button class="btn btn-primary" data-action="play-again" data-mode-id="${results.modeId}">Play Again</button>
          <button class="btn btn-secondary" data-action="choose-another">Choose Another Game</button>
          <button class="btn btn-ghost" data-action="reset-scores">Reset Scores</button>
        </div>
      </section>
    `);
  }

  updateHUD(state) {
    const timer = this.rootElement.querySelector("#hud-timer");
    if (timer && typeof state.remainingTime === "number") {
      timer.textContent = `Time: ${Math.max(0, Math.ceil(state.remainingTime))}s`;
    }
    (state.scoreboard ?? []).forEach((entry) => {
      const row = this.rootElement.querySelector(`.hud-player[data-player-id="${entry.playerId}"] .score`);
      if (row) {
        row.textContent = `${Math.floor(entry.score)}`;
      }
    });
  }

  setTrackingStatus(status) {
    const node = this.rootElement.querySelector("#tracking-status");
    if (!node) {
      return;
    }
    node.textContent = status.message ?? status;
    node.className = `tracking-status ${status.type ?? ""}`.trim();
  }

  showToast(message, type = "info") {
    let toast = this.rootElement.querySelector("#toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      this.rootElement.appendChild(toast);
    }
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.opacity = "1";
    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      toast.style.opacity = "0";
    }, 2200);
  }

  render(html) {
    this.rootElement.innerHTML = html;
  }

  handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    this.eventBus.emit("ui-action", {
      action,
      modeId: button.dataset.modeId
    });
  }

  handleSubmit(event) {
    if (event.target.id !== "player-setup-form") {
      return;
    }
    event.preventDefault();
    const formData = new FormData(event.target);
    const playerCount = Number(formData.get("playerCount"));
    const players = [
      {
        playerId: "p1",
        name: String(formData.get("player1Name") || "Player 1"),
        color: String(formData.get("player1Color") || "#4ecdc4")
      }
    ];
    if (playerCount === 2) {
      players.push({
        playerId: "p2",
        name: String(formData.get("player2Name") || "Player 2"),
        color: String(formData.get("player2Color") || "#ff6b6b")
      });
    }
    this.eventBus.emit("ui-action", {
      action: "submit-player-setup",
      payload: { players }
    });
  }
}
