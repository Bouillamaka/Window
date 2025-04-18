import * as THREE from 'https://unpkg.com/three@0.157.0/build/three.module.js';

// Class for GPU Computation
class GPUComputationRenderer {
  constructor(sizeX, sizeY, renderer) {
    this.variables = [];
    this.currentTextureIndex = 0;
    this.renderer = renderer;
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    
    // Create render targets
    this.createRenderTargets();
  }

  createRenderTargets() {
    const sizeX = this.sizeX;
    const sizeY = this.sizeY;
    
    const dataType = THREE.FloatType;
    const renderTargetOptions = {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: dataType,
      depthBuffer: false
    };
    
    // Create pass-through shader
    this.passThruUniforms = {
      passThruTexture: { value: null }
    };
    
    this.passThruShader = new THREE.ShaderMaterial({
      uniforms: this.passThruUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D passThruTexture;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(passThruTexture, vUv);
          gl_FragColor = color;
        }
      `
    });
    
    // Setup render-to-texture scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeometry, this.passThruShader);
    this.scene.add(this.quad);
  }

  // Creates a texture to hold data
  createTexture() {
    const sizeX = this.sizeX;
    const sizeY = this.sizeY;
    const data = new Float32Array(sizeX * sizeY * 4);
    
    const texture = new THREE.DataTexture(
      data, 
      sizeX, 
      sizeY, 
      THREE.RGBAFormat, 
      THREE.FloatType
    );
    
    texture.needsUpdate = true;
    return texture;
  }

  // Adds a variable to the computation
  addVariable(variableName, fragmentShader, initialValueTexture) {
    // Get the vertex shader
    const vertexShader = document.getElementById('positionVertexShader').textContent;
    
    // Create material for the computation
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        attraction: { value: 0 }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader
    });
    
    // Define resolution in shader
    material.defines.resolution = `vec2(${this.sizeX.toFixed(1)}, ${this.sizeY.toFixed(1)})`;
    
    // Create variable object
    const variable = {
      name: variableName,
      initialValueTexture: initialValueTexture,
      material: material,
      dependencies: null,
      renderTargets: [],
      wrapS: null,
      wrapT: null,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter
    };
    
    // Create render targets for ping-pong
    variable.renderTargets[0] = this.createRenderTarget();
    variable.renderTargets[1] = this.createRenderTarget();
    
    // Render initial data
    this.renderTexture(initialValueTexture, variable.renderTargets[0]);
    this.renderTexture(initialValueTexture, variable.renderTargets[1]);
    
    this.variables.push(variable);
    return variable;
  }

  // Sets dependencies for a variable
  setVariableDependencies(variable, dependencies) {
    variable.dependencies = dependencies;
    
    const material = variable.material;
    const uniforms = material.uniforms;
    
    // Add dependency uniforms
    for (let i = 0; i < dependencies.length; i++) {
      const depVar = dependencies[i];
      uniforms[depVar.name] = { value: null };
      
      // Only add sampler to fragment shader if not already there
      if (depVar.name === variable.name) {
        // For the self-dependency, the uniform is already assumed by the shader
        continue;
      }
      
      // Add sampler to fragment shader for non-self dependencies
      material.fragmentShader = 
        `uniform sampler2D ${depVar.name};\n` + material.fragmentShader;
    }
  }

  // Creates a render target
  createRenderTarget() {
    return new THREE.WebGLRenderTarget(this.sizeX, this.sizeY, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false
    });
  }

  // Renders a texture to a render target
  renderTexture(input, output) {
    this.passThruUniforms.passThruTexture.value = input;
    this.render(this.passThruShader, output);
  }

  // Performs computation
  compute() {
    const currentTextureIndex = this.currentTextureIndex;
    const nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;
    
    for (let i = 0; i < this.variables.length; i++) {
      const variable = this.variables[i];
      
      // Set dependent textures
      if (variable.dependencies !== null) {
        const uniforms = variable.material.uniforms;
        
        for (let j = 0; j < variable.dependencies.length; j++) {
          const depVar = variable.dependencies[j];
          uniforms[depVar.name].value = depVar.renderTargets[currentTextureIndex].texture;
        }
      }
      
      // Perform computation
      this.render(variable.material, variable.renderTargets[nextTextureIndex]);
    }
    
    this.currentTextureIndex = nextTextureIndex;
  }

  // Get current state
  getCurrentRenderTarget(variable) {
    return variable.renderTargets[this.currentTextureIndex];
  }

  // Render using this renderer
  render(material, renderTarget) {
    this.quad.material = material;
    const oldTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(oldTarget);
  }

  // Initialize computation
  init() {
    // Nothing special needed here for our simple case
    return null;
  }
}

// Main application
class EntangledParticles {
  constructor() {
    this.PARTICLE_COUNT = 128; // Size of the computation texture
    this.windowId = Math.random().toString(36).slice(2);
    this.myPos = { x: 0, y: 0 };
    this.otherPos = null;
    this.isAnimating = true;
    this.clock = new THREE.Clock();
    
    this.infoElement = document.getElementById('info');
    
    this.init();
    this.animate();
  }
  
  init() {
    // Create scene
    this.scene = new THREE.Scene();
    
    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      1, 
      3000
    );
    this.camera.position.z = 500;
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    document.body.appendChild(this.renderer.domElement);
    
    // Initialize particles
    this.initParticles();
    
    // Set up event listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Set up environment
    this.setupEnvironment();
  }
  
  setupEnvironment() {
    // Add subtle ambient light
    const ambientLight = new THREE.AmbientLight(0x222222);
    this.scene.add(ambientLight);
    
    // Add point light
    const pointLight = new THREE.PointLight(0xffffff, 1, 1000);
    pointLight.position.set(100, 100, 100);
    this.scene.add(pointLight);
  }
  
  initParticles() {
    // Create GPU computation renderer
    this.gpuCompute = new GPUComputationRenderer(
      this.PARTICLE_COUNT, 
      this.PARTICLE_COUNT, 
      this.renderer
    );
    
    // Create initial position texture
    const positionTexture = this.gpuCompute.createTexture();
    this.fillPositionTexture(positionTexture);
    
    // Add position variable
    this.positionVariable = this.gpuCompute.addVariable(
      'texturePosition',
      document.getElementById('positionFragmentShader').textContent,
      positionTexture
    );
    
    // Set variable dependencies
    this.gpuCompute.setVariableDependencies(
      this.positionVariable, 
      [this.positionVariable]
    );
    
    // Add custom uniforms
    this.positionUniforms = this.positionVariable.material.uniforms;
    this.positionUniforms.time = { value: 0 };
    this.positionUniforms.attraction = { value: 0 };
    
    // Initialize computation
    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error(error);
    }
    
    // Create particle system
    this.createParticleSystem();
  }
  
  fillPositionTexture(texture) {
    const data = texture.image.data;
    
    for (let i = 0; i < data.length; i += 4) {
      // Random position in a sphere
      const radius = 200 * Math.random();
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      data[i] = radius * Math.sin(phi) * Math.cos(theta); // x
      data[i + 1] = radius * Math.sin(phi) * Math.sin(theta); // y
      data[i + 2] = radius * Math.cos(phi); // z
      data[i + 3] = 1; // w
    }
  }
  
  createParticleSystem() {
    // Create geometry for particles
    const geometry = new THREE.BufferGeometry();
    
    // Total number of particles
    const totalParticles = this.PARTICLE_COUNT * this.PARTICLE_COUNT;
    
    // Create position attribute (will be updated in the shader)
    const positions = new Float32Array(totalParticles * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Create UVs for accessing the texture
    const uvs = new Float32Array(totalParticles * 2);
    let p = 0;
    for (let j = 0; j < this.PARTICLE_COUNT; j++) {
      for (let i = 0; i < this.PARTICLE_COUNT; i++) {
        uvs[p++] = i / (this.PARTICLE_COUNT - 1);
        uvs[p++] = j / (this.PARTICLE_COUNT - 1);
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    
    // Create material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        texturePosition: { value: null },
        pointSize: { value: 2.0 }
      },
      vertexShader: document.getElementById('particleVertexShader').textContent,
      fragmentShader: document.getElementById('particleFragmentShader').textContent,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    
    // Create particle system
    this.particleSystem = new THREE.Points(geometry, material);
    this.scene.add(this.particleSystem);
  }
  
  // Get screen position
  async getScreenPosition() {
    if ('getScreenDetails' in window) {
      try {
        const details = await window.getScreenDetails();
        return { 
          x: window.screenLeft + details.currentScreen.availLeft, 
          y: window.screenTop + details.currentScreen.availTop 
        };
      } catch (e) {
        return { x: window.screenX, y: window.screenY };
      }
    }
    return { x: window.screenX, y: window.screenY };
  }
  
  // Handle window resize
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  // Animation loop
  animate() {
    if (!this.isAnimating) return;
    
    requestAnimationFrame(this.animate.bind(this));
    this.render();
  }
  
  // Main render function
  render() {
    // Update screen position
    this.getScreenPosition().then(pos => {
      this.myPos = pos;
      
      // Store position in localStorage to communicate with other windows
      localStorage.setItem(`entangled-${this.windowId}`, JSON.stringify(this.myPos));
      
      // Check for other windows
      for (let key in localStorage) {
        if (key.startsWith("entangled-") && key !== `entangled-${this.windowId}`) {
          try {
            const newPos = JSON.parse(localStorage.getItem(key));
            
            // If this is our first detection or it's a different position
            if (!this.otherPos || 
                newPos.x !== this.otherPos.x || 
                newPos.y !== this.otherPos.y) {
              this.otherPos = newPos;
              this.updateInfo();
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
      
      // Update attraction force based on window positions
      if (this.otherPos) {
        const dx = this.myPos.x - this.otherPos.x;
        const dy = this.myPos.y - this.otherPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate attraction factor (stronger when windows are closer)
        const attractionFactor = Math.max(0, 1 - distance / 1000);
        this.positionUniforms.attraction.value = attractionFactor;
      }
    });
    
    // Update time
    const time = this.clock.getElapsedTime();
    this.positionUniforms.time.value = time;
    
    // Slowly rotate particle system for visual effect
    this.particleSystem.rotation.y = time * 0.05;
    
    // Compute particle positions on GPU
    this.gpuCompute.compute();
    
    // Update material with new position texture
    this.particleSystem.material.uniforms.texturePosition.value = 
      this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
  }
  
  // Update info display
  updateInfo() {
    if (this.otherPos) {
      const dx = this.myPos.x - this.otherPos.x;
      const dy = this.myPos.y - this.otherPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      this.infoElement.innerHTML = `
        Entangled Particles Simulation<br>
        Connection detected: ${distance.toFixed(0)}px away<br>
        Entanglement strength: ${Math.max(0, (1 - distance / 1000)).toFixed(2)}
      `;
    } else {
      this.infoElement.textContent = "Entangled Particles Simulation";
    }
  }
}

// Start application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new EntangledParticles();
});