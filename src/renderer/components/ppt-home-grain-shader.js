const vertexSource = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragmentSource = `
  precision highp float;
  uniform vec2 resolution;
  uniform vec2 scale;
  uniform vec4 composer;
  uniform vec3 pointer;
  uniform float corner;
  uniform float time;
  uniform float focus;
  uniform float lightTheme;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
      mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y
    );
  }

  void main() {
    vec2 p = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y) / scale;
    vec2 fromPointer = p - pointer.xy;
    float ripple = (1.0 - smoothstep(4.0, 114.0, length(fromPointer))) * pointer.z;
    vec2 grainPoint = (p - fromPointer * ripple * 0.12) / 1.08;
    vec2 cell = floor(grainPoint);
    float seed = hash(cell);
    float otherSeed = hash(cell + 19.81);
    vec2 center = 0.5 + (vec2(seed, otherSeed) - 0.5) * 0.19;
    float radius = mix(0.45, 0.62, seed);
    float grain = 1.0 - smoothstep(radius * 0.18, radius + 0.14, length(fract(grainPoint) - center));

    // Separate fields drift at unrelated speeds, while individual grains keep their own tempo.
    float cool = noise(p * 0.0037 + vec2(-0.034, 0.021) * time);
    float rose = noise(p * 0.0051 + vec2(0.026, 0.039) * time + 26.4);
    float warm = noise(p * 0.0024 + vec2(-0.017, -0.026) * time + 73.8);
    float twinkle = 0.5 + 0.5 * sin(time * (0.29 + seed * 1.13) + otherSeed * 6.283);
    float tint = sin(time * (0.14 + otherSeed * 0.37) + seed * 6.283) * 0.10;
    vec3 cyan = vec3(0.18, 0.80, 0.94);
    vec3 indigo = vec3(0.37, 0.40, 0.98);
    vec3 pink = vec3(0.95, 0.32, 0.77);
    vec3 amber = vec3(0.99, 0.59, 0.31);
    vec3 color = mix(cyan, indigo, smoothstep(0.23, 0.76, cool + tint));
    color = mix(color, pink, smoothstep(0.34, 0.86, rose - tint) * 0.82);
    color = mix(color, amber, smoothstep(0.65, 0.90, warm) * smoothstep(0.28, 0.84, rose) * 0.62);
    color = mix(color, vec3(0.84, 0.92, 1.0), grain * twinkle * 0.18);
    color *= mix(1.0, 0.67, lightTheme);

    vec2 fromComposer = p - composer.xy;
    vec2 q = abs(fromComposer) - composer.zw + corner;
    float edgeDistance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float reading = mix(0.24, 1.0, smoothstep(-29.0, 51.0, edgeDistance));
    float dustAlpha = grain * ((0.065 + twinkle * 0.11 + seed * 0.06) * reading + ripple * 0.19);

    // Draw light directly around the rounded contour and let it dissolve across the edge.
    vec2 normalized = fromComposer / max(composer.zw, vec2(1.0));
    float angle = atan(normalized.y, normalized.x + 0.00001);
    float sweep = angle - time * 0.21 - 0.45;
    float arc = pow(max(0.0, cos(sweep)), 7.0);
    float echo = pow(max(0.0, cos(sweep + 2.7)), 5.0);
    float distanceToEdge = abs(edgeDistance);
    float haze = exp(-distanceToEdge / (7.5 + focus * 4.0));
    float core = 1.0 - smoothstep(0.3, 3.1 + focus * 0.9, distanceToEdge);
    float edgeAlpha = haze * (0.042 + (arc + echo * 0.6) * (0.085 + focus * 0.13));
    edgeAlpha += core * (0.009 + arc * (0.10 + focus * 0.36) + echo * 0.066);
    vec3 edgeColor = mix(cyan, pink, 0.5 + 0.5 * cos(sweep + 1.1));
    edgeColor *= mix(1.0, 0.60, lightTheme);
    float alpha = edgeAlpha + dustAlpha * (1.0 - edgeAlpha);
    vec3 combined = (edgeColor * edgeAlpha + color * dustAlpha * (1.0 - edgeAlpha)) / max(alpha, 0.0001);
    gl_FragColor = vec4(combined, alpha);
  }
`

/** @param {HTMLCanvasElement} canvas */
export function createGrainRenderer(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
  })
  if (!gl) return null

  function compile(type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource)
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }

  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const location = (name) => gl.getUniformLocation(program, name)
  const uniforms = {
    resolution: location('resolution'),
    scale: location('scale'),
    composer: location('composer'),
    pointer: location('pointer'),
    corner: location('corner'),
    time: location('time'),
    focus: location('focus'),
    lightTheme: location('lightTheme'),
  }

  return {
    resize(width, height) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      gl.uniform2f(uniforms.scale, canvas.width / width, canvas.height / height)
    },
    draw(frame) {
      const { area, cursor, time, focus, light } = frame
      gl.uniform4f(uniforms.composer, area.x, area.y, area.width / 2, area.height / 2)
      gl.uniform1f(uniforms.corner, area.radius)
      gl.uniform3f(uniforms.pointer, cursor.x, cursor.y, cursor.strength)
      gl.uniform1f(uniforms.time, time)
      gl.uniform1f(uniforms.focus, focus)
      gl.uniform1f(uniforms.lightTheme, light ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
