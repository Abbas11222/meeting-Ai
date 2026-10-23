/**
 * Microphone: records short audio parts and reports the sound level.
 * It knows nothing about the page. The caller decides what to do with the data.
 */
const Microphone = {
  active: false,
  stream: null,
  audioContext: null,
  recorder: null,
  cutTimer: null,
  animationFrame: 0,

  /**
   * @param {Function} onChunk   called with an audio Blob every few seconds
   * @param {Function} onLevels  called many times per second with sound levels (0-255)
   * @param {boolean}  record    false = only show the sound level, do not record audio parts
   */
  async start({ onChunk, onLevels, record = true }) {
    this.recording = record;
    if (!window.MediaRecorder) {
      throw new Error('This browser cannot record audio.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.active = true;
    this.onChunk = onChunk;

    this.watchLevels(onLevels);
    if (record) this.recordNextChunk();
  },

  /** Stops recording audio parts (the sound level keeps moving). Pending audio is dropped. */
  stopRecording() {
    this.recording = false;
    this.onChunk = () => {};
    clearTimeout(this.cutTimer);
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  },

  stop() {
    this.active = false;
    clearTimeout(this.cutTimer);
    cancelAnimationFrame(this.animationFrame);

    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop(); // sends the last part
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
    }
    this.stream = this.audioContext = this.recorder = null;
  },

  /** Records one part, then starts the next one. Each part is a complete audio file. */
  recordNextChunk() {
    if (!this.active || !this.recording) return;

    const recorder = new MediaRecorder(this.stream);
    const pieces = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) pieces.push(event.data);
    };
    recorder.onstop = () => {
      this.recordNextChunk();
      if (pieces.length > 0) {
        this.onChunk(new Blob(pieces, { type: recorder.mimeType }));
      }
    };

    recorder.start();
    this.recorder = recorder;
    this.cutTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, CONFIG.AUDIO_CHUNK_MS);
  },

  /** Reads the sound level continuously for the moving bars. */
  watchLevels(onLevels) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();

    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 128;
    this.audioContext.createMediaStreamSource(this.stream).connect(analyser);

    const levels = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(levels);
      onLevels(levels);
      this.animationFrame = requestAnimationFrame(loop);
    };
    loop();
  },
};