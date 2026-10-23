export const THEMES = {
    rosa:  { label: 'Rosa', alive: '#ff4d8f', dead: '#423439', accent: '#ff4d8f', bg: '#1a0a12', surface: '#2d1220' },
    sw:    { label: 'S/W',  alive: '#ffffff', dead: '#1a1a1a', accent: '#cccccc', bg: '#000000', surface: '#2a2a2a' },
    green: { label: 'Grün', alive: '#39ff14', dead: '#0a1a0a', accent: '#39ff14', bg: '#050f05', surface: '#0d2a0d' },
    blue:  { label: 'Blau', alive: '#4d9fff', dead: '#0d1b2a', accent: '#4d9fff', bg: '#050a1a', surface: '#0d1b2a' },
};

// Tetris-Teile für die Theme-Buttons: Zellen als [Spalte, Zeile]
const PIECES = [
    [[0, 0], [1, 0], [2, 0], [1, 1]], // T
    [[2, 0], [0, 1], [1, 1], [2, 1]], // L
    [[1, 0], [2, 0], [0, 1], [1, 1]], // S
    [[0, 0], [1, 0], [0, 1], [1, 1]], // O
];
const PIECE_CELL = 10;    // Kantenlänge einer Zelle im SVG
const PIECE_GAP = 1;      // Fuge zwischen den Zellen, wie beim Automaten
const PIECE_PIXELS = 7;   // dargestellte Kantenlänge einer Zelle im Button (px)

// Erzeugt einen runden Button pro Theme: Hintergrund wie der Automat, Tetris-Teil in der Zellfarbe
// onSelect(key) wird beim Klick aufgerufen
export function createThemeButtons(container, activeKey, onSelect) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const buttons = [];

    Object.entries(THEMES).forEach(([key, theme], index) => {
        const cells = PIECES[index % PIECES.length];
        const width = Math.max(...cells.map(([c]) => c)) + 1;
        const height = Math.max(...cells.map(([, r]) => r)) + 1;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-button';
        button.title = theme.label;
        button.setAttribute('aria-label', `Thema ${theme.label}`);
        button.setAttribute('aria-pressed', String(key === activeKey));
        // Vorschau: Hintergrund wie die toten Zellen des Automaten, Rahmen in der Akzentfarbe
        button.style.setProperty('--theme-dead', theme.dead);
        button.style.setProperty('--theme-accent', theme.accent);

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${width * PIECE_CELL} ${height * PIECE_CELL}`);
        svg.setAttribute('width', width * PIECE_PIXELS);
        svg.setAttribute('height', height * PIECE_PIXELS);
        svg.setAttribute('aria-hidden', 'true');

        cells.forEach(([c, r]) => {
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', c * PIECE_CELL + PIECE_GAP / 2);
            rect.setAttribute('y', r * PIECE_CELL + PIECE_GAP / 2);
            rect.setAttribute('width', PIECE_CELL - PIECE_GAP);
            rect.setAttribute('height', PIECE_CELL - PIECE_GAP);
            rect.setAttribute('fill', theme.alive);
            rect.setAttribute('stroke', theme.dead);
            rect.setAttribute('stroke-width', '1');
            svg.appendChild(rect);
        });

        button.appendChild(svg);
        button.addEventListener('click', () => {
            buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
            onSelect(key);
        });

        container.appendChild(button);
        buttons.push(button);
    });
}

export function apply(key, automaton) {
    const theme = THEMES[key];
    if (!theme) return;

    document.body.dataset.theme = key;
    automaton.colors = theme;
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--bg', theme.bg);
    document.documentElement.style.setProperty('--surface', theme.surface);

    automaton.draw();
}
