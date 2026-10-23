import { Automaton } from './Automaton.js';

// Thermische Palette: schwarz → blau → rot → gelb → weiß
const PALETTE_STOPS = [
    [0.00, [5,   0,   15]],
    [0.20, [20,  0,   80]],
    [0.45, [180, 0,   80]],
    [0.65, [255, 100, 0]],
    [0.85, [255, 220, 50]],
    [1.00, [255, 255, 220]],
];
const BACKGROUND = [5, 0, 16];

// Smooth Life nach Stephan Rafler (2011) — kontinuierliche Erweiterung von Game of Life
export class SmoothAutomaton extends Automaton {
    constructor(canvas) {
        super(canvas, null);
        this.ri = 2;  // Innenradius
        this.ro = 6;  // Außenradius (Verhältnis 1:3 wie im Original)
        this._precomputeOffsets();

        // Aufleuchten beim Bass: schiebt die Zellwerte in der Palette nach oben (Richtung gelb/weiß)
        this.bassFlash = 0;        // aktuelle Stärke, 0–1
        this.flashStrength = 1;  // Betrag, um den jeder Zellwert (0–1) bei vollem Aufleuchten angehoben wird
        this.flashDecay = 0.8;     // Abklingen pro Frame (kleiner = kürzer, knackiger)
        this.baseBrightness = 0.4; // Gebilde im Normalzustand dunkler darstellen, damit das Aufleuchten Luft nach oben hat
    }

    // Einmalig: alle (dr, dc) Offsets in inner/outer aufteilen
    // Flach als [dr0, dc0, dr1, dc1, ...] gespeichert, das ist in der Schleife schneller als Paare
    _precomputeOffsets() {
        const inner = [];
        const outer = [];
        const ri2 = this.ri * this.ri;
        const ro2 = this.ro * this.ro;
        for (let dr = -this.ro; dr <= this.ro; dr++) {
            for (let dc = -this.ro; dc <= this.ro; dc++) {
                const d2 = dr * dr + dc * dc;
                if (d2 <= ri2) inner.push(dr, dc);
                else if (d2 <= ro2) outer.push(dr, dc);
            }
        }
        this.innerOffsets = Int8Array.from(inner);
        this.outerOffsets = Int8Array.from(outer);
    }

    // Vorberechnete Indizes für das Umwickeln an den Rändern (ersetzt % in der inneren Schleife)
    // Index für Zeile r + dr ist rowWrap[r + dr + ro]
    _ensureWrapTables() {
        if (this.rowWrap?.length === this.rows + 2 * this.ro &&
            this.colWrap?.length === this.cols + 2 * this.ro) return;

        const build = (size) => Int32Array.from(
            { length: size + 2 * this.ro },
            (_, k) => (k - this.ro + size) % size
        );
        this.rowWrap = build(this.rows);
        this.colWrap = build(this.cols);
    }

