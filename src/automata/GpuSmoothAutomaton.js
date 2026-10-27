import { GpuAutomaton } from './GpuAutomaton.js';
import { BACKGROUND, PALETTE_STOPS } from './SmoothAutomaton.js';
import { GLSL_HEADER, glslColor } from '../gpu/gl.js';

const RI = 2; // Innenradius
const RO = 6; // Außenradius (Verhältnis 1:3 wie im Original)

// Anzahl der Zellen mit dx² + dy² <= radius²
function countDisc(radius) {
    let count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= radius * radius) count++;
        }
    }
    return count;
}

const INNER_COUNT = countDisc(RI);
const OUTER_COUNT = countDisc(RO) - INNER_COUNT; // Ring = großer Kreis ohne inneren Kreis

// Smooth Life auf der GPU: jede Zelle summiert ihren inneren Kreis und den Ring direkt auf
// (auf der GPU schneller als die Präfixsummen der CPU-Version)
const SMOOTH_STEP_SHADER = `${GLSL_HEADER}
uniform sampler2D uState;
uniform ivec2 uSize;

// Sigmoid-Funktion für sanfte Übergänge; Exponent begrenzt, damit exp() nicht überläuft
float sigma(float x, float a, float alpha) {
    return 1.0 / (1.0 + exp(clamp(-(x - a) * 4.0 / alpha, -80.0, 80.0)));
}

// Übergangsregel: n = äußere Nachbarschaft, m = innerer Wert (Zelle selbst)
float transition(float n, float m) {
    const float b1 = 0.278, b2 = 0.365; // Geburtsbereich
    const float d1 = 0.267, d2 = 0.445; // Überlebensbereich
    const float an = 0.028, am = 0.147; // Schärfe der Übergänge

    float aliveWeight = sigma(m, 0.5, am);
    float lo = b1 * (1.0 - aliveWeight) + d1 * aliveWeight;
    float hi = b2 * (1.0 - aliveWeight) + d2 * aliveWeight;

    return sigma(n, lo, an) * (1.0 - sigma(n, hi, an));
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float innerSum = 0.0;
    float outerSum = 0.0;

    for (int dy = -${RO}; dy <= ${RO}; dy++) {
        for (int dx = -${RO}; dx <= ${RO}; dx++) {
            int d2 = dx * dx + dy * dy;
            if (d2 > ${RO * RO}) continue;
            float v = texelFetch(uState, (p + ivec2(dx, dy) + uSize) % uSize, 0).r;
            if (d2 <= ${RI * RI}) innerSum += v;
            else outerSum += v;
        }
    }

    float m = innerSum / ${INNER_COUNT}.0;
    float n = outerSum / ${OUTER_COUNT}.0;
    outColor = vec4(clamp(transition(n, m), 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

// Zellwerte über die Farbtabelle einfärben, mit Grundhelligkeit und Aufleuchten beim Bass
const SMOOTH_RENDER_SHADER = `${GLSL_HEADER}
uniform sampler2D uState;
uniform sampler2D uPalette;
uniform ivec2 uSize;
uniform int uCellSize;
uniform int uCanvasHeight;
uniform float uBase;
uniform float uBoost;

