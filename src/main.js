import { Automaton } from './automata/Automaton.js';
import { GradientAutomaton } from './automata/GradientAutomaton.js';
import { SmoothAutomaton } from './automata/SmoothAutomaton.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { DropZoneHandler } from './ui/DropZoneHandler.js';
import  Visualizer  from './audio/AudioVisualizer.js';
import Analyzer from './audio/Analyzer.js';
import { apply } from './ui/ThemeManager.js';

const audioEngine = new AudioEngine();
const testTrackUrl = 'public/audio/groovy-vibe.mp3';

window.addEventListener('load', () => {
    const canvas = document.getElementById('canvas-1');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    let automaton = new Automaton(canvas, 'highLife');
    let currentTheme = 'rosa';
    apply(currentTheme, automaton);
    automaton.setBPM(1000);
    automaton.start();

    function switchAutomaton(type) {
        automaton.stop();
        if (type === 'standard') {
            automaton = new Automaton(canvas, 'highLife');
            automaton.setBPM(1000);
        } else if (type === 'gradient') {
            automaton = new GradientAutomaton(canvas, 'highLife');
            automaton.setBPM(1000);
        } else if (type === 'smooth') {
            automaton = new SmoothAutomaton(canvas);
            automaton.setBPM(200);
        }
        apply(currentTheme, automaton);
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

    // Brush-Modus per Tastatur
    window.addEventListener('keydown', (e) => {
        if (e.key === '1') automaton.setBrushMode('spray');
        if (e.key === '2') automaton.setBrushMode('heat');
        if (e.key === '3') automaton.setBrushMode('storm');
        if (e.key === '4') automaton.setBrushMode('erase');
    });

    // Brush-Modus per UI-Buttons
    document.querySelectorAll('.brush-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.brush-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            automaton.setBrushMode(item.dataset.mode);
        });
    });

    // Drop-Zone für Audiodateien
    const dropZone = new DropZoneHandler(document.querySelector('#drop-zone'), async (file) => {
        audioEngine.stop();
        await audioEngine.loadFile(file);
        audioEngine.play();
    });

    // Audio-Track Auswahl
    document.querySelectorAll('.audio-item').forEach(item => {
        item.addEventListener('click', async () => {
            document.querySelectorAll('.audio-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            audioEngine.stop();
            await audioEngine.loadFile(item.dataset.audio);
            audioEngine.play();
            playBtn.innerText = 'Spielt!';
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
        playBtn.innerText = 'Spielt!';
    });

    stopBtn.addEventListener('click', () => {
        audioEngine.stop();
        playBtn.innerText = 'Play';
    });

    speedSlider.addEventListener('input', (event) => {
        const speed = Number(event.target.value);

        audioEngine.setPlaybackRate(speed);
        speedValue.textContent = `${speed.toFixed(2)}x`;
    })

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


    /**
     * Main draw loop
     */
    function visualize() {
        requestAnimationFrame(visualize);
        visualizer.draw(lowShelfCutoff, highShelfCutoff);

        
        if (audioEngine.isPlaying) {
            // Energy aus dem Song ableiten und auf den Automaten anwenden
            const energy = analyzer.getEnergy(); // 0–255
            const multiplyer = 100; // Faktor, um die BPM zu erhöhen
            const bpm = Math.max(60, energy * multiplyer);
            automaton.setBPM(bpm);

            // Bass-Level aus dem Song ableiten und auf den Automaten anwenden
            const bassLevel = analyzer.getBassLevel();
            if (bassLevel > 150) { // Wenn der Bass-Level hoch ist, randomize das Gitter
                automaton.randomizeGrid(0.01); // Zufällige Zellen aktivieren, wenn der Bass-Level hoch ist
            }
        }
    }

    visualize();
});