import { GPUComputeRenderer } from 'gpuParticleSim.js';
import * as THREE from 'https://unpkg.com/three@0.157.0/build/three.module.js';

let scene, camera, renderer, gpuCompute;
let positionVariable, particleUniforms;
let PARTICLE_COUNT = 128 * 2;
let windowId = Math.random().toString(36).slice(2);
let myPos = { x: 0, y: 0 }, otherPos = null;

// SCREEN POSITION LOGIC
async function getScreenPosition() {
  if ('getScreenDetails' in window) {
    const details = await window.getScreenDetails();
    return { x: window.screenLeft + details.currentScreen.availLeft, y: window.screenTop + details.currentScreen.availTop };
  }
  return { x: window.screenX, y: window.screenY };
}

function initThree() {
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.z = 300;
}

function initParticles() {
  gpuCompute = new GPUComputeRenderer(PARTICLE_COUNT, PARTICLE_COUNT, renderer);
  let dtPosition = gpuCompute.createTexture();
  fillPositionTexture(dtPosition);

  positionVariable = gpuCompute.addVariable("texturePosition", document.getElementById('positionFragment').textContent, dtPosition);
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable]);

  particleUniforms = positionVariable.material.uniforms;
  particleUniforms.time = { value: 0 };
  particleUniforms.attraction = { value: 0 };

  gpuCompute.init();
  createParticleSystem();
}

function fillPositionTexture(texture) {
  let data = texture.image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (Math.random() - 0.5) * 200;
    data[i + 1] = (Math.random() - 0.5) * 200;
    data[i + 2] = (Math.random() - 0.5) * 200;
    data[i + 3] = 1;
  }
}

let particleMesh;
function createParticleSystem() {
  let geometry = new THREE.BufferGeometry();
  let positions = new Float32Array(PARTICLE_COUNT * PARTICLE_COUNT * 3);
  let uvs = new Float32Array(PARTICLE_COUNT * PARTICLE_COUNT * 2);

  let p = 0;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    for (let j = 0; j < PARTICLE_COUNT; j++) {
      uvs[p * 2] = i / PARTICLE_COUNT;
      uvs[p * 2 + 1] = j / PARTICLE_COUNT;
      p++;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  let material = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      pointSize: { value: 2 }
    },
    vertexShader: document.getElementById('renderVertex').textContent,
    fragmentShader: document.getElementById('renderFragment').textContent,
    transparent: true
  });

  particleMesh = new THREE.Points(geometry, material);
  scene.add(particleMesh);
}

function animate() {
  requestAnimationFrame(animate);

  getScreenPosition().then(pos => {
    myPos = pos;
    localStorage.setItem(`entangled-${windowId}`, JSON.stringify(myPos));
    for (let key in localStorage) {
      if (key.startsWith("entangled-") && key !== `entangled-${windowId}`) {
        try {
          otherPos = JSON.parse(localStorage.getItem(key));
        } catch (e) {}
      }
    }

    if (otherPos) {
      let dx = myPos.x - otherPos.x;
      let dy = myPos.y - otherPos.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      let attraction = Math.max(0, 1 - d / 1000);
      particleUniforms.attraction.value = attraction;
    }
  });

  particleUniforms.time.value += 0.01;
  gpuCompute.compute();
  particleMesh.material.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;

  renderer.render(scene, camera);
}

initThree();
initParticles();
animate();
