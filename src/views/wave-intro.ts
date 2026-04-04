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
 * The overlay sits above the already-rendered view content (z-index 10)
 * so the content is ready the moment the animation completes.
 *
 * Respects `prefers-reduced-motion` via the CSS class
 * `.sin-wave-intro-overlay` which is hidden in that case.
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
      // Bail out immediately if the overlay is hidden (reduced-motion CSS).
      const style = getComputedStyle(this.overlay);
      if (style.display === "none") {
        this.remove();
        resolve();
        return;
      }

      // Defer to the next animation frame so the browser has performed
      // layout before we read dimensions (avoids sizeCanvas returning 0).
      requestAnimationFrame(() => {
        this.sizeCanvas();

        const ctx = this.canvas.getContext("2d");
        // Bail out if canvas still has no area (e.g. collapsed pane).
        if (!ctx || this.canvas.width === 0 || this.canvas.height === 0) {
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
            // ── Phase 1: line extends from centre ──────────────
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
            // ── Phase 2: sine wave grows ────────────────────────
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
            // ── Phase 3: wave expands, overlay fades out ────────
            const p = (t - PHASE2_END) / (PHASE3_END - PHASE2_END);
            const amplitude = 35 + p * 80;
            const frequency = Math.max(0.01, 0.025 - p * 0.01);
            const offset = t * 0.003;
            const alpha = 1 - p;

            this.overlay.style.opacity = String(alpha);

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
            // ── Done ───────────────────────────────────────────
            this.remove();
            resolve();
            return;
          }

          this.rafId = requestAnimationFrame(tick);
        };

        // Kick off the animation loop
        this.rafId = requestAnimationFrame(tick);
      }); // end outer rAF
    });
  }

  /** Immediately abort the animation and remove the overlay. */
  destroy(): void {
    this.remove();
  }

  // ----------------------------------------------------------

  private sizeCanvas(): void {
    // getBoundingClientRect forces layout and returns real dimensions,
    // avoiding the clientWidth/clientHeight = 0 problem during first render.
    const overlayRect = this.overlay.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    const w = Math.round(overlayRect.width || containerRect.width) || 600;
    const h = Math.round(overlayRect.height || containerRect.height) || 400;

    this.canvas.width = w;
    this.canvas.height = h;
  }

  private remove(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlay.remove();
  }
}
