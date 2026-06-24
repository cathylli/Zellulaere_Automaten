import { Automaton } from './Automaton.js';
import { RULES } from './rules.js';

export class GradientAutomaton extends Automaton {
    constructor(canvas, ruleKey = 'gameOfLife') {
        super(canvas, ruleKey);
        this.heatDecay = 0.85;
    }

    // Override: initialisiert Grid (binär) + Heat-Layer (float)
    randomize(density = 0.3) {
        this.grid = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () => Math.random() < density ? 1 : 0)
        );
        this.heat = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () => 0)
        );
    }

    // Override: binäre GoL-Regel + Wärme-Update mit Nachbar-Diffusion
    step() {
        const next = this.grid.map(row => [...row]);
        const nextHeat = this.heat.map(row => [...row]);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                next[r][c] = RULES[this.ruleKey](this.grid, r, c, this.rows, this.cols);

                // Durchschnittliche Nachbarwärme (liest aus aktuellem heat, nicht nextHeat)
                let neighborHeat = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = (r + dr + this.rows) % this.rows;
                        const nc = (c + dc + this.cols) % this.cols;
                        neighborHeat += this.heat[nr][nc];
                    }
                }
                neighborHeat /= 8;

                if (next[r][c]) {
                    nextHeat[r][c] = Math.min(1, this.heat[r][c] + 0.4);
                } else {
                    // Eigene Wärme zerfällt, nimmt aber etwas Nachbarwärme auf
                    nextHeat[r][c] = this.heat[r][c] * 0.82 + neighborHeat * 0.12;
                    if (nextHeat[r][c] < 0.005) nextHeat[r][c] = 0;
                }
            }
        }

        this.grid = next;
        this.heat = nextHeat;
        this.draw();
    }

    colorFromHeat(v) {
        // Thermische Palette: dunkel → blau → magenta → orange → weiß
        const stops = [
            [0.00, [5,   0,   15]],
            [0.20, [30,  0,   80]],
            [0.50, [200, 0,   100]],
            [0.75, [255, 130, 20]],
            [1.00, [255, 245, 180]],
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
        return 'rgb(255,245,180)';
    }

    // Override: zeichnet basierend auf Wärme, nicht alive/dead
    draw() {
        if (!this.heat) return;
        this.ctx.fillStyle = '#050010';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const h = this.heat[r][c];
                if (h > 0.01) {
                    this.ctx.fillStyle = this.colorFromHeat(h);
                    this.ctx.fillRect(c * this.cellsize, r * this.cellsize, this.cellsize, this.cellsize);
                }
            }
        }
    }
}
