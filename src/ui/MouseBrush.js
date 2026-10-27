// Maus-Pinsel: ruft onPaint(canvasX, canvasY) in Canvas-Pixeln auf, solange die Maustaste gedrückt ist
// Gibt eine Funktion zurück, die die Listener wieder entfernt (beim Wechsel des Automaten)
export function attachMouseBrush(canvas, onPaint) {
    let isDrawing = false;

    const handleMouse = (event) => {
        const rect = canvas.getBoundingClientRect();

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        onPaint((event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY);
    };

    const onDown = (event) => { isDrawing = true; handleMouse(event); };
    const onMove = (event) => { if (isDrawing) handleMouse(event); };
    const onUp = () => { isDrawing = false; };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
        canvas.removeEventListener('mousedown', onDown);
        canvas.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    };
}
