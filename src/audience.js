// Zuschauer-Fenster: spiegelt den Automaten-Canvas aus dem Bedienfenster
const canvas = document.getElementById('audience-canvas');
const ctx = canvas.getContext('2d');
const hint = document.getElementById('audience-hint');

// Hinweis nach ein paar Sekunden ausblenden
setTimeout(() => { hint.style.display = 'none'; }, 3000);

// Doppelklick schaltet Vollbild ein/aus
document.addEventListener('dblclick', () => {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen();
    }
});

function draw() {
    requestAnimationFrame(draw);

    // Eigene Auflösung an die Fenstergröße anpassen
    const width = Math.round(canvas.clientWidth * window.devicePixelRatio);
    const height = Math.round(canvas.clientHeight * window.devicePixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Canvas jedes Mal neu holen, falls das Bedienfenster neu geladen wurde
    const source = window.opener && !window.opener.closed
        ? window.opener.document.getElementById('canvas-1')
        : null;
    if (!source || source.width === 0 || source.height === 0) return;

    // Seitenverhältnis beibehalten und mittig einpassen
    const scale = Math.min(width / source.width, height / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;

    // Zellen scharf skalieren statt verwaschen
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        source,
        (width - drawWidth) / 2,
        (height - drawHeight) / 2,
        drawWidth,
        drawHeight
    );
}

draw();
