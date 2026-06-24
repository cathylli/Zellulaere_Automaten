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
}

export default Analyzer;
