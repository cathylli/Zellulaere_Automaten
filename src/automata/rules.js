// prüft wie viele Nachbarn eine Zelle hat und entscheidet, ob sie lebt oder stirbt
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

// definiert die Regeln für das Spiel des Lebens
export const RULES = {
    "gameOfLife": (grid, r, c, rows, cols) => {
        const n = getNeighbors(grid, r, c, rows, cols);
        if (grid[r][c]) return (n === 2 || n === 3) ? 1 : 0;
        else return (n === 3) ? 1 : 0;
    }
};