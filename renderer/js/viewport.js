// 3D view of the chain (three.js, Z-up like every robotics textbook).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const Z_UP = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function toMatrix4(T) {
  const m = new THREE.Matrix4();
  m.set(
    T[0][0], T[0][1], T[0][2], T[0][3],
    T[1][0], T[1][1], T[1][2], T[1][3],
    T[2][0], T[2][1], T[2][2], T[2][3],
    0, 0, 0, 1,
  );
  return m;
}

function fromMatrix4(m) {
  const e = m.elements; // column-major
  return [
    [e[0], e[4], e[8], e[12]],
    [e[1], e[5], e[9], e[13]],
    [e[2], e[6], e[10], e[14]],
    [0, 0, 0, 1],
  ];
}

export class Viewport {
  constructor(container, { onSelect, onTargetDrag, onTargetDragEnd } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onTargetDrag = onTargetDrag;
    this.onTargetDragEnd = onTargetDragEnd;
    this.showFrames = true;
    this.scaleHint = 0.5;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.005, 200);
    this.camera.up.copy(Z_UP);
    this.camera.position.set(1.6, -1.6, 1.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.target.set(0, 0, 0.35);

    // lights
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, -3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8d8ff, 0.8);
    rim.position.set(-3, 2, 1.5);
    this.scene.add(rim);

    this.grid = new THREE.Group();
    this.scene.add(this.grid);
    this.robotGroup = new THREE.Group();
    this.scene.add(this.robotGroup);
    this.workspaceGroup = new THREE.Group();
    this.scene.add(this.workspaceGroup);

