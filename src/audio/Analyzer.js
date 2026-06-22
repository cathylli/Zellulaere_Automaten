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
    const avgEnergy = buffer.reduce((sum, value) => sum + value, 0) / buffer.length;
    return avgEnergy;
  }
}

export default Analyzer;
