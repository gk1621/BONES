# Motion Party Game

Browser-based motion-controlled party game MVP built with Vite, Three.js, and MediaPipe Tasks Vision, with full keyboard fallback support.

## 1) Project overview

Motion Party is a local, webcam-powered party game app with 5 mini-games:

- Tennis Rally
- Bowling (5-frame MVP)
- Obstacle Dash
- Dance Match
- Target Toss

The app is designed to remain playable even when camera permissions are denied or MediaPipe tracking fails.

## 2) Installation

```bash
npm install
```

## 3) Running locally

```bash
npm run dev
```

Open the Vite URL shown in terminal (typically `http://localhost:5173`).

## 4) Browser permissions

- Click **Start** on Welcome screen to request webcam access.
- If camera permission is denied or tracking models fail, choose **Keyboard Demo Mode**.
- The app handles camera/model failures without crashing.

## 5) Keyboard fallback controls

### Player 1

- `A` = lean left
- `D` = lean right
- `W` = jump
- `S` = crouch/slide
- `Space` = swing/throw

### Player 2

- `ArrowLeft` = lean left
- `ArrowRight` = lean right
- `ArrowUp` = jump
- `ArrowDown` = crouch/slide
- `Enter` = swing/throw

## 6) Game modes

### Tennis Rally
Time swing gestures with ball arrival. First to 7 points wins.

### Bowling
Turn-based 5-frame bowling with simplified strike/spare markers.

### Obstacle Dash
Simultaneous lanes; avoid obstacle types via jump/crouch/lean.

### Dance Match
Match changing target poses; combo multiplier rewards sustained accuracy.

### Target Toss
Turn-based projectile throws at moving targets with ring-based scoring.

## 7) Architecture

- `EventBus.js` – decoupled event communication.
- `TrackingEngine.js` – webcam + MediaPipe integration with safe fallback path.
- `KeyboardFallback.js` – synthetic tracking frame generation.
- `GestureRecognizer.js` – gesture semantics (`swing`, `jump`, `lean`, `crouch`, `throw`, `pose-match`).
- `GameManager.js` – app state machine and game flow.
- `SceneManager.js` – Three.js lifecycle and rendering.
- `UIManager.js` – screen rendering + HUD updates.
- `ScoreManager.js` – session scoring + localStorage high score persistence.
- `modes/*.js` – mode-specific gameplay logic.

## 8) Known MVP limitations

- MediaPipe multi-person tracking can vary by browser/device lighting.
- Physics/collision are intentionally simplified for quick playability.
- Bowling scoring is simplified (no full strike/spare bonus chain math).
- Dance similarity uses heuristic approximation, not a full biomechanical model.
- No networking or online multiplayer in MVP.

## 9) Roadmap

- Improve multi-player pose assignment and hand disambiguation.
- Add richer animations, particles, and UI transitions.
- Add better physics tuning and optional gamepad support.
- Add online scoreboard sync and spectator mode.
- Add imported 3D assets and polished sound design.
