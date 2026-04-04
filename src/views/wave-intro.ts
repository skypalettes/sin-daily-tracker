/**
 * WaveIntro – Phase 2
 *
 * Three-phase opening animation that plays before the Wave View
 * content becomes visible:
 *
 *   Phase 1 (0 – 300 ms)  : A horizontal line extends from the centre.
 *   Phase 2 (300 – 800 ms): The line oscillates into a growing sine wave.
 *   Phase 3 (800 – 1200 ms): The wave expands and the overlay fades out.
 *
 * Whether to play is controlled entirely by the plugin setting
 * `showIntroAnimation`. We do NOT check prefers-reduced-motion via CSS
 * display because that would set display:none on the overlay and break
 * getBoundingClientRect() measurements.
 */

const PHASE1_END = 300;
const PHASE2_END = 800;
const PHASE3_END = 1200;

export class WaveIntro {
  private overlay: HTMLElement;
  private canvas: HTMLCanvasElement;
  private rafId: number | null = null;

  constructor(private container: HTMLElement) {
    this.overlay = container.createDiv({ cls: "sin-wave-intro-overlay" });
    this.canvas = this.overlay.createEl("canvas", { cls: "sin-wave-intro-canvas" });
  }

  /** Play the animation. Resolves when the overlay has been removed. */
  play(): Promise<void> {
    return new Promise((resolve) => {
      // `onOpen` may run before the leaf is revealed, so canvas dimensions
      // can start as 0.  Retry every frame (up to ~2 s) until we get real
      // dimensions from getBoundingClientRect().
      const tryStart = (attempts: number) => {
        this.sizeCanvas();
        if (this.canvas.width === 0 || this.canvas.height === 0) {
          if (attempts > 0) {
            this.rafId = requestAnimationFrame(() => tryStart(attempts - 1));
          } else {
            // Canvas never got dimensions – skip the animation silently.
            this.remove();
            resolve();
          }
          return;
        }
        // We have real dimensions – start the animation.
        this.startAnimation(resolve);
      };

      // Give the browser one frame to complete layout before we read sizes.
      requestAnimationFrame(() => tryStart(120));
    });
  }

  /** Immediately abort the animation and remove the overlay. */
  destroy(): void {
    this.remove();
  }

  // ----------------------------------------------------------

  private sizeCanvas(): void {
    // Read the CSS-rendered size of the canvas itself.
    // The canvas has `width: 100%; height: 100%` CSS so this gives us
    // the overlay dimensions.
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w > 0 && h > 0) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private startAnimation(resolve: () => void): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      this.remove();
      resolve();
      return;
    }

    const accent =
      getComputedStyle(this.container)
        .getPropertyValue("--interactive-accent")
        .trim() || "#7b6cd4";

    const { width, height } = this.canvas;
    const cx = width / 2;
    const cy = height / 2;
    const start = performance.now();

    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, width, height);

      if (t < PHASE1_END) {
        // ── Phase 1: line extends from centre ──────────────────
        const p = t / PHASE1_END;
        const halfLen = p * width * 0.6;

        ctx.beginPath();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.moveTo(cx - halfLen, cy);
        ctx.lineTo(cx + halfLen, cy);
        ctx.stroke();
        this.overlay.style.opacity = "1";

      } else if (t < PHASE2_END) {
        // ── Phase 2: sine wave grows ────────────────────────────
        const p = (t - PHASE1_END) / (PHASE2_END - PHASE1_END);
        const amplitude = p * 35;
        const frequency = 0.025;
        const offset = t * 0.003;

        ctx.beginPath();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;

        for (let x = 0; x <= width; x++) {
          const y = cy + amplitude * Math.sin(frequency * x + offset);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        this.overlay.style.opacity = "1";

      } else if (t < PHASE3_END) {
        // ── Phase 3: wave expands, overlay fades out ────────────
        const p = (t - PHASE2_END) / (PHASE3_END - PHASE2_END);
        const amplitude = 35 + p * 80;
        const frequency = Math.max(0.01, 0.025 - p * 0.01);
        const offset = t * 0.003;

        this.overlay.style.opacity = String(1 - p);

        ctx.beginPath();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2 + p;

        for (let x = 0; x <= width; x++) {
          const y = cy + amplitude * Math.sin(frequency * x + offset);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

      } else {
        // ── Done ────────────────────────────────────────────────
        this.remove();
        resolve();
        return;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private remove(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlay.remove();
  }
}
