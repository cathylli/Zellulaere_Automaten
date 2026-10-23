import { Automaton } from './automata/Automaton.js';
import { SmoothAutomaton } from './automata/SmoothAutomaton.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { DropZoneHandler } from './ui/DropZoneHandler.js';
import  Visualizer  from './audio/AudioVisualizer.js';
import Analyzer from './audio/Analyzer.js';
import { apply, createThemeButtons } from './ui/ThemeManager.js';
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

        // Neue Instanz startet mit der Standard-Zellgröße, aktuellen Zoom übernehmen
        fitGridToCanvas(false);
        automaton.randomize();

        apply(currentTheme, automaton);
        applyHeatState();
        automaton.start();
    }

    // Zoom: nur die Zellen des Automaten werden größer/kleiner, nicht die ganze Seite
    const DEFAULT_CELL_SIZE = 6;
    const MIN_CELL_SIZE = 2;
    const MAX_CELL_SIZE = 24;
    let cellSize = DEFAULT_CELL_SIZE;

    // Gitter an Canvas-Größe und Zellgröße anpassen; vorhandene Zellen bleiben (oben links) erhalten
    function fitGridToCanvas(keepGrid = true) {
        automaton.cellsize = cellSize;
        automaton.cols = Math.floor(canvas.width / cellSize);
        automaton.rows = Math.floor(canvas.height / cellSize);
        automaton.grid = Array.from({ length: automaton.rows }, (_, r) =>
            Array.from({ length: automaton.cols }, (_, c) =>
                keepGrid ? (automaton.grid[r]?.[c] ?? 0) : 0
            )
        );
        automaton.draw();
    }

    function setCellSize(size) {
        const clamped = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, size));
        if (clamped === cellSize) return;
        cellSize = clamped;
        fitGridToCanvas();
    }

    // Strg + Mausrad (auch Pinch auf dem Touchpad) abfangen, statt die Seite zu zoomen
    let wheelZoomDelta = 0;
    window.addEventListener('wheel', (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();

        // Touchpads liefern viele kleine Werte, deshalb sammeln bis ein Zoom-Schritt erreicht ist
        wheelZoomDelta += event.deltaY;
        while (Math.abs(wheelZoomDelta) >= 100) {
            setCellSize(cellSize + (wheelZoomDelta < 0 ? 1 : -1));
            wheelZoomDelta -= Math.sign(wheelZoomDelta) * 100;
        }
    }, { passive: false });

    // Strg + Plus / Minus abfangen, Strg + 0 setzt Zellgröße und Seiten-Zoom zurück
    window.addEventListener('keydown', (event) => {
        if (!event.ctrlKey && !event.metaKey) return;

        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            setCellSize(cellSize + 1);
        } else if (event.key === '-') {
            event.preventDefault();
            setCellSize(cellSize - 1);
        } else if (event.key === '0') {
            // Nicht abfangen: der Browser setzt damit auch einen alten Seiten-Zoom auf 100 % zurück
            setCellSize(DEFAULT_CELL_SIZE);
        }
    });

    // Resize
    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            fitGridToCanvas();
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
        // Beim Tippen in ein Eingabefeld keine Pinsel wechseln
        if (e.target.closest('input, select, textarea')) return;

        const mode = brushKeys[e.key];
        if (mode) selectBrushMode(mode);
    });

    // Zahlenfeld neben einem Regler: zeigt den Reglerwert an und übernimmt eingetippte Werte
    // Eingaben werden mit Enter oder beim Verlassen des Feldes übernommen; der Regler begrenzt
    // sie auf seinen Bereich und rundet auf seine Schrittweite, danach laufen dessen Listener
    function linkNumberInput(slider, numberInput, decimals = 0) {
        const show = () => {
            numberInput.value = Number(slider.value).toFixed(decimals);
        };

        slider.addEventListener('input', show);

        numberInput.addEventListener('change', () => {
            const value = Number(numberInput.value);
            if (numberInput.value === '' || !Number.isFinite(value)) {
                show(); // ungültige Eingabe verwerfen
                return;
            }
            slider.value = value;
            slider.dispatchEvent(new Event('input'));
        });

        numberInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') numberInput.blur();
            if (event.key === 'Escape') {
                show();
                numberInput.blur();
            }
        });

        show();
    }

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
    });
    linkNumberInput(brushRadiusSlider, brushRadiusValue);

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
    })
    linkNumberInput(speedSlider, speedValue, 2);

    // Bass-Schwelle: ab welchem Bass-Level das Gitter zufällig belebt wird
    const bassThresholdSlider = document.getElementById('bass-threshold-slider');
    const bassThresholdValue = document.getElementById('bass-threshold-value');
    let bassThreshold = Number(bassThresholdSlider.value);

    bassThresholdSlider.addEventListener('input', (event) => {
        bassThreshold = Number(event.target.value);
    });
    linkNumberInput(bassThresholdSlider, bassThresholdValue);

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
    });
    linkNumberInput(inputGainSlider, inputGainValue, 2);

    // Umschalter TRACKS | LIVE: zeigt nur die Bedienung der gewählten Quelle
    // Beim Wechsel wird die andere Quelle gestoppt, sonst liefe sie ohne sichtbaren Stop-Knopf weiter
    const sourceTabs = [
        { tab: document.getElementById('tab-tracks'), panel: document.getElementById('panel-tracks') },
        { tab: document.getElementById('tab-live'), panel: document.getElementById('panel-live') },
    ];

    function selectSource(selectedTab) {
        sourceTabs.forEach(({ tab, panel }) => {
            const isSelected = tab === selectedTab;
            tab.setAttribute('aria-selected', String(isSelected));
            panel.hidden = !isSelected;
        });

        if (selectedTab.id === 'tab-live') {
            audioEngine.stop();
            playBtn.innerText = 'Play';
        } else {
            audioEngine.stopLiveInput();
            syncLiveToggle();
        }
    }

    sourceTabs.forEach(({ tab }) => {
        tab.addEventListener('click', () => {
            if (tab.getAttribute('aria-selected') !== 'true') selectSource(tab);
        });
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
    createThemeButtons(document.getElementById('theme-switcher'), currentTheme, (key) => {
        currentTheme = key;
        apply(currentTheme, automaton);
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
    const audienceToggle = document.getElementById('audience-btn');
    let audienceWindow = null;

    function syncAudienceToggle() {
        const isOpen = audienceWindow !== null && !audienceWindow.closed;
        audienceToggle.setAttribute('aria-pressed', String(isOpen));
        audienceToggle.setAttribute('aria-label', isOpen ? 'Zuschauer-Fenster schließen' : 'Zuschauer-Fenster öffnen');
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

                // Bass über der Schwelle: Tempo kurzzeitig erhöhen
                if (bassLevel > bassThreshold) {
                    automaton.boost();
                }
            } else if (bassLevel > bassThreshold) { // Wenn der Bass-Level hoch ist, randomize das Gitter
                automaton.randomizeGrid(0.01); // Zufällige Zellen aktivieren, wenn der Bass-Level hoch ist
            }
        }
    }

    visualize();
});