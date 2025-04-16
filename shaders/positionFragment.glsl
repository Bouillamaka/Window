// Simule la nouvelle position de chaque particule
uniform float time;
uniform float attraction;
uniform sampler2D texturePosition;

varying vec2 vUv;

void main() {
  vec4 pos = texture2D(texturePosition, vUv);

  // Vibration simple autour de la position de base
  float freq = 2.0;
  vec3 offset = vec3(
    sin(time + pos.x * 0.1) * 0.5,
    cos(time + pos.y * 0.1) * 0.5,
    sin(time + pos.z * 0.1) * 0.5
  );

  // Attraction vers le centre
  vec3 toCenter = -normalize(pos.xyz) * attraction * 0.5;

  pos.xyz += offset * 0.1 + toCenter;

  gl_FragColor = pos;
}
