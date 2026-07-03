import * as THREE from "three";

export default class SceneManager {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.orthoCamera = null;
    this.cameraMode = "perspective";
    this.onResize = this.resize.bind(this);
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#09111f");

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 5, 12);

    this.orthoCamera = new THREE.OrthographicCamera(-8 * aspect, 8 * aspect, 8, -8, 0.1, 1000);
    this.orthoCamera.position.set(0, 8, 12);
    this.orthoCamera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);

    this.addDefaultLights();
    window.addEventListener("resize", this.onResize);
  }

  clearScene() {
    const objects = [...this.scene.children];
    objects.forEach((object) => {
      if (object.userData?.persistent) {
        return;
      }
      this.removeAndDispose(object);
    });
    if (!this.scene.children.some((child) => child.userData?.persistent && child.isLight)) {
      this.addDefaultLights();
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode === "orthographic" ? "orthographic" : "perspective";
  }

  addDefaultLights() {
    if (this.scene.children.some((child) => child.userData?.persistent && child.isLight)) {
      return;
    }
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    ambient.userData.persistent = true;
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(6, 10, 4);
    key.userData.persistent = true;
    this.scene.add(ambient, key);
  }

  removeAndDispose(object) {
    if (!object) {
      return;
    }
    if (object.parent) {
      object.parent.remove(object);
    }
    object.traverse((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value && typeof value === "object" && "isTexture" in value) {
              value.dispose?.();
            }
          });
          material.dispose?.();
        });
      }
    });
  }

  render() {
    if (!this.renderer || !this.scene) {
      return;
    }
    const activeCamera = this.cameraMode === "orthographic" ? this.orthoCamera : this.camera;
    this.renderer.render(this.scene, activeCamera);
  }

  resize() {
    if (!this.renderer || !this.camera || !this.orthoCamera) {
      return;
    }
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    this.orthoCamera.left = -8 * aspect;
    this.orthoCamera.right = 8 * aspect;
    this.orthoCamera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    if (this.scene) {
      const objects = [...this.scene.children];
      objects.forEach((object) => this.removeAndDispose(object));
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    this.scene = null;
    this.camera = null;
    this.orthoCamera = null;
    this.renderer = null;
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.cameraMode === "orthographic" ? this.orthoCamera : this.camera;
  }

  getRenderer() {
    return this.renderer;
  }
}