    this.materials = {
      link: new THREE.MeshStandardMaterial({ color: 0xe9ecf2, metalness: 0.15, roughness: 0.45 }),
      linkDark: new THREE.MeshStandardMaterial({ color: 0x3b3f47, metalness: 0.3, roughness: 0.5 }),
      revolute: new THREE.MeshStandardMaterial({ color: 0x1473e6, metalness: 0.2, roughness: 0.35 }),
      prismatic: new THREE.MeshStandardMaterial({ color: 0xe68619, metalness: 0.2, roughness: 0.35 }),
      fixed: new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.2, roughness: 0.4 }),
      matrix: new THREE.MeshStandardMaterial({ color: 0x8e4ae0, metalness: 0.2, roughness: 0.35 }),
      selected: new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0x552200, metalness: 0.2, roughness: 0.3 }),
      base: new THREE.MeshStandardMaterial({ color: 0x2c2f36, metalness: 0.4, roughness: 0.5 }),
      ee: new THREE.MeshStandardMaterial({ color: 0xe34850, metalness: 0.1, roughness: 0.3 }),
      target: new THREE.MeshStandardMaterial({ color: 0x2d9d78, transparent: true, opacity: 0.35, depthWrite: false }),
      error: new THREE.MeshStandardMaterial({ color: 0xd7373f, metalness: 0.1, roughness: 0.4 }),
    };
    this.geo = {
      cyl: new THREE.CylinderGeometry(1, 1, 1, 28),
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 24, 16),
    };

    // IK target gizmo
    this.target = new THREE.Group();
    const tSphere = new THREE.Mesh(this.geo.sphere, this.materials.target);
    tSphere.scale.setScalar(0.035);
    this.target.add(tSphere);
    this.target.add(this._axes(0.12, 2.5, 0.9));
    this.target.visible = false;
    this.scene.add(this.target);

    this.tcontrols = new TransformControls(this.camera, this.renderer.domElement);
    this.tcontrols.setSpace('local');
    this.tcontrols.setSize(0.8);
    this.tcontrols.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (!e.value && this.onTargetDragEnd) this.onTargetDragEnd(this.getTarget());
    });
    this.tcontrols.addEventListener('objectChange', () => {
      if (this.onTargetDrag) this.onTargetDrag(this.getTarget());
    });
    this.tcontrolsHelper = this.tcontrols.getHelper ? this.tcontrols.getHelper() : this.tcontrols;
    this.scene.add(this.tcontrolsHelper);

    // picking
    this.raycaster = new THREE.Raycaster();
    let down = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      if (this.tcontrols.dragging) return;
      this._pick(e);
    });

    this.applyTheme();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(container);
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  applyTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    this.scene.background = new THREE.Color(dark ? 0x1b1c1f : 0xfafbfc);
    this.materials.link.color.set(dark ? 0xc9ced8 : 0xe2e6ee);
    this._buildGrid(dark);
  }

  _buildGrid(dark) {
    this.grid.clear();
    const size = Math.max(2, Math.ceil(this.scaleHint * 4));
    const g = new THREE.GridHelper(size, size * 10, dark ? 0x3a3d44 : 0xd5d9e0, dark ? 0x26282d : 0xeceef2);
    g.rotation.x = Math.PI / 2;
    this.grid.add(g);
    const big = new THREE.GridHelper(size, size, dark ? 0x4a4e57 : 0xc2c7d0, dark ? 0x4a4e57 : 0xc2c7d0);
    big.rotation.x = Math.PI / 2;
    big.position.z = 0.0005;
    this.grid.add(big);
    const k = Math.max(0.2, this.scaleHint);
    this.grid.add(this._axes(0.25 * k, 1.6 * k, 0.9));
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _axes(len, width = 1.5, opacity = 1) {
    const group = new THREE.Group();
    const r = 0.004 * width;
    const mk = (color, dir) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
      const shaft = new THREE.Mesh(this.geo.cyl, mat);
      shaft.scale.set(r, len, r);
      shaft.position.y = len / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, len * 0.18, 16), mat);
      tip.position.y = len;
      const arm = new THREE.Group();
      arm.add(shaft, tip);
      arm.quaternion.setFromUnitVectors(Y_AXIS, dir);
      group.add(arm);
    };
    mk(0xe34850, new THREE.Vector3(1, 0, 0));
    mk(0x2d9d78, new THREE.Vector3(0, 1, 0));
    mk(0x1473e6, new THREE.Vector3(0, 0, 1));
    return group;
  }

  _cylinderBetween(a, b, radius, material) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-6) return null;
    const mesh = new THREE.Mesh(this.geo.cyl, material);
    mesh.scale.set(radius, len, radius);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, vb.clone().sub(va).normalize());
    return mesh;
  }

  // scene = { frames, ee, geometry: jointGeometry[], selectedId, errorIds:Set }
  update(scene) {
    const g = this.robotGroup;
    g.traverse((o) => { if (o.isMesh && o.userData.ownsGeometry) o.geometry.dispose(); });
    g.clear();

    // characteristic size -> radii
    const pts = scene.frames.map((T) => [T[0][3], T[1][3], T[2][3]]);
    // scene.size is pose-independent, so radii stay fixed while joints move
    let s = scene.size;
    if (!(s > 0)) { s = 0; for (const p of pts) s = Math.max(s, Math.hypot(...p)); }
    s = Math.max(0.15, s);
    this.scaleHint = s;
    const rLink = 0.014 * s, rJoint = 0.03 * s, hJoint = 0.075 * s;

    // base plate
    const base = scene.frames[0];
    const plate = new THREE.Mesh(this.geo.cyl, this.materials.base);
    plate.scale.set(rJoint * 2, rJoint * 0.6, rJoint * 2);
    const plateHolder = new THREE.Group();
    plateHolder.add(plate);
    plate.rotation.x = Math.PI / 2;
    plate.position.z = -rJoint * 0.3;
    plateHolder.matrixAutoUpdate = false;
    plateHolder.matrix.copy(toMatrix4(base));
    plateHolder.userData.pick = 'base';
    plate.userData.pick = 'base';
    g.add(plateHolder);

    for (const jg of scene.geometry) {
      const j = jg.link.joint;
      const selected = scene.selectedId === j.id;
      const hasErr = scene.errorIds?.has(j.id);
      // links (path segments)
      for (let i = 0; i < jg.path.length - 1; i++) {
        const m = this._cylinderBetween(jg.path[i], jg.path[i + 1], rLink, selected ? this.materials.selected : this.materials.link);
        if (m) { m.userData.pick = j.id; g.add(m); }
      }
      // joint body
      let mat = this.materials[j.mode === 'matrix' ? 'matrix' : j.type];
      if (hasErr) mat = this.materials.error;
      if (selected) mat = this.materials.selected;
      const axis = new THREE.Vector3(...jg.axis).normalize();
      let body;
      if (j.type === 'revolute') {
        body = new THREE.Mesh(this.geo.cyl, mat);
        body.scale.set(rJoint, hJoint, rJoint);
      } else if (j.type === 'prismatic') {
        body = new THREE.Mesh(this.geo.box, mat);
        body.scale.set(rJoint * 1.5, hJoint * 1.2, rJoint * 1.5);
      } else {
        body = new THREE.Mesh(this.geo.sphere, mat);
        body.scale.setScalar(rJoint * 0.6);
      }
      body.position.set(...jg.at);
      if (axis.lengthSq() > 0) body.quaternion.setFromUnitVectors(Y_AXIS, axis);
      body.userData.pick = j.id;
      g.add(body);
    }

    // frames
    if (this.showFrames) {
      scene.frames.forEach((T, i) => {
        const a = this._axes(0.045 * s, 0.55 * s, i === 0 ? 1 : 0.85);
        a.matrixAutoUpdate = false;
        a.matrix.copy(toMatrix4(T));
        g.add(a);
      });
    }

    // end effector
    const ee = new THREE.Group();
    const tip = new THREE.Mesh(this.geo.sphere, this.materials.ee);
    tip.scale.setScalar(rJoint * 0.55);
    tip.userData.pick = 'tool';
    ee.add(tip);
    ee.add(this._axes(0.075 * s, 0.85 * s));
    ee.matrixAutoUpdate = false;
    ee.matrix.copy(toMatrix4(scene.ee));
    g.add(ee);
    const lastFrame = scene.frames[scene.frames.length - 1];
    const toolLine = this._cylinderBetween([lastFrame[0][3], lastFrame[1][3], lastFrame[2][3]], [scene.ee[0][3], scene.ee[1][3], scene.ee[2][3]], rLink * 0.6, this.materials.linkDark);
    if (toolLine) { toolLine.userData.pick = 'tool'; g.add(toolLine); }

    // gizmo scale tracks robot size
    this.target.children[0].scale.setScalar(0.045 * s);
    this.target.children[1].scale.setScalar(s * 0.7);
  }

  setWorkspace(points) {
    this.workspaceGroup.clear();
    if (!points) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const colors = new Float32Array(points.length);
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 2; i < points.length; i += 3) { zmin = Math.min(zmin, points[i]); zmax = Math.max(zmax, points[i]); }
    const c = new THREE.Color();
    for (let i = 0; i < points.length; i += 3) {
      const t = zmax > zmin ? (points[i + 2] - zmin) / (zmax - zmin) : 0.5;
      c.setHSL(0.62 - t * 0.5, 0.75, 0.55);
      colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pts = new THREE.Points(geom, new THREE.PointsMaterial({ size: 0.006 * this.scaleHint + 0.003, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
    this.workspaceGroup.add(pts);
  }

  setTargetVisible(visible, mode = 'translate') {
    this.target.visible = visible;
    if (visible) {
      this.tcontrols.attach(this.target);
      this.tcontrols.setMode(mode);
    } else {
      this.tcontrols.detach();
    }
  }

  setTarget(T) {
    const m = toMatrix4(T);
    m.decompose(this.target.position, this.target.quaternion, this.target.scale);
    this.target.scale.set(1, 1, 1);
  }

  getTarget() {
    this.target.updateMatrix();
    const m = new THREE.Matrix4().compose(this.target.position, this.target.quaternion, new THREE.Vector3(1, 1, 1));
    return fromMatrix4(m);
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.robotGroup.children, true);
    const hit = hits.find((h) => h.object.userData.pick);
    if (this.onSelect) this.onSelect(hit ? hit.object.userData.pick : null);
  }

  // Camera presets ----------------------------------------------------
  frame(view = 'iso') {
    const box = new THREE.Box3().setFromObject(this.robotGroup);
    if (this.workspaceGroup.children.length) box.union(new THREE.Box3().setFromObject(this.workspaceGroup));
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, -0.3, 0), new THREE.Vector3(0.3, 0.3, 0.6));
    box.expandByPoint(new THREE.Vector3(0, 0, 0));
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(0.35, box.getSize(new THREE.Vector3()).length());
    const dist = size * 1.45;
    const dirs = {
      iso: new THREE.Vector3(1, -1.1, 0.8),
      front: new THREE.Vector3(0, -1, 0.0001),
      side: new THREE.Vector3(1, 0, 0.0001),
      top: new THREE.Vector3(0.0001, -0.0001, 1),
    };
    const d = (dirs[view] || dirs.iso).clone().normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.updateProjectionMatrix();
    this._buildGrid(document.documentElement.dataset.theme === 'dark');
  }

  getCamera() {
    return { position: this.camera.position.toArray(), target: this.controls.target.toArray() };
  }

  setCamera(c) {
    this.camera.position.fromArray(c.position);
    this.controls.target.fromArray(c.target);
    this.controls.update();
  }

  zoom(factor) {
    const t = this.controls.target;
    this.camera.position.sub(t).multiplyScalar(factor).add(t);
  }

  clientToInside(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
}
