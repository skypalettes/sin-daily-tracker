/**
 * WaveIntro – Startup Animation
 *
 * CSS-based three-element opening animation:
 *   1. A glowing wave gradient rises from the bottom of the screen.
 *   2. The "Sin" logo (sine-wave SVG + text) fades in, holds, then fades out.
 *   3. The overlay fades out, revealing the main UI.
 *
 * Whether to play is controlled entirely by the plugin setting
 * `showIntroAnimation`.
 */

export class WaveIntro {
  private overlay: HTMLElement;

  constructor(private container: HTMLElement) {
    this.overlay = container.createDiv({ cls: "sin-startup-overlay" });

    // Rising wave gradient div
    this.overlay.createDiv({ cls: "sin-startup-wave" });

    // Logo container (icon + text)
    const logoContainer = this.overlay.createDiv({ cls: "sin-startup-logo-container" });

    // Sine-wave SVG icon
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.classList.add("sin-startup-logo-icon");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 5 50 Q 25 10 50 50 T 95 50");
    svg.appendChild(path);
    logoContainer.appendChild(svg);

    // "Sin" text
    logoContainer.createDiv({ cls: "sin-startup-logo-text", text: "Sin" });
  }

  /** Play the animation. Resolves when the overlay has been removed. */
  play(): Promise<void> {
    return new Promise((resolve) => {
      const logoContainer = this.overlay.querySelector(
        ".sin-startup-logo-container"
      ) as HTMLElement | null;

      if (!logoContainer) {
        this.remove();
        resolve();
        return;
      }

      logoContainer.addEventListener("animationend", (e) => {
        const event = e as AnimationEvent;
        if (event.animationName === "sin-logo-reveal") {
          this.overlay.style.opacity = "0";
          this.overlay.style.transition = "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
          setTimeout(() => {
            this.remove();
            resolve();
          }, 620);
        }
      });
    });
  }

  /** Immediately abort the animation and remove the overlay. */
  destroy(): void {
    this.remove();
  }

  private remove(): void {
    this.overlay.remove();
  }
}
