import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

const POSE_LANDMARK_INDEX = {
  head: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28
};

export default class TrackingEngine {
  constructor(eventBus, config) {
    this.eventBus = eventBus;
    this.config = config;
    this.videoElement = document.getElementById("camera-preview");
    this.stream = null;
    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.latestFrame = this.createEmptyFrame("keyboard");
    this.running = false;
    this.ready = false;
    this.cameraAvailable = false;
    this.keyboardMode = false;
    this.expectedPlayers = 1;
    this.fallbackProvider = null;
    this.inferenceTimer = null;
    this.warningLastAt = new Map();
  }

  async init() {
    try {
      await this.startCamera();
    } catch (error) {
      this.cameraAvailable = false;
      this.emitTrackingWarning("camera", "Camera unavailable. Keyboard mode can still be used.");
    }

    if (this.cameraAvailable) {
      await this.loadModels();
    }

    this.ready = true;
    return this.ready;
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support camera access.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: this.config.tracking.videoWidth },
        height: { ideal: this.config.tracking.videoHeight },
        facingMode: "user"
      },
      audio: false
    });

    this.stream = stream;
    this.cameraAvailable = true;
    this.videoElement.srcObject = stream;
    this.videoElement.style.display = this.config.debug.showVideoDefault ? "block" : "none";
    await this.videoElement.play();
    return stream;
  }

  async loadModels() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
        },
        runningMode: "VIDEO",
        numPoses: this.config.tracking.maxPlayers
      });

      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
      } catch (error) {
        this.emitTrackingWarning("hands", "Hand tracking failed to load. Using pose-only gestures.");
      }
    } catch (error) {
      this.emitTrackingWarning("model", "Tracking models failed to load. Keyboard fallback available.");
    }
  }

  setFallbackProvider(provider) {
    this.fallbackProvider = provider;
  }

  setExpectedPlayers(count) {
    this.expectedPlayers = Math.max(1, Math.min(this.config.tracking.maxPlayers, count));
  }

  setKeyboardMode(enabled) {
    this.keyboardMode = Boolean(enabled);
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    const interval = 1000 / this.config.tracking.inferenceFps;
    this.inferenceTimer = window.setInterval(() => this.inferFrame(), interval);
  }

  stop() {
    this.running = false;
    if (this.inferenceTimer) {
      window.clearInterval(this.inferenceTimer);
      this.inferenceTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.cameraAvailable = false;
  }

  destroy() {
    this.stop();
    try {
      this.poseLandmarker?.close?.();
      this.handLandmarker?.close?.();
    } catch (error) {
      console.warn("Failed to close tracking models cleanly", error);
    }
    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.fallbackProvider = null;
    this.warningLastAt.clear();
  }

  getLatestFrame() {
    return this.latestFrame;
  }

  getVideoElement() {
    return this.videoElement;
  }

  isReady() {
    return this.ready;
  }

  isCameraAvailable() {
    return this.cameraAvailable;
  }

  inferFrame() {
    const fallback = this.getFallbackFrame();
    if (fallback) {
      this.publishFrame(fallback);
      return;
    }

    if (!this.poseLandmarker || !this.videoElement || this.videoElement.readyState < 2) {
      this.publishFrame(this.createEmptyFrame("camera"));
      return;
    }

    try {
      const timestamp = performance.now();
      const poseResult = this.poseLandmarker.detectForVideo(this.videoElement, timestamp);
      const poseLandmarks = poseResult?.landmarks ?? [];
      const players = poseLandmarks
        .slice(0, this.expectedPlayers)
        .map((landmarks, index) => this.landmarksToPlayer(landmarks, index))
        .sort((a, b) => a.centerX - b.centerX)
        .map((player, index) => ({ ...player, playerId: `p${index + 1}` }));

      if (this.handLandmarker && players.length) {
        const handResult = this.handLandmarker.detectForVideo(this.videoElement, timestamp);
        const hands = handResult?.landmarks ?? [];
        hands.forEach((handLandmarks) => {
          const handCenterX =
            handLandmarks.reduce((sum, point) => sum + point.x, 0) / Math.max(handLandmarks.length, 1);
          let bestIndex = 0;
          let bestDistance = Infinity;
          players.forEach((player, index) => {
            const distance = Math.abs(player.centerX - handCenterX);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = index;
            }
          });
          players[bestIndex].handLandmarks.push(handLandmarks);
        });
      }

      const frame = {
        timestamp,
        source: "camera",
        players
      };

      if (players.some((player) => player.confidence < this.config.tracking.confidenceMin)) {
        this.emitTrackingWarning("confidence", "Tracking confidence is low. Move into better lighting.");
      }

      this.publishFrame(frame);
    } catch (error) {
      this.emitTrackingWarning("runtime", "Tracking hiccup detected. Continuing with last known frame.");
      const fallbackFrame = this.latestFrame
        ? { ...this.latestFrame, timestamp: performance.now() }
        : this.createEmptyFrame("camera");
      this.publishFrame(fallbackFrame);
    }
  }

  emitTrackingWarning(type, message) {
    const cooldownMs = this.config.tracking.warningCooldownMs ?? 2500;
    const now = performance.now();
    const lastWarningAt = this.warningLastAt.get(type) ?? -Infinity;
    if (now - lastWarningAt < cooldownMs) {
      return;
    }
    this.warningLastAt.set(type, now);
    this.eventBus.emit("tracking-warning", { type, message });
  }

  publishFrame(frame) {
    this.latestFrame = frame;
    this.eventBus.emit("tracking-updated", frame);
  }

  landmarksToPlayer(landmarks, index) {
    const centerX = landmarks.reduce((sum, point) => sum + point.x, 0) / landmarks.length;
    const centerY = landmarks.reduce((sum, point) => sum + point.y, 0) / landmarks.length;
    const confidence =
      landmarks.reduce((sum, point) => sum + (point.visibility ?? point.presence ?? 0.8), 0) / landmarks.length;

    const joints = {};
    for (const [name, idx] of Object.entries(POSE_LANDMARK_INDEX)) {
      const point = landmarks[idx] ?? { x: centerX, y: centerY, z: 0 };
      joints[name] = { x: point.x, y: point.y, z: point.z ?? 0 };
    }

    return {
      playerId: `p${index + 1}`,
      centerX,
      centerY,
      confidence,
      poseLandmarks: landmarks,
      handLandmarks: [],
      joints
    };
  }

  createEmptyFrame(source = "keyboard") {
    return {
      timestamp: performance.now(),
      source,
      players: []
    };
  }

  getFallbackFrame() {
    if (!this.keyboardMode && this.cameraAvailable && this.poseLandmarker) {
      return null;
    }
    if (!this.fallbackProvider) {
      return this.createEmptyFrame("keyboard");
    }
    const frame = this.fallbackProvider();
    return frame ?? this.createEmptyFrame("keyboard");
  }
}
