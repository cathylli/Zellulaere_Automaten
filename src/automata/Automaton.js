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
        this.bpm = 120;
        this.initMouseEvents();

        this.draw();
    }

    // Füllt Gitter mit zufälligen lebenden Zellen basierend auf der angegebenen Dichte
    randomize(density = 0.3) {
        this.grid = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () =>
                Math.random() < density ? 1 : 0
            )
        );
    }

    setBPM(newBPM){
        this.bpm = newBPM;
    }

    // Zeichnet das Gitter auf die Canvas
    draw() {
        this.ctx.fillStyle = '#423439'; // Hintergrundfarbe
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // Canvas leeren
        
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c]) {
                    this.ctx.fillStyle = '#ff4d8f'; // Farbe für lebende Zellen
                    this.ctx.fillRect(
                        c * this.cellsize, 
                        r * this.cellsize, 
                        this.cellsize, 
                        this.cellsize); // Zelle zeichnen
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

        const handleMouse = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Umrechnung in Grid-Koordinaten
            const centerC = Math.floor(mouseX / this.cellsize);
            const centerR = Math.floor(mouseY / this.cellsize);
            
            const radius = 2; // Pinselradius (Kann später als Parameter übergeben werden)
            
            // Zeichne im Radius um den Mauszeiger
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    const r = centerR + dr;
                    const c = centerC + dc;
                    
                    // Prüfen ob im Grid-Bereich
                    if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
                        // Linksklick zeichnet (1), Rechtsklick/Shift-Klick könnte löschen (0)
                        this.grid[r][c] = e.shiftKey ? 0 : 1; 
                    }
                }
            }
            this.draw();
        };

        this.canvas.addEventListener('mousedown', (e) => { isDrawing = true; handleMouse(e); });
        this.canvas.addEventListener('mousemove', (e) => { if (isDrawing) handleMouse(e); });
        window.addEventListener('mouseup', () => isDrawing = false);
    }
}

