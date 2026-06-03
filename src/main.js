import { Automaton } from './automata/Automaton.js';

const canvas = document.getElementById('canvas-1');
const automaton = new Automaton(canvas, 'gameOfLife');
automaton.setBPM(1000);
automaton.start();