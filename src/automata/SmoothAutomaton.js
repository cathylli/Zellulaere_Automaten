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
        this.flashDecay = 0.9;     // Abklingen pro Frame (kleiner = kürzer, knackiger)
        this.baseBrightness = 0.4; // Gebilde im Normalzustand dunkler darstellen, damit das Aufleuchten Luft nach oben hat

        // Tempo in Simulationsschritten pro Bildschirm-Frame (Bruchteile werden über Frames gesammelt)
        this.baseSpeed = 0.3;      // Grundtempo, ca. 30 Schritte/s – entspricht etwa dem Tempo vor der Optimierung
        this.boostSpeed = 2;       // Tempo direkt nach einem Bass-Schlag
        this.boostDecay = 0.9;     // wie schnell das Tempo danach wieder auf das Grundtempo fällt (pro Frame)
        this.speedBoost = 0;       // aktueller Anteil des Boosts, 0–1
        this.stepAccumulator = 0;
    }

    // Override: Smooth Life ignoriert die BPM, das Tempo kommt über boost() vom Bass
    setBPM(newBPM) {
        this.bpm = newBPM;
    }

    // Erhöht das Tempo kurzzeitig (z.B. solange der Bass über der Schwelle liegt)
    boost() {
        this.speedBoost = 1;
    }

    // Einmalig: Kreise als waagerechte Streifen beschreiben
    // Ein Kreis mit Radius R besteht aus Zeilen dr = -R..R mit halber Breite w (alle dc mit |dc| <= w),
    // so dass die Summe eines Streifens später mit 2 Zugriffen auf die Zeilen-Präfixsummen geht
    _precomputeOffsets() {
        const buildSpans = (radius) => {
            const dr = [];
            const w = [];
            let count = 0;
            for (let d = -radius; d <= radius; d++) {
                let half = 0;
                while (d * d + (half + 1) * (half + 1) <= radius * radius) half++;
                dr.push(d);
                w.push(half);
                count += 2 * half + 1;
            }
            return { dr: Int8Array.from(dr), w: Int8Array.from(w), count };
        };

        const inner = buildSpans(this.ri);
        const disc = buildSpans(this.ro);

        this.innerSpanDr = inner.dr;
        this.innerSpanW = inner.w;
        this.discSpanDr = disc.dr;
        this.discSpanW = disc.w;

        // Ring = großer Kreis ohne inneren Kreis (wie bisher: d² <= ri² innen, sonst d² <= ro² außen)
        this.innerCount = inner.count;
        this.outerCount = disc.count - inner.count;
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

    // Laufende Summen jeder Zeile, links und rechts um ro Spalten umgewickelt erweitert
    // Summe der Spalten c+a .. c+b in Zeile r = P[r*stride + c+b+ro+1] - P[r*stride + c+a+ro]
    _buildRowPrefixSums() {
        const cols = this.cols;
        const ro = this.ro;
        const stride = cols + 2 * ro + 1;
        const size = this.rows * stride;

        if (!this.prefix || this.prefix.length !== size) {
            this.prefix = new Float64Array(size);
        }

        const prefix = this.prefix;
        const colWrap = this.colWrap;
        for (let r = 0; r < this.rows; r++) {
            const row = this.grid[r];
            const base = r * stride;
            let sum = 0;
            prefix[base] = 0;
            for (let k = 0; k < cols + 2 * ro; k++) {
                sum += row[colWrap[k]];
                prefix[base + k + 1] = sum;
            }
        }
        return stride;
    }

    // Ein Simulationsschritt ohne Zeichnen
    // Override: Nachbarschaftssummen über Zeilen-Präfixsummen (2 Zugriffe pro Kreis-Streifen)
    advance() {
        this._ensureWrapTables();
        const stride = this._buildRowPrefixSums();

        const rows = this.rows;
        const cols = this.cols;
        const ro = this.ro;
        const prefix = this.prefix;
        const rowWrap = this.rowWrap;
        const innerDr = this.innerSpanDr;
        const innerW = this.innerSpanW;
        const discDr = this.discSpanDr;
        const discW = this.discSpanW;
        const innerCount = this.innerCount;
        const outerCount = this.outerCount;

        const next = new Array(rows);

        for (let r = 0; r < rows; r++) {
            const nextRow = new Float32Array(cols);
            const rBase = r + ro;

            for (let c = 0; c < cols; c++) {
                const cBase = c + ro;

                let innerSum = 0;
                for (let j = 0; j < innerDr.length; j++) {
                    const rowStart = rowWrap[rBase + innerDr[j]] * stride + cBase;
                    const w = innerW[j];
                    innerSum += prefix[rowStart + w + 1] - prefix[rowStart - w];
                }

                let discSum = 0;
                for (let j = 0; j < discDr.length; j++) {
                    const rowStart = rowWrap[rBase + discDr[j]] * stride + cBase;
                    const w = discW[j];
                    discSum += prefix[rowStart + w + 1] - prefix[rowStart - w];
                }

                const m = innerSum / innerCount;
                const n = (discSum - innerSum) / outerCount;
                nextRow[c] = Math.max(0, Math.min(1, this.transition(n, m)));
            }

            next[r] = nextRow;
        }

        this.grid = next;
    }

    step() {
        this.advance();
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
