import { GPU_RULES } from './gpuRules.js';
import { HEAT_STOPS } from './Automaton.js';
import { attachMouseBrush } from '../ui/MouseBrush.js';
import {
    GLSL_HEADER,
    GLSL_RANDOM,
    PingPong,
    createPaletteTexture,
    getGL,
    getProgram,
    glslColor,
    hexToRgb,
    isGpuSupported,
} from '../gpu/gl.js';

const BRUSH_MODES = ['spray', 'heat', 'storm', 'erase']; // Index = uMode im Pinsel-Shader
const HEAT_BACKGROUND = [5, 0, 16];

// Nächster Zustand für Automaten mit 8er-Nachbarschaft, rule() kommt aus gpuRules.js
// Ränder sind wie in rules.js umgewickelt
const stepShader = (ruleBody) => `${GLSL_HEADER}
uniform sampler2D uState;
uniform ivec2 uSize;

float cell(ivec2 p) {
    return texelFetch(uState, (p + uSize) % uSize, 0).r;
}

float rule(float self, int alive, int firing) {
${ruleBody}
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    int alive = 0;
    int firing = 0;
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;
            float v = cell(p + ivec2(dx, dy));
            if (v != 0.0) alive++;
            if (v == 1.0) firing++;
        }
    }
    outColor = vec4(rule(cell(p), alive, firing), 0.0, 0.0, 1.0);
}`;

// Wärme folgt den lebenden Zellen und zerfällt danach mit etwas Nachbar-Diffusion (wie Automaton.updateHeat)
const HEAT_SHADER = `${GLSL_HEADER}
uniform sampler2D uHeat;   // Wärme vor dem Schritt
uniform sampler2D uState;  // Gitter nach dem Schritt
uniform ivec2 uSize;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float heat = texelFetch(uHeat, p, 0).r;

    float neighborHeat = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;
            neighborHeat += texelFetch(uHeat, (p + ivec2(dx, dy) + uSize) % uSize, 0).r;
        }
    }
    neighborHeat /= 8.0;

    float next;
    if (texelFetch(uState, p, 0).r != 0.0) {
        next = min(1.0, heat + 0.4);
    } else {
        // Eigene Wärme zerfällt, nimmt aber etwas Nachbarwärme auf
        next = heat * 0.82 + neighborHeat * 0.12;
        if (next < 0.005) next = 0.0;
    }
    outColor = vec4(next, 0.0, 0.0, 1.0);
}`;

// Pinsel im Kreis um uCenter; Zellen außerhalb des Gitters gibt es in der Textur nicht, daher kein Umwickeln
const BRUSH_SHADER = `${GLSL_HEADER}
${GLSL_RANDOM}
uniform sampler2D uState;
uniform ivec2 uCenter;  // (Spalte, Zeile)
uniform int uRadius;
uniform int uMode;      // Index in BRUSH_MODES
uniform float uDensity;
uniform uint uSeed;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float v = texelFetch(uState, p, 0).r;
    ivec2 d = p - uCenter;

    if (d.x * d.x + d.y * d.y <= uRadius * uRadius) {
        if (uMode == 0) {
            if (random(p, uSeed) < uDensity) v = 1.0;  // spray
        } else if (uMode == 1) {
            v = 1.0;                                   // heat
        } else if (uMode == 2) {
            v = v != 0.0 ? 0.0 : 1.0;                  // storm
        } else {
            v = 0.0;                                   // erase
        }
    }
    outColor = vec4(v, 0.0, 0.0, 1.0);
}`;

// Aktiviert wenige tote Nachbarzellen von bereits aktiven Zellen (wie Automaton.randomizeGrid)
// Jede aktive Nachbarzelle bekommt einen eigenen Zufallswurf
const SPRINKLE_SHADER = `${GLSL_HEADER}
${GLSL_RANDOM}
uniform sampler2D uState;
uniform ivec2 uSize;
uniform float uDensity;
uniform uint uSeed;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float v = texelFetch(uState, p, 0).r;

    if (v == 0.0) {
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) continue;
                ivec2 q = p + ivec2(dx, dy);
                if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, uSize))) continue;
                uint salt = uSeed + uint((dy + 1) * 3 + dx + 1);
                if (texelFetch(uState, q, 0).r == 1.0 && random(p, salt) < uDensity) v = 1.0;
            }
        }
    }
    outColor = vec4(v, 0.0, 0.0, 1.0);
}`;

// Kopiert eine Textur in eine neue Größe; neue Zellen rechts/unten sind leer
const COPY_SHADER = `${GLSL_HEADER}
uniform sampler2D uSource;
uniform ivec2 uSourceSize;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float v = 0.0;
    if (all(lessThan(p, uSourceSize))) v = texelFetch(uSource, p, 0).r;
    outColor = vec4(v, 0.0, 0.0, 1.0);
}`;

