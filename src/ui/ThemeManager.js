export const THEMES = {
    rosa:  { alive: '#ff4d8f', dead: '#423439', accent: '#ff4d8f', bg: '#1a0a12', surface: '#2d1220' },
    sw:    { alive: '#ffffff', dead: '#1a1a1a', accent: '#cccccc', bg: '#000000', surface: '#2a2a2a' },
    green: { alive: '#39ff14', dead: '#0a1a0a', accent: '#39ff14', bg: '#050f05', surface: '#0d2a0d' },
    blue:  { alive: '#4d9fff', dead: '#0d1b2a', accent: '#4d9fff', bg: '#050a1a', surface: '#0d1b2a' },
};

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
