export class CanvasRecorder {
    constructor(canvas, button, audioEngine) {
        // Canvas, das aufgenommen werden soll
        this.canvas = canvas;

        // Record-Button
        this.button = button;

        // AudioEngine liefert die Audiospur
        this.audioEngine = audioEngine;

        // MediaRecorder für die aktuelle Aufnahme
        this.mediaRecorder = null;

        // Hier werden die einzelnen Videoblöcke gesammelt
        this.recordedChunks = [];

        // Gemeinsamer Stream aus Video und Audio
        this.recordingStream = null;

        // Separater Canvas-Stream
        this.canvasStream = null;

        // Klick startet oder stoppt die Aufnahme
        this.button.addEventListener('click', () => {
            this.toggleRecording();
        });
    }

    // Aufnahme starten oder stoppen
    toggleRecording() {
        const isRecording = this.mediaRecorder?.state === 'recording';

        if (isRecording) {
            this.stop();
        } else {
            this.start();
        }
    }

    // Aufnahme starten
    start() {
        // Browser-Unterstützung prüfen
        if (!this.canvas.captureStream) {
            alert('Canvas-Aufnahmen werden von diesem Browser nicht unterstützt.');
            return;
        }

        if (!window.MediaRecorder) {
            alert('Videoaufnahmen werden von diesem Browser nicht unterstützt.');
            return;
        }

        // Alte Aufnahmeblöcke entfernen
        this.recordedChunks = [];

        // Videostream direkt aus dem Automaten-Canvas
        this.canvasStream = this.canvas.captureStream(30);

        // Audiostream JETZT holen
        const audioStream = this.audioEngine?.getRecordingStream();
        console.log('Audio-Tracks:', audioStream?.getAudioTracks().length);

        // Gemeinsamen Stream erstellen
        this.recordingStream = new MediaStream();

        this.canvasStream.getVideoTracks().forEach(track => {
            this.recordingStream.addTrack(track);
        });

        audioStream?.getAudioTracks().forEach(track => {
            this.recordingStream.addTrack(track);
        });

        // Unterstütztes WebM-Format bestimmen
        const mimeType = this.getSupportedMimeType();

        const options = {
            videoBitsPerSecond: 20_000_000,
            audioBitsPerSecond: 256_000
        };

        if (mimeType) {
            options.mimeType = mimeType;
        }

        try {
            this.mediaRecorder = new MediaRecorder(this.recordingStream, options);
        } catch (error) {
            console.error('Recorder konnte nicht erstellt werden:', error);
            this.stopStreams();
            alert('Die Aufnahme konnte nicht gestartet werden.');
            return;
        }

        this.mediaRecorder.addEventListener('dataavailable', event => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        });

        this.mediaRecorder.addEventListener('start', () => {
            this.button.classList.add('is-recording');
            this.button.setAttribute('aria-label', 'Aufnahme stoppen');
            console.log('Aufnahme gestartet:', this.mediaRecorder.mimeType);
        });

        this.mediaRecorder.addEventListener('stop', async () => {
            const actualMimeType = this.mediaRecorder.mimeType || mimeType || 'video/webm';

            const blob = new Blob(this.recordedChunks, { type: actualMimeType });

            console.log('Aufnahme beendet:', actualMimeType, blob.size, 'Bytes');

            this.stopStreams();
            this.recordedChunks = [];

            this.button.classList.remove('is-recording');
            this.button.setAttribute('aria-label', 'Aufnahme starten');

            await this.save(blob);
        });

        this.mediaRecorder.addEventListener('error', event => {
            console.error('Fehler während der Aufnahme:', event.error);
            this.stopStreams();
            this.button.classList.remove('is-recording');
            this.button.setAttribute('aria-label', 'Aufnahme starten');
        });

        // Kurz warten damit der Stream sich initialisieren kann
        setTimeout(() => {
            this.mediaRecorder.start(100);
        }, 200);
    }

    // Laufende Aufnahme stoppen
    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.requestData(); // ← sofort letzten Chunk holen
            this.mediaRecorder.stop();
        }
    }

    // Alle erzeugten Videostreams stoppen
    stopStreams() {
        this.recordingStream?.getTracks().forEach(track => track.stop());

        this.canvasStream?.getTracks().forEach(track => track.stop());

        this.recordingStream = null;
        this.canvasStream = null;
    }

    // Unterstütztes WebM-Format suchen
    getSupportedMimeType() {
        const mimeTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];

        return mimeTypes.find(type =>
            MediaRecorder.isTypeSupported(type)
        ) || '';
    }

    // Fertige Datei speichern
    async save(blob) {
        // Keine leere Datei speichern
        if (!blob.size) {
            console.error('Die Aufnahme enthält keine Daten.');

            alert('Die Aufnahme konnte nicht gespeichert werden, weil keine Videodaten vorhanden sind.');

            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const filename = `zellulaerer-automat-${timestamp}.webm`;

        // Speichern-Dialog in unterstützten Browsern
        if ('showSaveFilePicker' in window) {
            try {
                const fileHandle =
                    await window.showSaveFilePicker({
                        suggestedName: filename,

                        types: [
                            {
                                description:
                                    'WebM-Video',

                                accept: {
                                    'video/webm': [
                                        '.webm'
                                    ]
                                }
                            }
                        ]
                    });

                const writable = await fileHandle.createWritable();

                await writable.write(blob);
                await writable.close();

                return;
            } catch (error) {
                // Benutzer hat den Dialog geschlossen
                if (error.name === 'AbortError') {
                    return;
                }

                console.error('Speichern über Dateidialog fehlgeschlagen:', error);
            }
        }

        // Fallback: normaler Browser-Download
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');

        downloadLink.href = url;
        downloadLink.download = filename;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();

        // Blob-URL später freigeben
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
    }
}