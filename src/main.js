import { Automaton } from './automata/Automaton.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { DropZoneHandler } from './ui/DropZoneHandler.js';

const audioEngine = new AudioEngine();
const testTrackUrl = 'public/audio/groovy-vibe.mp3';

window.addEventListener('load', () => {
    const canvas = document.getElementById('canvas-1');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const automaton = new Automaton(canvas, 'highLife');
    automaton.setBPM(1000);
    automaton.start();

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
        });
    });

    // Audio
    const playBtn = document.getElementById('btn-play');
    const stopBtn = document.getElementById('btn-stop');

    playBtn.addEventListener('click', async () => {
        audioEngine.init();
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
});