// Zeichnet das Gitter auf die Canvas: jede Zelle als Quadrat der Kantenlänge uCellSize
// gl_FragCoord zählt von unten, das Gitter von oben, daher wird y gespiegelt
const RENDER_SHADER = `${GLSL_HEADER}
uniform sampler2D uState;
uniform sampler2D uHeat;
uniform sampler2D uPalette;
uniform ivec2 uSize;
uniform int uCellSize;
uniform int uCanvasHeight;
uniform bool uHeatEnabled;
uniform vec3 uAlive;
uniform vec3 uDead;
uniform vec3 uAccent;

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    ivec2 cell = ivec2(px.x, uCanvasHeight - 1 - px.y) / uCellSize;
    bool inside = all(lessThan(cell, uSize));

    // Wärme-Schicht statt lebendig/tot
    if (uHeatEnabled) {
        vec3 color = ${glslColor(HEAT_BACKGROUND)};
        if (inside) {
            float h = texelFetch(uHeat, cell, 0).r;
            if (h > 0.01) color = texelFetch(uPalette, ivec2(int(clamp(h, 0.0, 1.0) * 255.0 + 0.5), 0), 0).rgb;
        }
        outColor = vec4(color, 1.0);
        return;
    }

    vec3 color = uDead;
    if (inside) {
        float v = texelFetch(uState, cell, 0).r;
        if (v == 1.0) color = uAlive;
        else if (v == 2.0) color = mix(uDead, uAccent, 136.0 / 255.0); // Akzentfarbe mit Alpha 0x88
    }
    outColor = vec4(color, 1.0);
}`;

// Zellulärer Automat, der komplett auf der GPU läuft (WebGL2)
// Gleiche Schnittstelle wie Automaton, der Zustand liegt aber in Texturen statt in this.grid
export class GpuAutomaton {
    static isSupported() {
        return isGpuSupported();
    }

    constructor(canvas, ruleKey) {
        this.canvas = canvas;
        this.gl = getGL(canvas);
        this.cellsize = 6;

        this.cols = Math.max(1, Math.floor(canvas.width / this.cellsize));
        this.rows = Math.max(1, Math.floor(canvas.height / this.cellsize));

        this.running = false;   // Flag, um den Automaton zu starten oder zu stoppen

        this.ruleKey = ruleKey;
        this.brushMode = 'spray';
        this.brushRadius = 3;

        // Wärme-Spur: optionale Darstellung, die zu jeder Regel zuschaltbar ist
        this.heatEnabled = false;
        this.heat = null;

        this.bpm = 120;
        this.colors = { alive: '#ff4d8f', dead: '#423439', accent: '#ff4d8f', bg: '#1a0a12' }; // Standardfarben

        this.programs = {
            step: getProgram(this.gl, this._stepShader()),
            render: getProgram(this.gl, this._renderShader()),
            heat: getProgram(this.gl, HEAT_SHADER),
            brush: getProgram(this.gl, BRUSH_SHADER),
            sprinkle: getProgram(this.gl, SPRINKLE_SHADER),
            copy: getProgram(this.gl, COPY_SHADER),
        };

        this.state = new PingPong(this.gl, this.cols, this.rows);
        this.randomize(); // Initialisiert das Gitter mit zufälligen Werten

        this.removeMouseEvents = attachMouseBrush(canvas, (x, y) => this.applyBrushAt(x, y));
        this.draw();
    }

    // Shader-Quelltexte; SmoothAutomaton tauscht sie aus
    _stepShader() {
        return stepShader(GPU_RULES[this.ruleKey]);
    }

    _renderShader() {
        return RENDER_SHADER;
    }

    _paletteStops() {
        return HEAT_STOPS;
    }

    // Farbtabelle als Textur, erst beim ersten Zeichnen angelegt
    _ensurePalette() {
        if (!this.palette) this.palette = createPaletteTexture(this.gl, this._paletteStops());
        return this.palette;
    }

    // Ein Shader-Durchlauf: rendert in target (null = Canvas), textures = { Sampler-Name: Textur }
    _pass(programInfo, target, textures, setUniforms) {
        const gl = this.gl;
        const { program, uniforms } = programInfo;

        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
        gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);

        Object.entries(textures).forEach(([name, texture], unit) => {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(uniforms[name], unit);
        });

        setUniforms?.(uniforms);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Shader-Durchlauf, der buffer von read nach write fortschreibt und danach tauscht
    _update(programInfo, buffer, textures, setUniforms) {
        this._pass(programInfo, buffer.write, textures, setUniforms);
        buffer.swap();
    }

    _randomSeed() {
        return Math.floor(Math.random() * 0xffffffff);
    }

    setBrushMode(mode) {
        if (BRUSH_MODES.includes(mode)) {
            this.brushMode = mode;
            console.log(`Pinselmodus gewechselt auf: ${mode}`);
        } else {
            console.error(`Ungültiger Pinselmodus: ${mode}`);
        }
    }

    setBrushRadius(radius) {
        const value = Math.round(Number(radius));
        if (Number.isFinite(value) && value >= 1) {
            this.brushRadius = value;
        } else {
            console.error(`Ungültiger Pinselradius: ${radius}`);
        }
    }

    // Schaltet die Wärme-Spur ein oder aus
    setHeatEnabled(enabled) {
        this.heatEnabled = Boolean(enabled);

        this.heat?.destroy();
        this.heat = this.heatEnabled ? new PingPong(this.gl, this.cols, this.rows) : null;

        this.draw();
    }