void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    ivec2 cell = ivec2(px.x, uCanvasHeight - 1 - px.y) / uCellSize;

    vec3 color = ${glslColor(BACKGROUND)};
    if (all(lessThan(cell, uSize))) {
        float v = texelFetch(uState, cell, 0).r;
        if (v > 0.01) {
            int index = min(255, int((v * uBase + uBoost) * 255.0));
            color = texelFetch(uPalette, ivec2(index, 0), 0).rgb;
        }
    }
    outColor = vec4(color, 1.0);
}`;

// Smooth Life nach Stephan Rafler (2011) auf der GPU, Verhalten wie SmoothAutomaton
export class GpuSmoothAutomaton extends GpuAutomaton {
    constructor(canvas) {
        super(canvas, null);

        // Aufleuchten beim Bass: schiebt die Zellwerte in der Palette nach oben (Richtung gelb/weiß)
        this.bassFlash = 0;        // aktuelle Stärke, 0–1
        this.flashStrength = 0.8;    // Betrag, um den jeder Zellwert (0–1) bei vollem Aufleuchten angehoben wird
        this.flashDecay = 0.9;     // Abklingen pro Frame (kleiner = kürzer, knackiger)
        this.baseBrightness = 0.6; // Gebilde im Normalzustand dunkler darstellen, damit das Aufleuchten Luft nach oben hat

        // Tempo in Simulationsschritten pro Bildschirm-Frame (Bruchteile werden über Frames gesammelt)
        this.baseSpeed = 0.2;      // Grundtempo, ca. 30 Schritte/s
        this.boostSpeed = 0.6;       // Tempo direkt nach einem Bass-Schlag
        this.boostDecay = 0.9;     // wie schnell das Tempo danach wieder auf das Grundtempo fällt (pro Frame)
        this.speedBoost = 0;       // aktueller Anteil des Boosts, 0–1
        this.stepAccumulator = 0;
    }

    _stepShader() {
        return SMOOTH_STEP_SHADER;
    }

    _renderShader() {
        return SMOOTH_RENDER_SHADER;
    }

    _paletteStops() {
        return PALETTE_STOPS;
    }

    // Override: Smooth Life ignoriert die BPM, das Tempo kommt über boost() vom Bass
    setBPM(newBPM) {
        this.bpm = newBPM;
    }

    // Erhöht das Tempo kurzzeitig (z.B. solange der Bass über der Schwelle liegt)
    boost() {
        this.speedBoost = 1;
    }

    // Lässt die lebenden Strukturen kurz aufleuchten (z.B. beim Bass)
    flash(strength = 1) {
        this.bassFlash = Math.max(this.bassFlash, strength);
    }

    // Override: binäre Dichte 0.35 — liegt im Überlebensbereich [0.267, 0.445]
    randomize() {
        super.randomize(0.35);
    }

    // Override: Smooth Life kennt keine Wärme-Schicht
    advance() {
        this._update(this.programs.step, this.state, { uState: this.state.read.texture }, (u) => {
            this.gl.uniform2i(u.uSize, this.cols, this.rows);
        });
    }

    // Override: rAF statt setTimeout für flüssige Animation
    start() {
        this.running = true;
        const loop = () => {
            if (!this.running) return;

            // Aktuelles Tempo zwischen Grundtempo und Boost; Bruchteile von Schritten sammeln
            const speed = this.baseSpeed + (this.boostSpeed - this.baseSpeed) * this.speedBoost;
            this.stepAccumulator += speed;
            while (this.stepAccumulator >= 1) {
                this.advance();
                this.stepAccumulator--;
            }
            this.speedBoost *= this.boostDecay;

            // Jedes Frame zeichnen, damit das Aufleuchten flüssig bleibt
            this.draw();

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // Override: Farbtabelle mit Aufleuchten statt lebendig/tot
    // ?? da der Basis-Konstruktor draw() schon vor dem eigenen Konstruktor aufruft
    draw() {
        const gl = this.gl;
        const flash = this.bassFlash ?? 0;
        const textures = { uState: this.state.read.texture, uPalette: this._ensurePalette() };

        this._pass(this.programs.render, null, textures, (u) => {
            gl.uniform2i(u.uSize, this.cols, this.rows);
            gl.uniform1i(u.uCellSize, this.cellsize);
            gl.uniform1i(u.uCanvasHeight, this.canvas.height);
            gl.uniform1f(u.uBase, this.baseBrightness ?? 1);
            gl.uniform1f(u.uBoost, flash * (this.flashStrength ?? 0));
        });

        this.bassFlash = flash * (this.flashDecay ?? 0);
    }
}
