class HomeIntro extends HTMLElement {
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private holdTimer?: number;
  private fallback?: number;
  private active = false;
  private moving = false;
  private animations: Animation[] = [];

  connectedCallback() {
    if (
      this.hidden || this.reducedMotion.matches ||
      getComputedStyle(this).visibility === 'hidden'
    ) {
      this.dismiss();
      return;
    }

    this.active = true;
    this.setAttribute('data-active', '');
    this.setAttribute('data-enhanced', '');
    this.dataset.phase = 'writing';
    this.addEventListener('click', this.handleClick);
    this.ownerDocument.addEventListener('keydown', this.handleKeyDown);
    this.ownerDocument.addEventListener('wheel', this.dismiss, { passive: true });
    this.reducedMotion.addEventListener('change', this.handleMotionChange);
    window.addEventListener('resize', this.handleResize);
    this.fallback = window.setTimeout(this.dismiss, 6500);
    void this.waitForWriting();
  }

  disconnectedCallback() {
    this.dismiss();
  }

  private async waitForWriting() {
    try {
      const writing = [...this.querySelectorAll('.signature-stroke')]
        .flatMap(stroke => stroke.getAnimations());
      await Promise.all(writing.map(animation => animation.finished));
      if (!this.active) return;
      this.holdTimer = window.setTimeout(() => { void this.moveToTitle(); }, 320);
    } catch {
      this.dismiss();
    }
  }

  private async moveToTitle() {
    if (!this.active) return;
    const artwork = this.querySelector<HTMLElement>('[data-intro-artwork]');
    const signature = artwork?.querySelector<SVGSVGElement>('svg');
    const target = this.ownerDocument.querySelector<SVGSVGElement>('[data-signature-target] > svg');
    if (!artwork || !signature || !target) {
      this.dismiss();
      return;
    }

    const origin = artwork.getBoundingClientRect();
    const from = signature.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) {
      this.dismiss();
      return;
    }

    this.moving = true;
    this.dataset.phase = 'moving';

    try {
      const scale = to.width / from.width;
      const x = to.left - origin.left - (from.left - origin.left) * scale;
      const y = to.top - origin.top - (from.top - origin.top) * scale;
      const movementOptions: KeyframeAnimationOptions = {
        duration: 1200,
        easing: 'cubic-bezier(0.65, 0, 0.25, 1)',
        fill: 'forwards',
      };
      const movement = artwork.animate([
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${x}px, ${y}px) scale(${scale})` },
      ], movementOptions);
      this.animations.push(movement);

      const hero = target.closest<HTMLElement>('.home-hero');
      const visual = this.querySelector<HTMLElement>('[data-intro-visual]');
      if (hero && visual) {
        const card = hero.getBoundingClientRect();
        const viewport = visual.getBoundingClientRect();
        const radius = getComputedStyle(hero).borderTopLeftRadius;
        const insets = [
          card.top - viewport.top,
          viewport.right - card.right,
          viewport.bottom - card.bottom,
          card.left - viewport.left,
        ].map(value => `${value}px`).join(' ');
        this.animations.push(visual.animate([
          { clipPath: 'inset(0px 0px 0px 0px round 0px)' },
          { clipPath: `inset(${insets} round ${radius})` },
        ], movementOptions));
      }

      const backdrop = this.querySelector('.home-intro-backdrop');
      if (backdrop) {
        this.animations.push(backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 1050, easing: 'ease-in-out', fill: 'forwards',
        }));
      }
      await movement.finished;
      // Paint the exact landing frame before revealing the matching static SVG.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (this.active) this.dismiss();
    } catch {
      this.dismiss();
    }
  }

  private dismiss = () => {
    this.active = false;
    this.moving = false;
    this.hidden = true;
    this.removeAttribute('data-active');
    this.dataset.phase = 'complete';
    window.clearTimeout(this.holdTimer);
    window.clearTimeout(this.fallback);
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.removeEventListener('click', this.handleClick);
    this.ownerDocument.removeEventListener('keydown', this.handleKeyDown);
    this.ownerDocument.removeEventListener('wheel', this.dismiss);
    this.reducedMotion.removeEventListener('change', this.handleMotionChange);
    window.removeEventListener('resize', this.handleResize);
  };

  private handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    this.dismiss();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') this.dismiss();
  };

  private handleMotionChange = () => {
    if (this.reducedMotion.matches) this.dismiss();
  };

  private handleResize = () => {
    if (this.moving) this.dismiss();
  };
}

if (!customElements.get('home-intro')) {
  customElements.define('home-intro', HomeIntro);
}
