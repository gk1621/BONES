export default class IGameMode {
  constructor({ eventBus, sceneManager, scoreManager, config }) {
    this.eventBus = eventBus;
    this.sceneManager = sceneManager;
    this.scoreManager = scoreManager;
    this.config = config;
  }

  init(players) {
    throw new Error("init() must be implemented");
  }

  update(dt, context) {
    throw new Error("update() must be implemented");
  }

  handleGesture(gesture, context) {}

  teardown() {}

  getResults() {
    return {};
  }
}
