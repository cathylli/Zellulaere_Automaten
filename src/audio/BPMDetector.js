export class BPMDetector {
    constructor(analyzer) {
        this.analyzer = analyzer;
        this.bpm = 120;
        this.beatTimes = [];
        this.lastBassEnergy = 0;
        this.cooldown = 0;
    }

    update() {
        const buffer = this.analyzer.getBuffer();

        // Bass-Bereich ~40–150 Hz (Bins 2–7 bei fftSize=2048, sampleRate=44100)
        // Kick-Drum liegt typischerweise in diesem Bereich
        let bassEnergy = 0;
        for (let i = 2; i <= 7; i++) bassEnergy += buffer[i];
        bassEnergy /= 6;

        // Beat = starker Energiesprung gegenüber dem letzten Frame
        const isBeat = bassEnergy > this.lastBassEnergy * 1.3
                    && bassEnergy > 50        // Mindestschwelle gegen Stille
                    && this.cooldown <= 0;

        if (isBeat) {
            const now = performance.now();
            this.beatTimes.push(now);
            if (this.beatTimes.length > 8) this.beatTimes.shift(); // max 8 Referenzpunkte

            if (this.beatTimes.length >= 2) {
                let total = 0;
                for (let i = 1; i < this.beatTimes.length; i++) {
                    total += this.beatTimes[i] - this.beatTimes[i - 1];
                }
                const avgMs = total / (this.beatTimes.length - 1);
                this.bpm = Math.max(60, Math.min(200, Math.round(60000 / avgMs)));
            }

            this.cooldown = 20; // ~333ms bei 60fps — verhindert Doppelerkennung desselben Beats
        }

        this.lastBassEnergy = bassEnergy;
        if (this.cooldown > 0) this.cooldown--;

        return this.bpm;
    }
}
