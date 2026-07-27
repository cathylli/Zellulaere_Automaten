import { RULES } from './rules.js';

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

    // Zeichnet das Gitter auf die Canvas
    draw() {
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
            const interval = (60 / this.bpm) * 1000;

            setTimeout(loop, interval); // Wiederholt die Schleife alle 'interval'ms
        };
        loop(); // Startet die Schleife
    }

    // Stoppt die Simulation, indem das Flag auf false gesetzt wird
    stop() {
        this.running = false;
    }

    //Maus-Pinsel
    initMouseEvents() {
        let isDrawing = false;

        const handleMouse = (event) => {
            const rect = this.canvas.getBoundingClientRect();

            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            const canvasX =
                (event.clientX - rect.left) * scaleX;

            const canvasY =
                (event.clientY - rect.top) * scaleY;

            this.applyBrushAt(canvasX, canvasY);
        };

        this.canvas.addEventListener('mousedown', (e) => { isDrawing = true; handleMouse(e); });
        this.canvas.addEventListener('mousemove', (e) => { if (isDrawing) handleMouse(e); });
        window.addEventListener('mouseup', () => isDrawing = false);
    }

    applyBrushAt(canvasX, canvasY) {
        const centerC = Math.floor(canvasX / this.cellsize);
        const centerR = Math.floor(canvasY / this.cellsize);

        let radius = 3;
        const density = 0.35;

        if (this.brushMode === 'heat' || this.brushMode === 'erase') {
            radius = 4;
        } else if (this.brushMode === 'storm') {
            radius = 2;
        }

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

