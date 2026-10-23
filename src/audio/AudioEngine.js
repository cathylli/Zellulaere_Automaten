export class AudioEngine {
    constructor() {
        this.ctx = null;             // Wird erst bei User-Interaktion initialisiert
        this.audioBuffer = null;
        this.sourceNode = null;      // Die eigentliche Abspiel-Quelle
        this.gainNode = null;        // Für die Lautstärkeregelung
        
        this.isPlaying = false;
        this.playbackRate = 1.0;
        this.volume = 0.5;
        this.analyzerNode = null;

        this.recordingDestination = null;

        // Live-Eingang (z.B. Mischpult über Audio-Interface)
        this.liveStream = null;
        this.liveSource = null;
        this.liveGainNode = null;
        this.inputGain = 1.0;
        this.isLive = false;
    }

    // true, wenn gerade Audio analysiert wird – egal ob Track oder Live-Eingang
    get isActive() {
        return this.isPlaying || this.isLive;
    }

    // Initialisiert den AudioContext nach einem Klick im UI
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();

            this.recordingDestination = this.ctx.createMediaStreamDestination();

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
        this.stopLiveInput();

        // Ein SourceNode kann in der Web Audio API immer NUR EINMAL abgespielt werden
        // Deshalb bei jedem "Play" neu erstellen
        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        
        // GainNode für die Lautstärke erzeugen und verbinden
        this.gainNode = this.ctx.createGain();
        this.setVolume(this.volume);
        this.setPlaybackRate(this.playbackRate);

        // Kette verknüpfen: Quelle -> Lautstärke -> [Analyzer] -> Lautsprecher
        this.sourceNode.connect(this.gainNode);

        if (this.analyzerNode) {
            // Audio zuerst durch den Analyzer leiten
            this.gainNode.connect(this.analyzerNode);

            // Normal über die Lautsprecher ausgeben
            this.analyzerNode.connect(this.ctx.destination);

            // Zusätzlich in den Aufnahme-Audiostream leiten
            this.analyzerNode.connect(
                this.recordingDestination
            );
        } else {
            // Normal über die Lautsprecher ausgeben
            this.gainNode.connect(this.ctx.destination);

            // Zusätzlich für die Aufnahme bereitstellen
            this.gainNode.connect(this.recordingDestination);
        }

        this.sourceNode.start(0);
        this.isPlaying = true;
        console.log("Wiedergabe gestartet.");

        // Event feuern, wenn der Track von alleine zu Ende ist
        // node-Referenz festhalten, damit ein späterer stop() nicht fälschlicherweise
        // isPlaying auf false setzt, obwohl bereits ein neuer Track gestartet wurde
        const node = this.sourceNode;
        node.onended = () => {
            if (this.sourceNode === node) this.isPlaying = false;
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
        this.playbackRate = Math.max(0.5, Math.min(2.0, Number(value)));
        if (this.sourceNode && this.ctx) {
            this.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
        }
    }

    // Verfügbare Audio-Eingänge auflisten (Namen erst nach erster Freigabe sichtbar)
    async getInputDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'audioinput');
    }

    // Live-Eingang starten: Signal wird nur analysiert, nicht ausgegeben
    async startLiveInput(deviceId = null) {
        this.init();
        await this.ctx.resume();

        this.stop();
        this.stopLiveInput();

        this.liveStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                // Browser-Filter sind für Sprache gedacht und verfälschen Musik
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            }
        });

        this.liveSource = this.ctx.createMediaStreamSource(this.liveStream);
        this.liveGainNode = this.ctx.createGain();
        this.setInputGain(this.inputGain);

        // Kette: Eingang -> Gain -> Analyzer -> Aufnahme
        this.liveSource.connect(this.liveGainNode);

        if (this.analyzerNode) {
            // Verbindung zu den Lautsprechern aus einer vorherigen Wiedergabe trennen,
            // sonst entsteht eine Rückkopplung
            this.analyzerNode.disconnect();
            this.liveGainNode.connect(this.analyzerNode);
            this.analyzerNode.connect(this.recordingDestination);
        } else {
            this.liveGainNode.connect(this.recordingDestination);
        }

        this.isLive = true;
        console.log("Live-Eingang gestartet.");
    }

    // Live-Eingang stoppen und Mikrofonfreigabe beenden
    stopLiveInput() {
        if (!this.isLive) return;

        this.liveStream?.getTracks().forEach(track => track.stop());
        this.liveSource?.disconnect();
        this.liveGainNode?.disconnect();

        this.liveStream = null;
        this.liveSource = null;
        this.liveGainNode = null;
        this.isLive = false;
        console.log("Live-Eingang gestoppt.");
    }

    // Eingangsverstärkung setzen (z.B. 0.5 für halb so laut, 4.0 für vierfach)
    setInputGain(value) {
        this.inputGain = Math.max(0.0, Number(value));
        if (this.liveGainNode) {
            this.liveGainNode.gain.setValueAtTime(this.inputGain, this.ctx.currentTime);
        }
    }

    getRecordingStream() {
        return this.recordingDestination?.stream ?? null;
    }
}