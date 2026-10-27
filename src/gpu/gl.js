// Hilfsfunktionen für WebGL2: Shader-Programme, Zustandstexturen und Ping-Pong-Puffer

// preserveDrawingBuffer: das Bild bleibt nach dem Zeichnen stehen, damit Zuschauer-Fenster
// und Aufnahme es auch außerhalb von requestAnimationFrame abgreifen können
const CONTEXT_ATTRIBUTES = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
};

// Ein Dreieck, das den ganzen Viewport abdeckt; die Eckpunkte kommen aus gl_VertexID, daher ohne Vertex-Buffer
const FULLSCREEN_VS = `#version 300 es
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Gemeinsamer Anfang aller Fragment-Shader
export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 outColor;
`;

// Zufallszahl 0–1 pro Zelle (pcg3d-Hash); salt wechselt bei jedem Aufruf, sonst gäbe es immer dasselbe Muster
export const GLSL_RANDOM = `
uint hash(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v.x;
}

float random(ivec2 p, uint salt) {
    return float(hash(uvec3(uvec2(p), salt)) >> 8u) / 16777216.0;
}
`;

// [r, g, b] (0–255) als GLSL-Konstante
export function glslColor([r, g, b]) {
    return `vec3(${(r / 255).toFixed(6)}, ${(g / 255).toFixed(6)}, ${(b / 255).toFixed(6)})`;
}

// '#rrggbb' → [r, g, b] im Bereich 0–1 für uniform3fv
export function hexToRgb(hex) {
    const value = parseInt(hex.slice(1, 7), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

// Prüft auf einem Wegwerf-Canvas, ob WebGL2 mit Float-Rendertargets verfügbar ist
// (nicht auf dem echten Canvas, sonst wäre dieser für einen 2D-Fallback gesperrt)
export function isGpuSupported() {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    const supported = Boolean(gl && gl.getExtension('EXT_color_buffer_float'));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return supported;
}

// Liefert den WebGL2-Kontext des Canvas; mehrfache Aufrufe geben denselben Kontext zurück
export function getGL(canvas) {
    const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
    if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt.');
    gl.getExtension('EXT_color_buffer_float'); // erlaubt das Rendern in R32F-Texturen
    return gl;
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader konnte nicht kompiliert werden:\n${log}`);
    }
    return shader;
}

function createProgram(gl, fragmentSource) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VS);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Shader-Programm konnte nicht gelinkt werden:\n${log}`);
    }

    // Uniform-Positionen einmalig nachschlagen
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        const { name } = gl.getActiveUniform(program, i);
        uniforms[name] = gl.getUniformLocation(program, name);
    }

    return { program, uniforms };
}

// Programme pro Kontext zwischenspeichern, damit ein Wechsel des Automaten nicht neu kompiliert
const programCache = new WeakMap();

export function getProgram(gl, fragmentSource) {
    let cache = programCache.get(gl);
    if (!cache) {
        cache = new Map();
        programCache.set(gl, cache);
    }
    if (!cache.has(fragmentSource)) {
        cache.set(fragmentSource, createProgram(gl, fragmentSource));
    }
    return cache.get(fragmentSource);
}

// Textur mit einem Float-Wert pro Zelle plus Framebuffer, um hineinzurendern
// Ohne data ist die Textur mit 0 gefüllt (garantiert WebGL)
function createTarget(gl, width, height, data = null) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture, framebuffer, width, height };
}

// Zwei Texturen im Wechsel: aus read lesen, in write schreiben, danach swap()
// Texel (x, y) entspricht Zelle (Spalte c, Zeile r), Zeile 0 ist oben
export class PingPong {
    constructor(gl, width, height) {
        this.gl = gl;
        this.width = width;
        this.height = height;
        this.read = createTarget(gl, width, height);
        this.write = createTarget(gl, width, height);
    }

    swap() {
        [this.read, this.write] = [this.write, this.read];
    }

    // Überschreibt den aktuellen Zustand mit Werten aus dem Arbeitsspeicher (Zeile für Zeile)
    upload(data) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.read.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RED, gl.FLOAT, data);
    }

    destroy() {
        const gl = this.gl;
        [this.read, this.write].forEach(({ texture, framebuffer }) => {
            gl.deleteFramebuffer(framebuffer);
            gl.deleteTexture(texture);
        });
    }
}

// 256 Farben aus Palettenstufen [[t, [r, g, b]], ...] als 256×1-Textur
export function createPaletteTexture(gl, stops) {
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
        const v = i / 255;
        for (let s = 0; s < stops.length - 1; s++) {
            const [t0, c0] = stops[s];
            const [t1, c1] = stops[s + 1];
            if (v <= t1) {
                const t = (v - t0) / (t1 - t0);
                data[i * 4]     = Math.round(c0[0] + (c1[0] - c0[0]) * t);
                data[i * 4 + 1] = Math.round(c0[1] + (c1[1] - c0[1]) * t);
                data[i * 4 + 2] = Math.round(c0[2] + (c1[2] - c0[2]) * t);
                break;
            }
        }
        data[i * 4 + 3] = 255;
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
}
