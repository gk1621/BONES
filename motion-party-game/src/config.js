export const CONFIG = {
  tracking: {
    // Minimum landmark confidence before data is treated as reliable.
    confidenceMin: 0.45,
    // Target frequency of tracking inference loop in frames per second.
    inferenceFps: 20,
    // Requested webcam capture width.
    videoWidth: 640,
    // Requested webcam capture height.
    videoHeight: 480,
    // Supported number of local players in MVP.
    maxPlayers: 2
  },
  gestures: {
    // Minimum wrist speed for a swing gesture.
    swingVelocityThreshold: 0.025,
    // Minimum upward hip displacement from neutral for a jump.
    jumpThreshold: 0.08,
    // Minimum shoulder midpoint lateral movement for a lean.
    leanThreshold: 0.1,
    // Minimum downward hip displacement from neutral for a crouch.
    crouchThreshold: 0.08,
    // Minimum wrist speed for a throw gesture.
    throwVelocityThreshold: 0.025,
    // Pose similarity threshold for a "good" dance score.
    poseSimilarityGood: 0.78,
    // Pose similarity threshold for a "great" dance score.
    poseSimilarityGreat: 0.9,
    // Cooldown time to prevent repeated gesture firing every frame.
    gestureCooldownMs: 450
  },
  physics: {
    gravity: -9.8,
    friction: 0.985,
    restitution: 0.72,
    ballSpeedMin: 3,
    ballSpeedMax: 16
  },
  game: {
    defaultRoundSeconds: 60,
    obstacleSpawnSeconds: 1.4,
    obstacleSpeedStart: 4,
    obstacleSpeedRamp: 0.25,
    targetTossThrowsPerPlayer: 5
  },
  audio: {
    masterVolume: 0.6,
    sfxVolume: 0.8,
    musicVolume: 0.25
  },
  debug: {
    showSkeletonDefault: false,
    showVideoDefault: true
  }
};
