import { Automaton } from './automata/Automaton.js';

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