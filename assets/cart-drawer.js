class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.countdownIntervals = [];
    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
    this.initEnhancements();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    this.querySelector('.drawer__inner').classList.contains('is-empty') &&
      this.querySelector('.drawer__inner').classList.remove('is-empty');
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);

      if (!sectionElement) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
    });

    setTimeout(() => {
      this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      this.initEnhancements();
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }

  initEnhancements() {
    this.initCountdowns();
    this.initDiscountForms();
    this.initTermsCheckboxes();
  }

  initCountdowns() {
    this.countdownIntervals.forEach((interval) => clearInterval(interval));
    this.countdownIntervals = [];

    this.querySelectorAll('[data-cart-drawer-countdown]').forEach((countdown) => {
      const duration = Number.parseInt(countdown.dataset.duration, 10);
      let remainingSeconds = Number.isNaN(duration) ? 300 : duration;

      const renderCountdown = () => {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        countdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (remainingSeconds <= 0) {
          remainingSeconds = Number.isNaN(duration) ? 300 : duration;
          return;
        }

        remainingSeconds -= 1;
      };

      renderCountdown();
      this.countdownIntervals.push(setInterval(renderCountdown, 1000));
    });
  }

  initDiscountForms() {
    this.querySelectorAll('[data-cart-drawer-discount-form]').forEach((form) => {
      if (form.dataset.initialized === 'true') return;

      const input = form.querySelector('[data-cart-drawer-discount-input]');
      const error = form.querySelector('[data-cart-drawer-discount-error]');

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const discountCode = input?.value.trim();

        if (!discountCode) {
          if (error) error.hidden = false;
          input?.focus();
          return;
        }

        if (error) error.hidden = true;
        window.location.href = `/checkout?discount=${encodeURIComponent(discountCode)}`;
      });

      input?.addEventListener('input', () => {
        if (error) error.hidden = true;
      });

      form.dataset.initialized = 'true';
    });
  }

  initTermsCheckboxes() {
    this.querySelectorAll('[data-cart-drawer-terms]').forEach((terms) => {
      if (terms.dataset.initialized === 'true') return;

      const checkbox = terms.querySelector('[data-cart-drawer-terms-input]');
      const warning = terms.querySelector('[data-cart-drawer-terms-warning]');
      const checkoutButton = this.querySelector('#CartDrawer-Checkout');
      const checkoutForm = this.querySelector('#CartDrawer-Form');

      const validateTerms = (event) => {
        if (checkbox?.checked) {
          if (warning) warning.hidden = true;
          return;
        }

        event.preventDefault();
        if (warning) warning.hidden = false;
        checkbox?.focus();
      };

      checkoutButton?.addEventListener('click', validateTerms);
      checkoutForm?.addEventListener('submit', validateTerms);

      checkbox?.addEventListener('change', () => {
        if (checkbox.checked && warning) warning.hidden = true;
      });

      terms.dataset.initialized = 'true';
    });
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);
