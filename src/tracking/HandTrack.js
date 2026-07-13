import {
    FilesetResolver,
    HandLandmarker,
    DrawingUtils
} from '@mediapipe/tasks-vision';

export class Handtrack {
    constructor(video, canvas, getAutomaton) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.getAutomaton = getAutomaton;

        this.landmarker = null;
        this.drawer = null;
        this.stream = null;

        this.running = false;
        this.lastVideoTime = -1;
        this.animationId = null;
    }

    async initialize() {
        if (this.landmarker) return;

        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        );

        this.landmarker =
            await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/' +
                        'hand_landmarker/hand_landmarker/float16/1/' +
                        'hand_landmarker.task',
                    delegate: 'GPU'
                },

                runningMode: 'VIDEO',
                numHands: 2,

                minHandDetectionConfidence: 0.6,
                minHandPresenceConfidence: 0.6,
                minTrackingConfidence: 0.6
            });

        this.drawer = new DrawingUtils(this.ctx);
    }

    async start() {
        if (this.running) return;

        await this.initialize();

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

        if (
            this.video.readyState >= 2 &&
            this.video.currentTime !== this.lastVideoTime
        ) {
            this.lastVideoTime = this.video.currentTime;

            const result = this.landmarker.detectForVideo(
                this.video,
                performance.now()
            );

            this.drawHand(result);
            this.moveBrush(result);
        }

        this.animationId =
            requestAnimationFrame(() => this.track());
    }

    drawHand(result) {
        this.ctx.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

        const hand = result.landmarks?.[0];

        if (!hand) return;

        const accent = getComputedStyle(
            document.documentElement
        ).getPropertyValue('--accent').trim();

        this.drawer.drawConnectors(
            hand,
            HandLandmarker.HAND_CONNECTIONS,
            {
                color: accent,
                lineWidth: 3
            }
        );

        this.drawer.drawLandmarks(hand, {
            color: accent,
            fillColor: accent,
            radius: 3
        });
    }

    moveBrush(result) {
        const hand = result.landmarks?.[0];
        const automaton = this.getAutomaton();

        if (!hand || !automaton) return;

        const fingerTip = hand[8];

        const canvasX =
            (1 - fingerTip.x) * automaton.canvas.width;

        const canvasY =
            fingerTip.y * automaton.canvas.height;

        automaton.applyBrushAt(canvasX, canvasY);
    }
}