    // Override: binäre Dichte 0.35 — liegt im Überlebensbereich [0.267, 0.445]
    randomize() {
        this.grid = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () => Math.random() < 0.35 ? 1 : 0)
        );
    }

    // Lässt die lebenden Strukturen kurz aufleuchten (z.B. beim Bass)
    flash(strength = 1) {
        this.bassFlash = Math.max(this.bassFlash, strength);
    }

    // Sigmoid-Funktion für sanfte Übergänge
    σ(x, a, alpha) {
        return 1.0 / (1.0 + Math.exp(-(x - a) * 4.0 / alpha));
    }

    // Übergangsregel: n = äußere Nachbarschaft, m = innerer Wert (Zelle selbst)
    transition(n, m) {
        const b1 = 0.278, b2 = 0.365; // Geburtsbereich
        const d1 = 0.267, d2 = 0.445; // Überlebensbereich
        const an = 0.028, am = 0.147;  // Schärfe der Übergänge

        const aliveWeight = this.σ(m, 0.5, am);
        const lo = b1 * (1 - aliveWeight) + d1 * aliveWeight;
        const hi = b2 * (1 - aliveWeight) + d2 * aliveWeight;

        return this.σ(n, lo, an) * (1 - this.σ(n, hi, an));
    }

    // Override: rAF statt setTimeout für flüssige Animation
    start() {
        this.running = true;
        const loop = () => {
            if (!this.running) return;
            this.step();

            requestAnimationFrame(loop);

            //für BPM-basierte Animation -> funktioniert allerdings nicht gut, da SmoothLife für einen Schritt relativ lange benötigt und die Animation von kontinuierlichen Updates lebt (also größere Intervalle führen zu "Ruckeln")
            //const interval = (60 / this.bpm) * 1000;
            //setTimeout(loop, interval);
        };
        requestAnimationFrame(loop);
    }

    // Override: vorberechnete Offsets und Rand-Tabellen statt nested Loop mit dist²-Check und %
    step() {
        this._ensureWrapTables();

        const rows = this.rows;
        const cols = this.cols;
        const ro = this.ro;
        const grid = this.grid;
        const rowWrap = this.rowWrap;
        const colWrap = this.colWrap;
        const inner = this.innerOffsets;
        const outer = this.outerOffsets;
        const innerCount = inner.length / 2;
        const outerCount = outer.length / 2;

        const next = new Array(rows);

        for (let r = 0; r < rows; r++) {
            const nextRow = new Float32Array(cols);
            const rBase = r + ro;

            for (let c = 0; c < cols; c++) {
                const cBase = c + ro;

                let innerSum = 0;
                for (let i = 0; i < inner.length; i += 2) {
                    innerSum += grid[rowWrap[rBase + inner[i]]][colWrap[cBase + inner[i + 1]]];
                }

                let outerSum = 0;
                for (let i = 0; i < outer.length; i += 2) {
                    outerSum += grid[rowWrap[rBase + outer[i]]][colWrap[cBase + outer[i + 1]]];
                }

                const m = innerSum / innerCount;
                const n = outerSum / outerCount;
                nextRow[c] = Math.max(0, Math.min(1, this.transition(n, m)));
            }

            next[r] = nextRow;
        }

        this.grid = next;
        this.draw();
    }

    // Einmalig: 256 Farben aus den Palettenstufen vorberechnen (RGB hintereinander)
    _buildPalette() {
        const palette = new Uint8ClampedArray(256 * 3);
        for (let i = 0; i < 256; i++) {
            const v = i / 255;
            for (let s = 0; s < PALETTE_STOPS.length - 1; s++) {
                const [t0, c0] = PALETTE_STOPS[s];
                const [t1, c1] = PALETTE_STOPS[s + 1];
                if (v <= t1) {
                    const t = (v - t0) / (t1 - t0);
                    palette[i * 3]     = Math.round(c0[0] + (c1[0] - c0[0]) * t);
                    palette[i * 3 + 1] = Math.round(c0[1] + (c1[1] - c0[1]) * t);
                    palette[i * 3 + 2] = Math.round(c0[2] + (c1[2] - c0[2]) * t);
                    break;
                }
            }
        }
        return palette;
    }

    // Offscreen-Canvas mit einem Pixel pro Zelle; wird nach einem Resize neu angelegt
    // Lazy, da der Basis-Konstruktor draw() schon vor dem eigenen Konstruktor aufruft
    _ensureRenderBuffers() {
        if (!this.palette) this.palette = this._buildPalette();

        if (!this.offscreen || this.offscreen.width !== this.cols || this.offscreen.height !== this.rows) {
            this.offscreen = document.createElement('canvas');
            this.offscreen.width = this.cols;
            this.offscreen.height = this.rows;
            this.offscreenCtx = this.offscreen.getContext('2d');
            this.imageData = this.offscreenCtx.createImageData(this.cols, this.rows);
        }
    }

    // Override: schreibt alle Zellen per Farbtabelle in ein ImageData und skaliert es einmal hoch
    draw() {
        this.ctx.fillStyle = '#050010';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.rows === 0 || this.cols === 0) return;

        this._ensureRenderBuffers();

        // Aufleuchten: fester Aufschlag auf jeden Zellwert, damit auch schwache Ränder sichtbar heller werden
        const flash = this.bassFlash ?? 0;
        const boost = flash * (this.flashStrength ?? 0);
        const base = this.baseBrightness ?? 1;
        const palette = this.palette;
        const data = this.imageData.data;

        let p = 0;
        for (let r = 0; r < this.rows; r++) {
            const row = this.grid[r];
            for (let c = 0; c < this.cols; c++) {
                const v = row[c];
                if (v > 0.01) {
                    const idx = Math.min(255, ((v * base + boost) * 255) | 0) * 3;
                    data[p]     = palette[idx];
                    data[p + 1] = palette[idx + 1];
                    data[p + 2] = palette[idx + 2];
                } else {
                    data[p]     = BACKGROUND[0];
                    data[p + 1] = BACKGROUND[1];
                    data[p + 2] = BACKGROUND[2];
                }
                data[p + 3] = 255;
                p += 4;
            }
        }

        this.offscreenCtx.putImageData(this.imageData, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.offscreen, 0, 0, this.cols * this.cellsize, this.rows * this.cellsize);

        this.bassFlash = flash * (this.flashDecay ?? 0);
    }
}
