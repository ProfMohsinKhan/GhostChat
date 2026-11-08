"use client";

class CallAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private intervalId: number | null = null;
  private isPlaying = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.ctx || this.ctx.state === "closed") {
        this.ctx = new AudioContextClass();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Plays a repeating outgoing calling ring pulse (425Hz European/Standard dial tone pulse).
   */
  startOutgoingRing() {
    this.stop();
    const ctx = this.getContext();
    if (!ctx) return;
    this.isPlaying = true;

    const playPulse = () => {
      if (!this.isPlaying || !this.ctx || this.ctx.state === "closed") return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(425, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
        gain.gain.setValueAtTime(0.08, now + 0.95);
        gain.gain.linearRampToValueAtTime(0.0001, now + 1.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 1.06);
      } catch {
        // Ignored
      }
    };

    playPulse();
    this.intervalId = window.setInterval(playPulse, 3200);
  }

  /**
   * Plays a repeating cheerful incoming phone ring chime.
   */
  startIncomingRing() {
    this.stop();
    const ctx = this.getContext();
    if (!ctx) return;
    this.isPlaying = true;

    const playDoubleChime = () => {
      if (!this.isPlaying || !this.ctx || this.ctx.state === "closed") return;
      try {
        const now = this.ctx.currentTime;

        // Chime 1 (700Hz + 850Hz)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.frequency.setValueAtTime(700, now);
        osc2.frequency.setValueAtTime(850, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);

        // Chime 2 slightly higher (850Hz + 1050Hz) after 0.2s
        const osc3 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc3.frequency.setValueAtTime(1050, now + 0.2);

        gain2.gain.setValueAtTime(0.001, now + 0.2);
        gain2.gain.linearRampToValueAtTime(0.12, now + 0.24);
        gain2.gain.linearRampToValueAtTime(0.001, now + 0.7);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc3.connect(gain2);
        gain2.connect(this.ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.42);
        osc2.start(now);
        osc2.stop(now + 0.42);

        osc3.start(now + 0.2);
        osc3.stop(now + 0.72);
      } catch {
        // Ignored
      }
    };

    playDoubleChime();
    this.intervalId = window.setInterval(playDoubleChime, 2400);
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      try {
        this.ctx.close().catch(() => {});
      } catch {
        // Ignored
      }
      this.ctx = null;
    }
  }
}

export const callAudio = new CallAudioSynthesizer();
