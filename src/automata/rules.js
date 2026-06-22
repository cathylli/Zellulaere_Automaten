// prüft wie viele Nachbarn eine Zelle hat und entscheidet, ob sie lebt oder stirbt
//TODO Möglichkeit zur Bestimmung verschiedener Nachbarn 
function getNeighbors(grid, r, c, rows, cols) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = (r + dr + rows) % rows; 
            const nc = (c + dc + cols) % cols;
            count += grid[nr][nc] ? 1 : 0;  
        }
    }
    return count;
}

// definiert die Regeln für die Automaten
export const RULES = {
    //Regeln für Game Of Life
    "gameOfLife": (grid, r, c, rows, cols) => {
        const n = getNeighbors(grid, r, c, rows, cols);
        if (grid[r][c]) return (n === 2 || n === 3) ? 1 : 0;
        else return (n === 3) ? 1 : 0;
    },
    // Regeln für HighLife (ein anderer bekannter Automat)
    "highLife": (grid, r, c, rows, cols) => {
        const n = getNeighbors(grid, r, c, rows, cols);
        if (grid[r][c]) return (n === 2 || n === 3) ? 1 : 0; 
        else return (n === 3 || n === 6) ? 1 : 0;           // Repliziert sich zusätzlich bei 6 Nachbarn
    },
    //Regeln für Seeds
    "seeds": (grid, r, c, rows, cols) => {
        const n = getNeighbors(grid, r, c, rows, cols);
        if (grid[r][c]) return 0;                            // Jede lebende Zelle stirbt sofort
        else return (n === 2) ? 1 : 0;                      // Geburt bei exakt 2
    }
};