// MediaPipe wird erst beim Kamerastart aus dem Netz geladen, damit die App auch offline startet
// Bibliothek und WASM-Dateien aus derselben Version, sonst passen sie nach einem Update nicht mehr zusammen
const MEDIAPIPE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';

export class Handtrack {
    constructor(video, canvas, getAutomaton, speedSlider) {
        this.video = video; //Videoemelement für Kamerabild
        this.canvas = canvas;   //Canvas, auf dem Handpunkte gezeichnet
        this.ctx = canvas.getContext('2d');

        this.getAutomaton = getAutomaton;

        this.speedSlider = speedSlider;
        this.smoothedSpeed = Number(speedSlider.value);

        this.landmarker = null;
        this.drawer = null;
        this.stream = null;

        this.running = false;
        this.lastVideoTime = -1;
        this.animationId = null;
    }

    async initialize() {
        if (this.landmarker) return;

        // Mediapipe-Bibliothek und WASM laden (schlägt ohne Internet fehl, start() meldet dann einen Fehler)
        const { FilesetResolver, HandLandmarker, DrawingUtils } = await import(/* @vite-ignore */ MEDIAPIPE_URL);
        const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_URL}/wasm`);

        //Hand-Landmarker erstellen und konfigurieren
        this.landmarker =
            await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    // Vorgefertigtes MediaPipe-Handmodell
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/' +
                        'hand_landmarker/hand_landmarker/float16/1/' +
                        'hand_landmarker.task',
                    delegate: 'GPU'
                },

                runningMode: 'VIDEO',
                numHands: 2,    // max. 2 Hände

                // Mindestwahrscheinlichkeiten 
                minHandDetectionConfidence: 0.6,
                minHandPresenceConfidence: 0.6,
                minTrackingConfidence: 0.6
            });

        // Zeichenwerkzeug für Landmark-Punkte und Handverbindungen
        this.drawer = new DrawingUtils(this.ctx);
        this.handConnections = HandLandmarker.HAND_CONNECTIONS;
    }

    async start() {
        if (this.running) return;

        //MediaPipe-Modell laden
        await this.initialize();

        // Zugriff auf Webcam anfordern
        this.stream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: 640,
                    height: 480
                },
                audio: false
            });

        this.video.srcObject = this.stream;
        await this.video.play();

        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        this.running = true;
        this.track();
    }

    // Tracking beenden
    stop() {
        this.running = false;

        cancelAnimationFrame(this.animationId);

        this.stream?.getTracks().forEach(track => track.stop());

        this.stream = null;
        this.video.srcObject = null;

        this.ctx.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );
    }

    track() {
        if (!this.running) return;

        if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;

            const result = this.landmarker.detectForVideo(
                this.video,
                performance.now()
            );

            this.drawHands(result);
            this.controlHands(result);
        }

        this.animationId = requestAnimationFrame(() => this.track());
    }

    drawHands(result) {
        this.ctx.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

        if (!result.landmarks?.length) return;

        // Aktuelle Akzentfarbe von Thema
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

        //Linien zwischen Handpnkten zeichnen 
        for (const hand of result.landmarks) {
            this.drawer.drawConnectors(
                hand,
                this.handConnections,
                {
                    color: accent,
                    lineWidth: 3
                }
            );

            // Landmark-Punke zeichnen 
            this.drawer.drawLandmarks(hand, {
                color: accent,
                fillColor: accent,
                radius: 3
            });
        }
    }

    controlHands(result) {
        if (!result.landmarks?.length) return;

        // Mediapipe-Bezeichnung für linke oder rechte Hand holen
        const handednessList = result.handedness ?? result.handednesses;

        for (let i = 0; i < result.landmarks.length; i++) {
            const hand = result.landmarks[i];

            // Handzuordnung 
            const handedness = handednessList?.[i]?.[0]?.categoryName;

            // Rechts steuert Pinsel und Links Geschwindigkeit
            if (handedness === 'Right') {
                this.moveBrush(hand);
            } else if (handedness === 'Left') {
                this.controlSpeed(hand);
            }
        }
    }

    moveBrush(hand) {
        const automaton = this.getAutomaton();

        if (!automaton) return;

        // Punkt 8 = Zeigefingerspitze
        const fingerTip = hand[8];

        // X-Kooridinate spiegeln, weil Kamera gespiegelt 
        const canvasX = (1 - fingerTip.x) * automaton.canvas.width;

        const canvasY = fingerTip.y * automaton.canvas.height;

        // Pinsel hier anwenden 
        automaton.applyBrushAt(canvasX, canvasY);
    }

    controlSpeed(hand) {
        const thumbTip = hand[4];
        const indexTip = hand[8];

        // Abstand zwischen Daumen und Zeigefinger 
        const distance = Math.hypot(
            thumbTip.x - indexTip.x,
            thumbTip.y - indexTip.y
        );

        // Pinch-Geste
        const isPinching = distance < 0.05;

        if (!isPinching) return;

        const mirroredX = 1 - indexTip.x;

        const min = Number(this.speedSlider.min);
        const max = Number(this.speedSlider.max);

        const newSpeed = min + mirroredX * (max - min);

        this.smoothedSpeed = this.smoothedSpeed * 0.8 + newSpeed * 0.2;

        this.speedSlider.value = this.smoothedSpeed.toFixed(2);

        this.speedSlider.dispatchEvent(
            new Event('input', {
                bubbles: true
            })
        );
    }
}