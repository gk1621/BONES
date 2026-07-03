const HIGH_SCORE_KEY = "motion-party-game:high-scores:v1";

export default class ScoreManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.sessionScores = new Map();
    this.highScores = this.loadHighScores();
  }

  addScore(playerId, modeId, points) {
    const current = this.getScore(playerId, modeId);
    this.setScore(playerId, modeId, current + points);
  }

  setScore(playerId, modeId, score) {
    if (!this.sessionScores.has(modeId)) {
      this.sessionScores.set(modeId, new Map());
    }
    this.sessionScores.get(modeId).set(playerId, score);
    this.eventBus.emit("score-updated", { playerId, modeId, score });
    this.eventBus.emit("leaderboard-updated", this.getLeaderboard());
  }

  getScore(playerId, modeId) {
    return this.sessionScores.get(modeId)?.get(playerId) ?? 0;
  }

  getPlayerTotal(playerId) {
    let total = 0;
    for (const modeScores of this.sessionScores.values()) {
      total += modeScores.get(playerId) ?? 0;
    }
    return total;
  }

  getLeaderboard() {
    const playerTotals = new Map();
    for (const [modeId, modeScores] of this.sessionScores.entries()) {
      for (const [playerId, score] of modeScores.entries()) {
        if (!playerTotals.has(playerId)) {
          playerTotals.set(playerId, { playerId, total: 0, byMode: {} });
        }
        const entry = playerTotals.get(playerId);
        entry.total += score;
        entry.byMode[modeId] = score;
      }
    }
    return [...playerTotals.values()].sort((a, b) => b.total - a.total);
  }

  getHighScores(modeId) {
    return [...(this.highScores[modeId] ?? [])].sort((a, b) => b.score - a.score);
  }

  saveHighScore(modeId, playerName, score) {
    const rows = this.highScores[modeId] ?? [];
    rows.push({ playerName, score, savedAt: Date.now() });
    rows.sort((a, b) => b.score - a.score);
    this.highScores[modeId] = rows.slice(0, 10);
    this.persistHighScores();
  }

  resetSession() {
    this.sessionScores.clear();
    this.eventBus.emit("leaderboard-updated", this.getLeaderboard());
  }

  clearHighScores() {
    this.highScores = {};
    this.persistHighScores();
  }

  loadHighScores() {
    try {
      const raw = localStorage.getItem(HIGH_SCORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.warn("Failed to load high scores", error);
      return {};
    }
  }

  persistHighScores() {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(this.highScores));
    } catch (error) {
      console.warn("Failed to save high scores", error);
    }
  }
}
