// Vertex shader pour rendre chaque particule
uniform sampler2D texturePosition;
uniform float pointSize;

varying float vAttract;
varying vec3 vColor;

void main() {
  vec4 pos = texture2D(texturePosition, uv);
  vAttract = length(pos.xyz);
  vColor = normalize(pos.xyz);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos.xyz, 1.0);
  gl_PointSize = pointSize + (1.5 - vAttract * 0.05);
}
