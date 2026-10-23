class Analyzer {
  /**
   * Construct an Analyzer instance
   *
   * @param {*} audioContext The audio context the analyzer node pertain to
   */
  constructor(audioContext) {
    this.audioContext = audioContext;

    this.analyzerNode = audioContext.createAnalyser();
    this.analyzerNode.fftSize = 2048;
    const binCount = this.analyzerNode.frequencyBinCount;
    this.fftCoefficients = new Uint8Array(binCount);
  }

  /**
   * Return the buffer containing the FFT coefficients
   *
   * @returns The buffer containing the FFT coefficients
   */
  getBuffer() {
    this.analyzerNode.getByteFrequencyData(this.fftCoefficients);
    return this.fftCoefficients;
  }

  /**
   * Return the maximum representable frequency
   *
   * @returns The maximum representable frequency
   */
  maxFrequency() {
    return this.audioContext.sampleRate / 2;
  }

  // "Energie" des Signals berechnen, um sie für die Steuerung des Automaten zu nutzen
  getEnergy() {
    const buffer = this.getBuffer();
    // normalize each bin to 0–1, square it (exponential growth), then scale back to 0–255
    const avgEnergy = buffer.reduce((sum, value) => sum + (value / 255) ** 2, 0) / buffer.length * 255;
    return avgEnergy;
  }

  getBassLevel() {
    const buffer = this.getBuffer();
    const bufferLength = buffer.length;
    const dataArray = new Uint8Array(bufferLength);
    this.analyzerNode.getByteFrequencyData(dataArray);

    // Nur die unteren 10% des Spektrums (für Bass-Bereich)
    let bassRange = Math.floor(bufferLength * 0.1); 
    let sum = 0;

    for (let i = 0; i < bassRange; i++) {
        sum += dataArray[i];
    }

    // Durchschnittswert des Bass-Bereichs (0 bis 255)
    return sum / bassRange;
}

  // Momentane Lautstärke (RMS der Wellenform, 0–1)
  // Anders als die FFT-Werte nicht über die Zeit geglättet, reagiert also sofort auf Schläge
  getLoudness() {
    if (!this.timeDomainData) {
      this.timeDomainData = new Float32Array(this.analyzerNode.fftSize);
    }
    this.analyzerNode.getFloatTimeDomainData(this.timeDomainData);

    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      sum += this.timeDomainData[i] * this.timeDomainData[i];
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }

}

export default Analyzer;
