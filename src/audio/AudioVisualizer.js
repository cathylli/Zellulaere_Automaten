class Visualizer {

    /**
     * Construct a visualizer instance
     * 
     * @param {*} analyzer An analyzer providing the frequency donmain data
     * @param {*} canvas The canvas to draw on
     */
    constructor(analyzer, canvas) {
        this.canvas = canvas;
        this.canvasContext = canvas.getContext('2d');
        this.analyzer = analyzer;
    }

    /**
     * Draw a visualization of a three-band Equalizer
     * 
     * @param {*} lowShelfCutoff The frequency separating low and mid band
     * @param {*} highShelfCutoff The frequency separating mid and high band
     */
    draw(lowShelfCutoff, highShelfCutoff) {

        this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const buffer = this.analyzer.getBuffer();
        this.drawFFT(buffer, this.canvas);

        // visualize frequency bands
        this.drawFrequencyBand(0, lowShelfCutoff);
        this.drawFrequencyBand(lowShelfCutoff, highShelfCutoff);
        this.drawFrequencyBand(highShelfCutoff, this.analyzer.maxFrequency());
    };

    /**
     * Draw frequency domain data on canvas
    * @param {*} data An Uint8Array containing the frequency domain data to draw
    * @param {*} canvas The canvas to draw on
    */
    drawFFT(data, canvas) {

        // Farben aus Theme auslesen
        const style = getComputedStyle(document.documentElement);
        const bg = style.getPropertyValue('--bg').trim();
        const accent = style.getPropertyValue('--accent').trim();

        const canvasContext = canvas.getContext("2d");
        canvasContext.fillStyle = bg;
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);

        let barWidth = (canvas.width / data.length);
        let x = 0;

        for (let i = 0; i < data.length; ++i) {
            let barHeight = data[i]
            canvasContext.fillStyle = accent;
            canvasContext.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            x += barWidth;
        }

    }

    /**
    * Draw a frequency band as a box without fill
    * 
    * @param {*} lowestFrequency The lowest frequency in the band
    * @param {*} highestFrequency The highest frequency in the band
    *  
    */
    drawFrequencyBand(lowestFrequency, highestFrequency) {

        // TODO 3.1: request maximum frequency and buffer from analyzer (1 P)
        const buffer = this.analyzer.getBuffer();
        const maxFrequency = this.analyzer.maxFrequency();

        // TODO 3.2: Compute array indices corresponding to lower and higher threshold (1 P)
        const lower = Math.floor(lowestFrequency / maxFrequency * buffer.length);
        const higher = Math.floor(highestFrequency / maxFrequency * buffer.length);


        // TODO 3.3: Compute average amplitude of frequency band (1 P)
        let sum = 0;
        for (let i = lower; i < higher; i++) {
            sum += buffer[i];
        }
        //durch Anzahl der Werte teilen
        const average = sum / (higher - lower);

        // TODO 3.4: Draw rectangle without fill (3 P)
        const style = getComputedStyle(document.documentElement);
        const accent = style.getPropertyValue('--accent').trim();

        const canvasContext = this.canvas.getContext("2d");
        canvasContext.strokeStyle = accent + '80';
        
        canvasContext.lineWidth = 2;

        let x = (lower / buffer.length) * this.canvas.width
        let y = this.canvas.height - average;
        let breite = ((higher - lower) / buffer.length * this.canvas.width);

        canvasContext.strokeRect(x, y, breite, average);
        
    }
}

export default Visualizer;