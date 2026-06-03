import { Automaton } from './automata/Automaton.js';
import { AudioEngine } from './audio/AudioEngine.js';


const canvas = document.getElementById('canvas-1');
const automaton = new Automaton(canvas, 'gameOfLife');
automaton.setBPM(1000);
window.addEventListener('keydown', (e) => {
    if (e.key === '1') automaton.setBrushMode('spray');
    if (e.key === '2') automaton.setBrushMode('heat');
    if (e.key === '3') automaton.setBrushMode('storm');
    if (e.key === '4') automaton.setBrushMode('erase');
});

automaton.start();





//Audiotest
const audioEngine = new AudioEngine();

//Test-Sound laden
const testTrackUrl = 'public/audio/groovy-vibe.mp3';

const playBtn = document.getElementById('btn-play');
const stopBtn = document.getElementById('btn-stop');

playBtn.addEventListener('click', async () => {
    //AudioEngine aktivieren
    audioEngine.init();
    
    //Track laden
    if (!audioEngine.audioBuffer) {
        playBtn.innerText = "Lädt...";
        const success = await audioEngine.loadFile(testTrackUrl);
        if (!success) {
            playBtn.innerText = "Fehler beim Laden";
            return;
        }
    }
    
    //Abspielen
    audioEngine.play();
    playBtn.innerText = "Spielt!";
});

stopBtn.addEventListener('click', () => {
    audioEngine.stop();
    playBtn.innerText = "Musik abspielen";
});