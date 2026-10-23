import { Automaton } from './automata/Automaton.js';
import { SmoothAutomaton } from './automata/SmoothAutomaton.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { DropZoneHandler } from './ui/DropZoneHandler.js';
import  Visualizer  from './audio/AudioVisualizer.js';
import Analyzer from './audio/Analyzer.js';
import { apply } from './ui/ThemeManager.js';
import { Handtrack } from './tracking/HandTrack.js';
import { CanvasRecorder } from './recording/CanvasRecorder.js';

const audioEngine = new AudioEngine();
const testTrackUrl = '/audio/groovy-vibe.mp3';

window.addEventListener('load', () => {
    const canvas = document.getElementById('canvas-1');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const recordButton = document.getElementById('record-btn');
    recordButton.disabled = true;

    const canvasRecorder = new CanvasRecorder(canvas, recordButton, audioEngine);

    let automaton = new Automaton(canvas, 'highLife');
    let currentTheme = 'rosa';
    apply(currentTheme, automaton);
    automaton.setBPM(1000);
    automaton.start();

    function switchAutomaton(type) {
        // Pinseleinstellungen merken, da jede neue Instanz mit den Standardwerten startet
        const previousBrushMode = automaton.brushMode;
        const previousBrushRadius = automaton.brushRadius;

        automaton.stop();
        if (type === 'highLife') {
            automaton = new Automaton(canvas, 'highLife');
            automaton.setBPM(1000);
        } else if (type === 'gameOfLife') {
            automaton = new Automaton(canvas, 'gameOfLife');
            automaton.setBPM(1000);
        } else if (type === 'seeds') {
            automaton = new Automaton(canvas, 'seeds');
            automaton.setBPM(1000);
        } else if (type === 'smooth') {
            automaton = new SmoothAutomaton(canvas);
            automaton.setBPM(200);
        } else if (type === 'briansBrain') {
            automaton = new Automaton(canvas, 'briansBrain');
            automaton.setBPM(1000);
        }
        automaton.setBrushMode(previousBrushMode);
        automaton.setBrushRadius(previousBrushRadius);
        apply(currentTheme, automaton);
        applyHeatState();
        automaton.start();
    }

    // Resize
    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            automaton.cols = Math.floor(canvas.width / automaton.cellsize);
            automaton.rows = Math.floor(canvas.height / automaton.cellsize);
            automaton.grid = Array.from({ length: automaton.rows }, (_, r) =>
                Array.from({ length: automaton.cols }, (_, c) =>
                    automaton.grid[r]?.[c] ?? 0
                )
            );
            automaton.draw();
        }, 100);
    });
    resizeObserver.observe(canvas);

    // Setzt den Pinselmodus und hält die Sidebar-Markierung synchron
    function selectBrushMode(mode) {
        document.querySelectorAll('.brush-item').forEach(item => {
            item.classList.toggle('active', item.dataset.mode === mode);
        });
        automaton.setBrushMode(mode);
    }

    // Brush-Modus per Tastatur
    const brushKeys = { '1': 'spray', '2': 'heat', '3': 'storm', '4': 'erase' };

    window.addEventListener('keydown', (e) => {
        const mode = brushKeys[e.key];
        if (mode) selectBrushMode(mode);
    });

    // Brush-Modus per UI-Buttons
    document.querySelectorAll('.brush-item').forEach(item => {
        item.addEventListener('click', () => selectBrushMode(item.dataset.mode));
    });

    // Pinselradius
    const brushRadiusSlider = document.getElementById('brush-radius-slider');
    const brushRadiusValue = document.getElementById('brush-radius-value');

    automaton.setBrushRadius(brushRadiusSlider.value);

    brushRadiusSlider.addEventListener('input', (event) => {
        const radius = Number(event.target.value);

        automaton.setBrushRadius(radius);
        brushRadiusValue.textContent = radius;
    });

    // Wärme-Spur: Darstellungsart, die für jede Regel zuschaltbar ist
    const heatToggle = document.getElementById('heat-toggle');
    let heatEnabled = false;

    function applyHeatState() {
        // Smooth Life bringt eine eigene Farbabbildung mit und kennt keine Wärme-Schicht
        const isSupported = !(automaton instanceof SmoothAutomaton);
        const isActive = isSupported && heatEnabled;

        heatToggle.disabled = !isSupported;
        heatToggle.setAttribute('aria-checked', String(isActive));
        heatToggle.textContent = isActive ? 'AN' : 'AUS';

        automaton.setHeatEnabled(isActive);
    }

    heatToggle.addEventListener('click', () => {
        heatEnabled = !heatEnabled;
        applyHeatState();
    });

    // Drop-Zone für Audiodateien
    const dropZone = new DropZoneHandler(document.querySelector('#drop-zone'), async (file) => {
        audioEngine.stop();
        await audioEngine.loadFile(file);
        audioEngine.play();
        syncLiveToggle();
    });

    // Audio-Track Auswahl
    document.querySelectorAll('.audio-item').forEach(item => {
        item.addEventListener('click', async () => {
            document.querySelectorAll('.audio-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            audioEngine.stop();
            await audioEngine.loadFile(item.dataset.audio);
            audioEngine.play();
            syncLiveToggle();
            playBtn.innerText = 'Spielt!';
            recordButton.disabled = false;
        });
    });

    // Audio
    const playBtn = document.getElementById('btn-play');
    const stopBtn = document.getElementById('btn-stop');

    // Speed
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');

    playBtn.addEventListener('click', async () => {
        if (audioEngine.isPlaying) return;
        if (!audioEngine.audioBuffer) {
            playBtn.innerText = 'Lädt...';
            const success = await audioEngine.loadFile(testTrackUrl);
            if (!success) {
                playBtn.innerText = 'Fehler beim Laden';
                return;
            }
        }
        audioEngine.play();
        syncLiveToggle();
        playBtn.innerText = 'Spielt!';
        recordButton.disabled = false;
    });

    stopBtn.addEventListener('click', () => {
        audioEngine.stop();
        audioEngine.stopLiveInput();
        syncLiveToggle();
        playBtn.innerText = 'Play';
    });

    speedSlider.addEventListener('input', (event) => {
        const speed = Number(event.target.value);

        audioEngine.setPlaybackRate(speed);
        speedValue.textContent = `${speed.toFixed(2)}x`;
    })

    // Bass-Schwelle: ab welchem Bass-Level das Gitter zufällig belebt wird
    const bassThresholdSlider = document.getElementById('bass-threshold-slider');
    const bassThresholdValue = document.getElementById('bass-threshold-value');
    let bassThreshold = Number(bassThresholdSlider.value);

    bassThresholdSlider.addEventListener('input', (event) => {
        bassThreshold = Number(event.target.value);
        bassThresholdValue.textContent = bassThreshold;
    });

    // Live-Eingang (Mischpult): ersetzt die Track-Wiedergabe als Audioquelle
    const liveToggle = document.getElementById('live-toggle');
    const liveDeviceSelect = document.getElementById('live-device-select');

    function syncLiveToggle() {
        liveToggle.setAttribute('aria-checked', String(audioEngine.isLive));
        liveToggle.textContent = audioEngine.isLive ? 'AN' : 'AUS';
    }

    async function refreshInputDevices() {
        const selectedId = liveDeviceSelect.value;
        const inputs = await audioEngine.getInputDevices();

        liveDeviceSelect.innerHTML = '<option value="">Standard-Eingang</option>';
        inputs.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Eingang ${index + 1}`;
            liveDeviceSelect.appendChild(option);
        });

        // Vorherige Auswahl beibehalten, falls das Gerät noch da ist
        if ([...liveDeviceSelect.options].some(o => o.value === selectedId)) {
            liveDeviceSelect.value = selectedId;
        }
    }

    async function startLive() {
        try {
            await audioEngine.startLiveInput(liveDeviceSelect.value || null);
            // Nach der Freigabe sind die Gerätenamen sichtbar
            await refreshInputDevices();
            playBtn.innerText = 'Play';
            recordButton.disabled = false;
        } catch (error) {
            console.error("Live-Eingang konnte nicht gestartet werden:", error);
        }
        syncLiveToggle();
    }

    liveToggle.addEventListener('click', () => {
        if (audioEngine.isLive) {
            audioEngine.stopLiveInput();
            syncLiveToggle();
        } else {
            startLive();
        }
    });

    // Gerätewechsel während des Live-Betriebs: direkt neu verbinden
    liveDeviceSelect.addEventListener('change', () => {
        if (audioEngine.isLive) startLive();
    });

    navigator.mediaDevices.addEventListener('devicechange', refreshInputDevices);
    refreshInputDevices();

    // Eingangs-Gain für den Live-Eingang
    const inputGainSlider = document.getElementById('input-gain-slider');
    const inputGainValue = document.getElementById('input-gain-value');

    inputGainSlider.addEventListener('input', (event) => {
        const gain = Number(event.target.value);

        audioEngine.setInputGain(gain);
        inputGainValue.textContent = `${gain.toFixed(2)}x`;
    });

    // Vorbereitung für den Audio-Visualizer
    audioEngine.init();
    const audioContext = audioEngine.ctx;
    const analyzer = new Analyzer(audioContext);
    audioEngine.analyzerNode = analyzer.analyzerNode;

    const lowShelfCutoff = 500;
    const highShelfCutoff = 5000;

    // Audio-Visualizer
    const visualizerCanvas = document.getElementById('visualizer-canvas');
    const visualizer = new Visualizer(analyzer, visualizerCanvas);

    // Automat wechseln
    document.querySelectorAll('.automaton-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.automaton-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            switchAutomaton(item.dataset.automaton);
        });
    });

    // Theme Manager
    const themeButtons = document.querySelectorAll('.theme-item');
    themeButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentTheme = button.dataset.color;
            apply(currentTheme, automaton);
            themeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // Handtrack-Window
    const trackingWindow = document.getElementById('tracking-window');
    const trackingToggle = document.getElementById('tracking-toggle');

    // Klick auf Pfeil minimiert oder öffnet
    trackingToggle.addEventListener('click', () => {
        const isMinimized = trackingWindow.classList.toggle('minimized');

        trackingToggle.setAttribute('aria-label', isMinimized
                ? 'Kamerafenster öffnen'
                : 'Kamerafenster minimieren'
        );
    });

    // Handtracking
    const handVideo = document.getElementById('hand-video');
    const handCanvas = document.getElementById('hand-canvas');

    const cameraButton = document.getElementById('btn-camera');
    const cameraPlaceholder = document.getElementById('camera-placeholder');

    // Handtracking-Objekt erstellen
    const handtrack = new Handtrack(
        handVideo,
        handCanvas,
        () => automaton,
        speedSlider
    );

    let cameraIsRunning = false;

    // Kamera starten oder stoppen
    cameraButton.addEventListener('click', async () => {
        cameraButton.disabled = true;

        try {
            if (!cameraIsRunning) {
                cameraButton.textContent =
                    'KAMERA WIRD GESTARTET ...';

                await handtrack.start();

                cameraIsRunning = true;

                cameraButton.classList.add('is-active');
                cameraButton.textContent = 'KAMERA STOPPEN';

                cameraPlaceholder.style.display = 'none';
            } else {
                handtrack.stop();

                cameraIsRunning = false;

                cameraButton.classList.remove('is-active');
                cameraButton.textContent = 'KAMERA STARTEN';

                cameraPlaceholder.style.display = '';
            }
        } catch (error) {
            cameraIsRunning = false;

            cameraButton.classList.remove('is-active');
            cameraButton.textContent = 'KAMERA-FEHLER';

            cameraPlaceholder.style.display = '';

            console.error(error);
        } finally {
            cameraButton.disabled = false;
        }
    });

    // Zuschauer-Fenster: zeigt nur den Automaten, z.B. auf dem Beamer
    const audienceToggle = document.getElementById('audience-toggle');
    let audienceWindow = null;

    function syncAudienceToggle() {
        const isOpen = audienceWindow !== null && !audienceWindow.closed;
        audienceToggle.setAttribute('aria-checked', String(isOpen));
        audienceToggle.textContent = isOpen ? 'AN' : 'AUS';
    }

    audienceToggle.addEventListener('click', () => {
        if (audienceWindow && !audienceWindow.closed) {
            audienceWindow.close();
            audienceWindow = null;
        } else {
            audienceWindow = window.open('/audience.html', 'audience', 'popup,width=1280,height=720');
        }
        syncAudienceToggle();
    });

    // Falls das Zuschauer-Fenster direkt geschlossen wird, Schalter zurücksetzen
    setInterval(syncAudienceToggle, 500);

    // Zuschauer-Fenster mitschließen, wenn die Bedienung geschlossen wird
    window.addEventListener('beforeunload', () => audienceWindow?.close());

    // Aufleuchten von Smooth Life: folgt Schlägen, die aus der Musik herausstechen
    let loudnessAverage = 0;
    const pulseSensitivity = 1.5; // höher = schon kleinere Schläge leuchten voll auf

    // Main draw loop
    function visualize() {
        requestAnimationFrame(visualize);
        visualizer.draw(lowShelfCutoff, highShelfCutoff);

        
        if (audioEngine.isActive) {
            //Energy aus dem Song ableiten und auf den Automaten anwenden
            const energy = analyzer.getEnergy(); // 0–255
            const multiplyer = 100; // Faktor, um die BPM zu erhöhen
            const bpm = Math.max(60, energy * multiplyer);

            automaton.setBPM(bpm);

            // Bass-Level aus dem Song ableiten und auf den Automaten anwenden
            const bassLevel = analyzer.getBassLevel();
            if (automaton instanceof SmoothAutomaton) {
                // Lautstärke relativ zum Durchschnitt der letzten ~0,3 s: ein Schlag, der doppelt so
                // laut ist wie der Durchschnitt, ergibt excess = 1; leiser als der Durchschnitt = 0
                const loudness = analyzer.getLoudness();
                loudnessAverage += (loudness - loudnessAverage) * 0.05;
                const excess = loudnessAverage > 0 ? loudness / loudnessAverage - 1 : 0;
                automaton.flash(Math.min(1, Math.max(0, excess * pulseSensitivity)));
            } else if (bassLevel > bassThreshold) { // Wenn der Bass-Level hoch ist, randomize das Gitter
                automaton.randomizeGrid(0.01); // Zufällige Zellen aktivieren, wenn der Bass-Level hoch ist
            }
        }
    }

    visualize();
});