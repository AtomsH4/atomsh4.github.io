import type { MeshGradientUniforms, ShaderMount } from '@paper-design/shaders';

const palettes = {
  light: ['#d5ecfa', '#bfc6e6', '#fafcff', '#d6cbee', '#dfedf8', '#f5f0fa'],
  dark: ['#33475e', '#50506e', '#626d83', '#504960', '#384c65', '#67617a'],
};

class HeroGradient extends HTMLElement {
  private shader?: ShaderMount;
  private observer?: IntersectionObserver;
  private updatePalette?: () => void;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private darkTheme = window.matchMedia('(prefers-color-scheme: dark)');
  private visible = false;
  private loading = false;
  private failed = false;

  connectedCallback() {
    this.reducedMotion.addEventListener('change', this.handleMotionChange);
    this.darkTheme.addEventListener('change', this.handleThemeChange);
    this.ownerDocument.addEventListener('visibilitychange', this.updateMotionState);
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? false;
      this.updateMotionState();
      if (this.visible) void this.mountShader();
    });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.visible = false;
    this.observer?.disconnect();
    this.reducedMotion.removeEventListener('change', this.handleMotionChange);
    this.darkTheme.removeEventListener('change', this.handleThemeChange);
    this.ownerDocument.removeEventListener('visibilitychange', this.updateMotionState);
    this.disposeShader();
  }

  private handleMotionChange = () => {
    if (this.reducedMotion.matches) {
      this.disposeShader();
    } else {
      void this.mountShader();
    }
  };

  private handleThemeChange = () => this.updatePalette?.();

  private updateMotionState = () => {
    this.toggleAttribute('data-running', Boolean(
      this.shader && this.visible && !this.ownerDocument.hidden && !this.reducedMotion.matches,
    ));
  };

  private async mountShader() {
    if (
      !this.isConnected || !this.visible || this.reducedMotion.matches ||
      this.shader || this.loading || this.failed
    ) return;

    this.loading = true;

    try {
      const {
        ShaderMount,
        meshGradientFragmentShader,
        getShaderColorFromString,
      } = await import('@paper-design/shaders');

      if (!this.isConnected || !this.visible || this.reducedMotion.matches) return;

      const getColors = () => (
        this.darkTheme.matches ? palettes.dark : palettes.light
      ).map((color) => getShaderColorFromString(color));
      const uniforms = {
        u_colors: getColors(),
        u_colorsCount: palettes.light.length,
        u_distortion: 0.48,
        u_swirl: 0.32,
        u_grainMixer: 0,
        u_grainOverlay: 0,
        u_fit: 1,
        u_scale: 0.85,
        u_rotation: 0,
        u_offsetX: 0.3,
        u_offsetY: 0,
        u_originX: 0.5,
        u_originY: 0.5,
        u_worldWidth: 0,
        u_worldHeight: 0,
      } satisfies MeshGradientUniforms;

      // Paper also pauses its render loop offscreen and when the tab is hidden.
      this.shader = new ShaderMount(
        this,
        meshGradientFragmentShader,
        uniforms,
        { alpha: true, antialias: false, powerPreference: 'low-power' },
        0.48,
        18_000,
        1,
        600_000,
      );
      this.updatePalette = () => this.shader?.setUniforms({ u_colors: getColors() });
      this.shader.canvasElement.addEventListener('webglcontextlost', this.handleFailure, {
        once: true,
      });
      this.setAttribute('data-ready', '');
      this.updateMotionState();
    } catch {
      this.handleFailure();
    } finally {
      this.loading = false;
    }
  }

  private handleFailure = () => {
    this.failed = true;
    this.disposeShader();
  };

  private disposeShader() {
    this.shader?.dispose();
    this.shader = undefined;
    this.updatePalette = undefined;
    this.removeAttribute('data-ready');
    this.removeAttribute('data-running');
    // The constructor can leave a canvas behind if WebGL initialization fails.
    this.querySelector('canvas')?.remove();
  }
}

if (!customElements.get('hero-gradient')) {
  customElements.define('hero-gradient', HeroGradient);
}
