export class AudioEngine {
    constructor() {
        this.ctx = null;             // Wird erst bei User-Interaktion initialisiert
        this.audioBuffer = null;
        this.sourceNode = null;      // Die eigentliche Abspiel-Quelle
        this.gainNode = null;        // Für die Lautstärkeregelung
        
        this.isPlaying = false;
        this.playbackRate = 1.0;
        this.volume = 0.5;
    }

    // Initialisiert den AudioContext nach einem Klick im UI
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioContext erfolgreich initialisiert!");
        }
    }

    // Datei laden und dekodieren
    async loadFile(fileOrUrl) {
        this.init(); // Sicherstellen, dass der Context existiert

        try {
            let arrayBuffer;

            // Flexibel: Funktioniert mit URLs oder echten Datei-Objekten (Drag & Drop / Input)
            if (typeof fileOrUrl === 'string') {
                const response = await fetch(fileOrUrl);
                arrayBuffer = await response.arrayBuffer();
            } else if (fileOrUrl instanceof File) {
                arrayBuffer = await fileOrUrl.arrayBuffer();
            } else {
                throw new Error("Ungültiges Dateiformat übergeben.");
            }

            // Dekodieren des ArrayBuffers in Audiodaten, die die Web Audio API versteht
            this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("Audiodatei erfolgreich geladen und dekodiert!");
            return true;
        } catch (error) {
            console.error("Fehler beim Laden/Dekodieren der Audiodatei:", error);
            return false;
        }
    }

    // Play
    play() {
        if (!this.audioBuffer) {
            console.warn("Es wurde noch keine Audiodatei geladen!");
            return;
        }

        // Falls bereits etwas läuft, stoppen
        if (this.isPlaying) {
            this.stop();
        }

        // Ein SourceNode kann in der Web Audio API immer NUR EINMAL abgespielt werden
        // Deshalb bei jedem "Play" neu erstellen
        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        
        // GainNode für die Lautstärke erzeugen und verbinden
        this.gainNode = this.ctx.createGain();
        this.setVolume(this.volume);
        this.setPlaybackRate(this.playbackRate);

        // Kette verknüpfen: Quelle -> Lautstärke -> Lautsprecher (destination)
        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);

        this.sourceNode.start(0);
        this.isPlaying = true;
        console.log("Wiedergabe gestartet.");

        // Event feuern, wenn der Track von alleine zu Ende ist
        this.sourceNode.onended = () => {
            this.isPlaying = false;
        };
    }

    // Stop
    stop() {
        if (this.sourceNode && this.isPlaying) {
            this.sourceNode.stop();
            this.isPlaying = false;
            console.log("Wiedergabe gestoppt.");
        }
    }

    // Lautstärke setzen (Wert zwischen 0.0 und 1.0)
    setVolume(value) {
        this.volume = Math.max(0.0, Math.min(1.0, value));
        if (this.gainNode) {
            // gain.value direkt setzen oder sauber faden
            this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        }
    }

    // Abspielgeschwindigkeit setzen (z.B. 0.5 für halbes Tempo, 2.0 für doppeltes Tempo)
    setPlaybackRate(value) {
        this.playbackRate = Math.max(0.1, value);
        if (this.sourceNode) {
            this.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
        }
    }
}