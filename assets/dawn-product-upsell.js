(() => {
  const SELECTOR = 'dawn-product-upsell'; 

  const parseBoolean = (value) => value === true || value === 'true';

  const formatMoney = (cents, format) => {
    const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    const moneyFormat = format || '${{amount}}';

    const formatWithDelimiters = (number, precision = 2, thousands = ',', decimal = '.') => {
      const normalized = Number(number);
      if (!Number.isFinite(normalized)) return '0';

      const parts = (normalized / 100).toFixed(precision).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return parts[1] ? `${parts[0]}${decimal}${parts[1]}` : parts[0];
    };

    const match = moneyFormat.match(/\{\{\s*(\w+)\s*\}\}/);
    if (!match) return formatWithDelimiters(value);

    let formatted;
    switch (match[1]) {
      case 'amount_no_decimals':
        formatted = formatWithDelimiters(value, 0);
        break;
      case 'amount_with_comma_separator':
        formatted = formatWithDelimiters(value, 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        formatted = formatWithDelimiters(value, 0, '.', ',');
        break;
      case 'amount_with_apostrophe_separator':
        formatted = formatWithDelimiters(value, 2, "'", '.');
        break;
      case 'amount':
      default:
        formatted = formatWithDelimiters(value, 2);
        break;
    }

    return moneyFormat.replace(match[0], formatted);
  };

  class DawnProductUpsell extends HTMLElement {
    connectedCallback() {
      if (this.dataset.duInitialized === 'true') return;
      this.dataset.duInitialized = 'true';

      if (this.dataset.url && this.dataset.loaded !== 'true') {
        this.loadRecommendations();
        return;
      }

      this.initializeCards();
    }

    async loadRecommendations() {
      try {
        const response = await fetch(this.dataset.url, {
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        });

        if (!response.ok) {
          throw new Error(`Recommendations request failed: ${response.status}`);
        }

        const html = await response.text();
        const documentFragment = new DOMParser().parseFromString(html, 'text/html');
        const loadedElement = documentFragment.getElementById(this.id);

        if (!loadedElement) {
          throw new Error(`Upsell block ${this.id} was not found in the recommendations response.`);
        }

        this.innerHTML = loadedElement.innerHTML;
        this.dataset.loaded = 'true';
        this.removeAttribute('data-url');
        this.initializeCards();
      } catch (error) {
        console.error('[Dawn product upsell]', error);
        this.hidden = true;
      }
    }

    initializeCards() {
      const cards = [...this.querySelectorAll('[data-upsell-card]')];

      if (!cards.length) {
        if (!window.Shopify?.designMode) this.hidden = true;
        return;
      }

      this.hidden = false;
      cards.forEach((card) => new DawnUpsellCard(card));
    }
  }

  class DawnUpsellCard {
    constructor(card) {
      this.card = card;
      if (card.dataset.duCardInitialized === 'true') return;
      card.dataset.duCardInitialized = 'true';

      this.variantScript = card.querySelector('[data-upsell-variants]');
      this.selects = [...card.querySelectorAll('[data-upsell-option]')];
      this.variantInput = card.querySelector('[data-upsell-variant-id]');
      this.priceElement = card.querySelector('[data-upsell-price]');
      this.compareElement = card.querySelector('[data-upsell-compare]');
      this.image = card.querySelector('.dawn-upsell__image');
      this.button = card.querySelector('.dawn-upsell__button');
      this.buttonLabel = card.querySelector('[data-upsell-button-label]');

      this.percentageDiscount = Math.min(
        100,
        Math.max(0, Number.parseFloat(card.dataset.percentageDiscount) || 0)
      );
      this.fixedDiscount = Math.max(0, Number.parseInt(card.dataset.fixedDiscount, 10) || 0);
      this.moneyFormat = card.dataset.moneyFormat || '${{amount}}';
      this.addLabel = card.dataset.addLabel || 'Add+';
      this.soldOutLabel = card.dataset.soldOutLabel || 'Sold out';
      this.skipUnavailable = parseBoolean(card.dataset.skipUnavailable);
      this.fallbackImage = card.dataset.fallbackImage || '';
      this.hasCustomImage = parseBoolean(card.dataset.hasCustomImage);
      this.productTitle = card.dataset.productTitle || '';

      try {
        this.variants = JSON.parse(this.variantScript?.textContent || '[]');
      } catch (error) {
        console.error('[Dawn product upsell] Invalid variants JSON.', error);
        this.variants = [];
      }

      if (!this.variants.length || !this.variantInput || !this.button) return;

      this.selects.forEach((select) => {
        select.addEventListener('change', (event) => this.onOptionChange(event));
      });

      const initialVariant =
        this.variants.find((variant) => String(variant.id) === String(this.variantInput.value)) ||
        this.variants.find((variant) => variant.available) ||
        this.variants[0];

      if (initialVariant) {
        this.applyVariant(initialVariant, true);
      }
    }

    getSelectedOptions() {
      return this.selects.map((select) => select.value);
    }

    findExactVariant(options) {
      return this.variants.find(
        (variant) =>
          Array.isArray(variant.options) &&
          variant.options.length === options.length &&
          variant.options.every((value, index) => value === options[index])
      );
    }

    findBestAvailableVariant(options, changedIndex) {
      const availableVariants = this.variants.filter((variant) => variant.available);
      if (!availableVariants.length) return null;

      const matchingChangedValue = availableVariants.filter(
        (variant) => variant.options?.[changedIndex] === options[changedIndex]
      );
      const candidates = matchingChangedValue.length ? matchingChangedValue : availableVariants;

      return candidates
        .map((variant) => {
          const score = variant.options.reduce(
            (total, value, index) => total + (value === options[index] ? 1 : 0),
            0
          );
          return { variant, score };
        })
        .sort((a, b) => b.score - a.score)[0].variant;
    }

    onOptionChange(event) {
      const changedIndex = Number.parseInt(event.currentTarget.dataset.optionIndex, 10) || 0;
      const selectedOptions = this.getSelectedOptions();
      let variant = this.findExactVariant(selectedOptions);

      if (this.skipUnavailable && (!variant || !variant.available)) {
        variant = this.findBestAvailableVariant(selectedOptions, changedIndex);
        if (variant) this.syncSelectsToVariant(variant);
      }

      this.applyVariant(variant);
    }

    syncSelectsToVariant(variant) {
      this.selects.forEach((select, index) => {
        const value = variant.options?.[index];
        if (value !== undefined) select.value = value;
      });
    }

    updateOptionAvailability() {
      if (!this.skipUnavailable || !this.selects.length) return;

      const selectedOptions = this.getSelectedOptions();

      this.selects.forEach((select, optionIndex) => {
        [...select.options].forEach((option) => {
          const isAvailable = this.variants.some((variant) => {
            if (!variant.available || variant.options?.[optionIndex] !== option.value) return false;

            for (let previousIndex = 0; previousIndex < optionIndex; previousIndex += 1) {
              if (variant.options?.[previousIndex] !== selectedOptions[previousIndex]) return false;
            }

            return true;
          });

          option.disabled = !isAvailable;
        });

        if (select.selectedOptions[0]?.disabled) {
          const firstEnabled = [...select.options].find((option) => !option.disabled);
          if (firstEnabled) select.value = firstEnabled.value;
        }
      });
    }

    applyVariant(variant, isInitial = false) {
      this.updateOptionAvailability();

      if (!variant) {
        this.variantInput.value = '';
        this.setButtonState(false);
        return;
      }

      if (this.skipUnavailable && !variant.available) {
        const fallback = this.variants.find((item) => item.available);
        if (fallback) {
          this.syncSelectsToVariant(fallback);
          variant = fallback;
          this.updateOptionAvailability();
        }
      }

      this.variantInput.value = variant.id;
      this.setButtonState(Boolean(variant.available));
      this.updatePrice(variant);
      this.updateImage(variant, isInitial);
    }

    setButtonState(isAvailable) {
      this.button.disabled = !isAvailable;
      this.button.setAttribute('aria-disabled', String(!isAvailable));

      if (this.buttonLabel) {
        this.buttonLabel.textContent = isAvailable ? this.addLabel : this.soldOutLabel;
      }
    }

    updatePrice(variant) {
      const basePrice = Number(variant.price) || 0;
      const visualPrice = Math.max(
        0,
        Math.round(basePrice * ((100 - this.percentageDiscount) / 100) - this.fixedDiscount)
      );

      const variantCompare = Number(variant.compare_at_price) || 0;
      const visualCompare =
        variantCompare > visualPrice ? variantCompare : basePrice > visualPrice ? basePrice : 0;

      if (this.priceElement) {
        this.priceElement.textContent = formatMoney(visualPrice, this.moneyFormat);
      }

      if (this.compareElement) {
        if (visualCompare > visualPrice) {
          this.compareElement.textContent = formatMoney(visualCompare, this.moneyFormat);
          this.compareElement.classList.remove('hidden');
        } else {
          this.compareElement.textContent = '';
          this.compareElement.classList.add('hidden');
        }
      }
    }

    updateImage(variant, isInitial) {
  if (!this.image) return;

  const variantImage =
    variant.featured_image?.src ||
    variant.featured_media?.preview_image?.src;

  const nextImage = variantImage || this.fallbackImage;

  if (!nextImage) return;

  if (isInitial && this.hasCustomImage && this.image.getAttribute('src')) {
    return;
  }

  if (isInitial && !variantImage && this.image.getAttribute('src')) {
    return;
  }

  const makeSizedUrl = (source, width) => {
    try {
      const url = new URL(source, window.location.origin);
      url.searchParams.set('width', width);
      return url.toString();
    } catch (error) {
      const separator = source.includes('?') ? '&' : '?';
      return `${source}${separator}width=${width}`;
    }
  };

  this.image.src = makeSizedUrl(nextImage, 256);

  this.image.srcset = [
    `${makeSizedUrl(nextImage, 64)} 64w`,
    `${makeSizedUrl(nextImage, 96)} 96w`,
    `${makeSizedUrl(nextImage, 128)} 128w`,
    `${makeSizedUrl(nextImage, 160)} 160w`,
    `${makeSizedUrl(nextImage, 192)} 192w`,
    `${makeSizedUrl(nextImage, 256)} 256w`
  ].join(', ');

  const imageSize =
    getComputedStyle(this.card)
      .getPropertyValue('--du-image-size')
      .trim() || '96px';

  this.image.sizes = imageSize;
  this.image.loading = 'lazy';
  this.image.decoding = 'async';

  this.image.alt =
    variant.featured_image?.alt ||
    variant.featured_media?.alt ||
    this.productTitle ||
    this.image.alt ||
    '';
}
  }

  if (!customElements.get(SELECTOR)) {
    customElements.define(SELECTOR, DawnProductUpsell);
  }
})();