    // Füllt Gitter mit zufälligen lebenden Zellen basierend auf der angegebenen Dichte
    randomize(density = 0.3) {
        const data = new Float32Array(this.cols * this.rows);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() < density ? 1 : 0;
        }
        this.state.upload(data);
    }

    // Aktiviert wenige tote Nachbarzellen von bereits aktiven Zellen
    randomizeGrid(density = 0.01) {
        this._update(this.programs.sprinkle, this.state, { uState: this.state.read.texture }, (u) => {
            this.gl.uniform2i(u.uSize, this.cols, this.rows);
            this.gl.uniform1f(u.uDensity, density);
            this.gl.uniform1ui(u.uSeed, this._randomSeed());
        });
    }

    setBPM(newBPM){
        this.bpm = newBPM;
    }

    // Gitter an Canvas-Größe und Zellgröße anpassen; vorhandene Zellen bleiben (oben links) erhalten
    resize(cellsize, keepGrid = true) {
        this.cellsize = cellsize;
        this.cols = Math.max(1, Math.floor(this.canvas.width / cellsize));
        this.rows = Math.max(1, Math.floor(this.canvas.height / cellsize));

        this.state = this._resizeBuffer(this.state, keepGrid);
        if (this.heat) this.heat = this._resizeBuffer(this.heat, keepGrid);

        this.draw();
    }

    _resizeBuffer(buffer, keepContent) {
        const resized = new PingPong(this.gl, this.cols, this.rows);
        if (keepContent) {
            this._pass(this.programs.copy, resized.read, { uSource: buffer.read.texture }, (u) => {
                this.gl.uniform2i(u.uSourceSize, buffer.width, buffer.height);
            });
        }
        buffer.destroy();
        return resized;
    }

    // Ein Simulationsschritt ohne Zeichnen
    advance() {
        this._update(this.programs.step, this.state, { uState: this.state.read.texture }, (u) => {
            this.gl.uniform2i(u.uSize, this.cols, this.rows);
        });

        if (this.heat) {
            // Wärme-Schicht anhand des neuen Gitters fortschreiben
            const textures = { uHeat: this.heat.read.texture, uState: this.state.read.texture };
            this._update(this.programs.heat, this.heat, textures, (u) => {
                this.gl.uniform2i(u.uSize, this.cols, this.rows);
            });
        }
    }

    // Berechnet den nächsten Zustand des Gitters und zeichnet ihn
    step() {
        this.advance();
        this.draw();
    }

    // Zeichnet das Gitter auf die Canvas
    draw() {
        const gl = this.gl;
        const textures = {
            uState: this.state.read.texture,
            uHeat: (this.heat ?? this.state).read.texture,
            uPalette: this._ensurePalette(),
        };

        this._pass(this.programs.render, null, textures, (u) => {
            gl.uniform2i(u.uSize, this.cols, this.rows);
            gl.uniform1i(u.uCellSize, this.cellsize);
            gl.uniform1i(u.uCanvasHeight, this.canvas.height);
            gl.uniform1i(u.uHeatEnabled, this.heat ? 1 : 0);
            gl.uniform3fv(u.uAlive, hexToRgb(this.colors.alive));
            gl.uniform3fv(u.uDead, hexToRgb(this.colors.dead));
            gl.uniform3fv(u.uAccent, hexToRgb(this.colors.accent));
        });
    }

    // Startet die Simulation, indem eine Schleife erstellt wird, die kontinuierlich Schritte berechnet und das Gitter aktualisiert
    start() {
        this.running = true;
        const loop = () => {
            if (!this.running) return; // Stoppt die Schleife, wenn running false ist
            this.step(); // Berechnet den nächsten Schritt

            // Berechnet Millisekunden pro Schritt basierend auf BPM
            const interval = (60 / this.bpm) * 1000;

            setTimeout(loop, interval); // Wiederholt die Schleife alle 'interval'ms
        };
        loop(); // Startet die Schleife
    }

    // Stoppt die Simulation, indem das Flag auf false gesetzt wird
    stop() {
        this.running = false;
    }

    // Gibt Texturen und Maus-Listener frei, wenn auf einen anderen Automaten gewechselt wird
    destroy() {
        this.stop();
        this.removeMouseEvents();
        this.state.destroy();
        this.heat?.destroy();
        if (this.palette) this.gl.deleteTexture(this.palette);
    }

    applyBrushAt(canvasX, canvasY) {
        const centerC = Math.floor(canvasX / this.cellsize);
        const centerR = Math.floor(canvasY / this.cellsize);

        this._update(this.programs.brush, this.state, { uState: this.state.read.texture }, (u) => {
            this.gl.uniform2i(u.uCenter, centerC, centerR);
            this.gl.uniform1i(u.uRadius, this.brushRadius);
            this.gl.uniform1i(u.uMode, BRUSH_MODES.indexOf(this.brushMode));
            this.gl.uniform1f(u.uDensity, 0.35);
            this.gl.uniform1ui(u.uSeed, this._randomSeed());
        });

        this.draw();
    }
}
