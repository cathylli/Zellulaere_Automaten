class ThreeBandEqualizer {

    /**
   * Construct an AudioPlayer instance
   *
   * @param {*} audioContext The audio context the filter nodes pertain to
   */
    constructor(audioContext) {

        this.audioContext = audioContext;

        this.lowFilter = new BiquadFilterNode(audioContext, { type: "lowshelf" });
        this.midFilter = new BiquadFilterNode(audioContext, { type: "peaking" });
        this.highFilter = new BiquadFilterNode(audioContext, { type: "highshelf" });
    }

    /**
     * Set cutoff frequencies for low shelf and high shelf filter
     * 
     * @param {*} lowShelfCutoff The frequency separating low and mid band
     * @param {*} highShelfCutoff The frequency separating mid and high band
     */
    setCutoffFrequencies(lowShelfCutoff, highShelfCutoff) {

        this.lowFilter.frequency.value = lowShelfCutoff;
        // TODO 1.1: Compute and set center frequency of mid filter (1 P)
        let mitten = this.midFilter.frequency.value = Math.sqrt(lowShelfCutoff * highShelfCutoff);

        // TODO 1.2: Compute and set Q value of mid filter (1 P)
        this.midFilter.Q.value = mitten/(highShelfCutoff - lowShelfCutoff)
        
    }

    /**
     * Change volume of low band
     * 
     * @param {*} event 
     */
    changeLow(event) {
        // pass the current value from the input to the lowFilter node
        this.lowFilter.gain.value = event.target.value;
    }
    /**
     * Change volume of mid band
     * 
     * @param {*} event 
     */
    changeMid(event) {
        // pass the current value from the input to the midFilter node
        this.midFilter.gain.value = event.target.value;
    }
    /**
     * Change volume of high band
     * 
     * @param {*} event 
     */
    changeHigh(event) {
        // pass the current value from the input to the highFilter node
        this.highFilter.gain.value = event.target.value;
    }
}

export default ThreeBandEqualizer;