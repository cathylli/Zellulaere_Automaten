import { Automaton } from './Automaton.js';

// Smooth Life nach Stephan Rafler (2011) — kontinuierliche Erweiterung von Game of Life
export class SmoothAutomaton extends Automaton {
    constructor(canvas) {
        super(canvas, null);
        this.ri = 2;  // Innenradius
        this.ro = 6;  // Außenradius (Verhältnis 1:3 wie im Original)
        this._precomputeOffsets();
    }

    // Einmalig: alle (dr, dc) Offsets in inner/outer aufteilen
    _precomputeOffsets() {
        this.innerOffsets = [];
        this.outerOffsets = [];
        const ri2 = this.ri * this.ri;
        const ro2 = this.ro * this.ro;
        for (let dr = -this.ro; dr <= this.ro; dr++) {
            for (let dc = -this.ro; dc <= this.ro; dc++) {
                const d2 = dr * dr + dc * dc;
                if (d2 <= ri2) this.innerOffsets.push([dr, dc]);
                else if (d2 <= ro2) this.outerOffsets.push([dr, dc]);
            }
        }
    }

    // Override: binäre Dichte 0.35 — liegt im Überlebensbereich [0.267, 0.445]
    randomize() {
        this.grid = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () => Math.random() < 0.35 ? 1 : 0)
        );
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

            //für BPM-basierte Animation -> später hinzufügen. Muss eventuell multipliziert werden, weil sonst zu langsam
            //const interval = (60 / this.bpm) * 1000;
            // setTimeout(loop, interval);
        };
        requestAnimationFrame(loop);
    }

    // Override: vorberechnete Offsets statt nested Loop mit dist²-Check pro Zelle
    step() {
        const next = this.grid.map(row => [...row]);
        const innerLen = this.innerOffsets.length;
        const outerLen = this.outerOffsets.length;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                let innerSum = 0;
                for (let i = 0; i < innerLen; i++) {
                    const nr = (r + this.innerOffsets[i][0] + this.rows) % this.rows;
                    const nc = (c + this.innerOffsets[i][1] + this.cols) % this.cols;
                    innerSum += this.grid[nr][nc];
                }

                let outerSum = 0;
                for (let i = 0; i < outerLen; i++) {
                    const nr = (r + this.outerOffsets[i][0] + this.rows) % this.rows;
                    const nc = (c + this.outerOffsets[i][1] + this.cols) % this.cols;
                    outerSum += this.grid[nr][nc];
                }

                const m = innerSum / innerLen;
                const n = outerSum / outerLen;
                next[r][c] = Math.max(0, Math.min(1, this.transition(n, m)));
            }
        }

        this.grid = next;
        this.draw();
    }

    colorFromValue(v) {
        // Thermische Palette: schwarz → blau → rot → gelb → weiß
        const stops = [
            [0.00, [5,   0,   15]],
            [0.20, [20,  0,   80]],
            [0.45, [180, 0,   80]],
            [0.65, [255, 100, 0]],
            [0.85, [255, 220, 50]],
            [1.00, [255, 255, 220]],
        ];
        v = Math.max(0, Math.min(1, v));
        for (let i = 0; i < stops.length - 1; i++) {
            const [t0, c0] = stops[i];
            const [t1, c1] = stops[i + 1];
            if (v <= t1) {
                const t = (v - t0) / (t1 - t0);
                const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
                const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
                const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
                return `rgb(${r},${g},${b})`;
            }
        }
        return 'rgb(255,255,220)';
    }

    // Override: zeichnet Float-Werte als Thermalkarte
    draw() {
        this.ctx.fillStyle = '#050010';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const v = this.grid[r][c];
                if (v > 0.01) {
                    this.ctx.fillStyle = this.colorFromValue(v);
                    this.ctx.fillRect(c * this.cellsize, r * this.cellsize, this.cellsize, this.cellsize);
                }
            }
        }
    }
}
