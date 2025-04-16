// Fragment shader pour colorer les particules
precision mediump float;

varying float vAttract;
varying vec3 vColor;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;

  vec3 color = mix(vec3(0.1, 0.8, 0.4), vec3(0.8, 0.1, 0.6), vAttract * 0.01);
  gl_FragColor = vec4(color, 1.0 - dist);
}
