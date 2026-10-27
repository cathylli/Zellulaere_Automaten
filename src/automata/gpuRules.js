// GLSL-Gegenstück zu rules.js: Rumpf der Funktion rule(self, alive, firing) für jeden Automaten
// self   = eigener Zustand (0, 1 oder 2)
// alive  = Anzahl der Nachbarn mit Zustand ungleich 0
// firing = Anzahl der Nachbarn mit Zustand genau 1 (für Brian's Brain; "active" ist in GLSL reserviert)
export const GPU_RULES = {
    // Regeln für Game Of Life
    gameOfLife: `
        if (self != 0.0) return (alive == 2 || alive == 3) ? 1.0 : 0.0;
        return alive == 3 ? 1.0 : 0.0;`,

    // Regeln für HighLife: repliziert sich zusätzlich bei 6 Nachbarn
    highLife: `
        if (self != 0.0) return (alive == 2 || alive == 3) ? 1.0 : 0.0;
        return (alive == 3 || alive == 6) ? 1.0 : 0.0;`,

    // Regeln für Seeds: jede lebende Zelle stirbt sofort, Geburt bei exakt 2
    seeds: `
        if (self != 0.0) return 0.0;
        return alive == 2 ? 1.0 : 0.0;`,

    // Brian's Brain: aktiv → sterbend → tot, tot → aktiv bei genau 2 aktiven Nachbarn
    briansBrain: `
        if (self == 1.0) return 2.0;
        if (self == 2.0) return 0.0;
        return firing == 2 ? 1.0 : 0.0;`,
};
