import { RULES } from './rules.js';
import { attachMouseBrush } from '../ui/MouseBrush.js';

// Thermische Palette der Wärme-Spur: dunkel → blau → magenta → orange → weiß
export const HEAT_STOPS = [
    [0.00, [5,   0,   15]],
    [0.20, [30,  0,   80]],
    [0.50, [200, 0,   100]],
    [0.75, [255, 130, 20]],
    [1.00, [255, 245, 180]],
];

export class Automaton {
    constructor(canvas, ruleKey) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d'); // CanvasRenderingContext2D
        this.cellsize = 6;

        this.cols = Math.floor(canvas.width / this.cellsize);
        this.rows = Math.floor(canvas.height / this.cellsize);
        this.grid = []; // 2D-Array für den Zustand der Zellen

        this.running = false;   // Flag, um den Automaton zu starten oder zu stoppen
        this.randomize(); // Initialisiert das Gitter mit zufälligen Werten

        this.ruleKey = ruleKey;
        this.brushMode = 'spray';
        this.brushRadius = 3;

        // Wärme-Spur: optionale Darstellung, die zu jeder Regel zuschaltbar ist
        this.heatEnabled = false;
        this.heat = null;

        this.bpm = 120;
        this.initMouseEvents();
        this.colors = { alive: '#ff4d8f', dead: '#423439', accent: '#ff4d8f', bg: '#1a0a12' }; // Standardfarben

        this.draw();
    }

    setBrushMode(mode) {
        const validModes = ['spray', 'heat', 'storm', 'erase'];
        if (validModes.includes(mode)) {
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

        if (this.heatEnabled) {
            this.resetHeat();
        } else {
            this.heat = null;
        }

        this.draw();
    }

    // Leere Wärme-Schicht in der Größe des aktuellen Gitters
    resetHeat() {
        this.heat = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () => 0)
        );
    }

    // Nach einem Resize passt die Wärme-Schicht nicht mehr zum Gitter
    ensureHeat() {
        if (!this.heat || this.heat.length !== this.rows || this.heat[0]?.length !== this.cols) {
            this.resetHeat();
        }
    }

    // Füllt Gitter mit zufälligen lebenden Zellen basierend auf der angegebenen Dichte
    randomize(density = 0.3) {
        this.grid = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () =>
                Math.random() < density ? 1 : 0
            )
        );
    }

    // Aktiviert wenige tote Nachbarzellen von bereits aktiven Zellen
    randomizeGrid(density = 0.01) {
        const next = this.grid.map(row => [...row]);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] === 1) {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                                if (this.grid[nr][nc] === 0 && Math.random() < density) {
                                    next[nr][nc] = 1;
                                }
                            }
                        }
                    }
                }
            }
        }
        this.grid = next;
    }

    setBPM(newBPM){
        this.bpm = newBPM;
    }

    // Gitter an Canvas-Größe und Zellgröße anpassen; vorhandene Zellen bleiben (oben links) erhalten
    resize(cellsize, keepGrid = true) {
        this.cellsize = cellsize;
        this.cols = Math.floor(this.canvas.width / cellsize);
        this.rows = Math.floor(this.canvas.height / cellsize);
        this.grid = Array.from({ length: this.rows }, (_, r) =>
            Array.from({ length: this.cols }, (_, c) =>
                keepGrid ? (this.grid[r]?.[c] ?? 0) : 0
            )
        );
        this.draw();
    }

    // Wärme folgt den lebenden Zellen und zerfällt danach mit etwas Nachbar-Diffusion
    updateHeat(next) {
        this.ensureHeat();

        const nextHeat = this.heat.map(row => [...row]);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
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

        this.heat = nextHeat;
    }

    colorFromHeat(v) {
        const stops = HEAT_STOPS;
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

    // Zeichnet die Wärme-Schicht statt lebendig/tot
    drawHeat() {
        this.ensureHeat();

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

    // Zeichnet das Gitter auf die Canvas
    draw() {
        if (this.heatEnabled) {
            this.drawHeat();
            return;
        }

        this.ctx.fillStyle = this.colors.dead;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] === 1) {
                    this.ctx.fillStyle = this.colors.alive;
                    this.ctx.fillRect(c * this.cellsize, r * this.cellsize, this.cellsize, this.cellsize);
                } else if (this.grid[r][c] === 2) {
                    this.ctx.fillStyle = this.colors.accent + '88';
                    this.ctx.fillRect(c * this.cellsize, r * this.cellsize, this.cellsize, this.cellsize);
                }
            }
        }
    }

    // Berechnet den nächsten Zustand des Gitters basierend auf den Regeln
    step() {
        const next = this.grid.map(row => [...row]); // Erstellen einer Kopie des aktuellen Gitters

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                next[r][c] = RULES[this.ruleKey](this.grid, r, c, this.rows, this.cols); // Anwenden der Regeln auf jede Zelle
            }   
        }
        
        if (this.heatEnabled) {
            this.updateHeat(next); // Wärme-Schicht anhand des neuen Gitters fortschreiben
        }

        this.grid = next; // Aktualisieren des Gitters mit dem nächsten Zustand
        this.draw(); // Neuzeichnen des Gitters
    }

    // Startet die Simulation, indem eine Schleife erstellt wird, die kontinuierlich Schritte berechnet und das Gitter aktualisiert
    start() {
        this.running = true;
        const loop = () => {
            if (!this.running) return; // Stoppt die Schleife, wenn running false ist
            this.step(); // Berechnet den nächsten Schritt

            // Berechnet Millisekunden pro Schritt basierend auf BPM
            // könnte auch (1 / this.bpm) * mulitplyer sein, aber 60 / bpm ist die Standardformel für BPM zu Millisekunden
            const interval = (60 / this.bpm) * 1000;

            setTimeout(loop, interval); // Wiederholt die Schleife alle 'interval'ms
        };
        loop(); // Startet die Schleife
    }

    // Stoppt die Simulation, indem das Flag auf false gesetzt wird
    stop() {
        this.running = false;
    }

    // Entfernt die Maus-Listener, wenn auf einen anderen Automaten gewechselt wird
    destroy() {
        this.stop();
        this.removeMouseEvents();
    }

    //Maus-Pinsel
    initMouseEvents() {
        this.removeMouseEvents = attachMouseBrush(this.canvas, (x, y) => this.applyBrushAt(x, y));
    }

    applyBrushAt(canvasX, canvasY) {
        const centerC = Math.floor(canvasX / this.cellsize);
        const centerR = Math.floor(canvasY / this.cellsize);

        const radius = this.brushRadius;
        const density = 0.35;

        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const r = centerR + dr;
                const c = centerC + dc;

                if (
                    r < 0 ||
                    r >= this.rows ||
                    c < 0 ||
                    c >= this.cols
                ) {
                    continue;
                }

                if (dr * dr + dc * dc > radius * radius) {
                    continue;
                }

                switch (this.brushMode) {
                    case 'spray':
                        if (Math.random() < density) {
                            this.grid[r][c] = 1;
                        }
                        break;

                    case 'heat':
                        this.grid[r][c] = 1;
                        break;

                    case 'storm':
                        this.grid[r][c] = this.grid[r][c] ? 0 : 1;
                        break;

                    case 'erase':
                        this.grid[r][c] = 0;
                        break;
                }
            }
        }

        this.draw();
    }
}

