if (!customElements.get('dynamic-dates')) {
  customElements.define(
    'dynamic-dates',
    class DynamicDates extends HTMLElement {
      connectedCallback() {
        this.dayLabels = (this.dataset.dayLabels || 'Mon, Tue, Wed, Thu, Fri, Sat, Sun').split(',').map((item) => item.trim());
        this.monthLabels = (this.dataset.monthLabels || 'Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec').split(',').map((item) => item.trim());
        this.querySelectorAll('[data-dynamic-date="true"]').forEach((element) => {
          const text = element.dataset.text || '';
          const minDate = this.formatDate(Number(element.dataset.minDays || 0));
          const maxDate = this.formatDate(Number(element.dataset.maxDays || element.dataset.minDays || 0));
          element.innerHTML = text.replaceAll('[start_date]', minDate).replaceAll('[end_date]', maxDate);
        });
      }

      formatDate(offsetDays) {
        const date = new Date();
        date.setDate(date.getDate() + offsetDays);

        const day = this.dayLabels[date.getDay() === 0 ? 6 : date.getDay() - 1] || '';
        const month = this.monthLabels[date.getMonth()] || '';
        const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
        const dayNumber = String(date.getDate()).padStart(2, '0');
        const dayOrdinal = `${date.getDate()}${this.ordinal(date.getDate())}`;

        switch (this.dataset.dateFormat) {
          case 'day_mm_dd':
            return `${day}, ${month} ${dayOrdinal}`;
          case 'day_dd_mm':
            return `${day}, ${dayOrdinal} ${month}`;
          case 'dd_mm':
            return `${dayOrdinal} ${month}`;
          case 'dd_mm_no_dot':
            return `${date.getDate()} ${month}`;
          case 'day_dd_mm_numeric':
            return `${day}, ${dayNumber}. ${monthNumber}.`;
          case 'dd_mm_numeric':
            return `${dayNumber}. ${monthNumber}.`;
          case 'mm_dd':
          default:
            return `${month} ${dayOrdinal}`;
        }
      }

      ordinal(day) {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
          case 1:
            return 'st';
          case 2:
            return 'nd';
          case 3:
            return 'rd';
          default:
            return 'th';
        }
      }
    }
  );
}

if (!customElements.get('sticky-atc')) {
  customElements.define(
    'sticky-atc',
    class StickyAtc extends HTMLElement {
      connectedCallback() {
        this.mainAtcButton = document.querySelector(this.dataset.mainAtcSelector);
        this.productInfo = document.getElementById(`ProductInfo-${this.dataset.section}`);
        this.productForm = document.getElementById(`product-form-${this.dataset.section}`);
        this.scrollTarget = this.getScrollTarget();
        this.submitButton = this.querySelector('[data-sticky-submit]');
        this.scrollButton = this.querySelector('[data-sticky-scroll]');
        this.combinedSelect = this.querySelector('[data-sticky-combined-select]');
        this.optionSelects = Array.from(this.querySelectorAll('[data-sticky-option-select]'));
        this.errorElement = this.querySelector('.sticky-atc__error');
        this.variants = this.getVariants();
        this.onScroll = this.updateVisibility.bind(this);
        this.onResize = this.updateFooterSpacer.bind(this);
        this.onSubmitButtonClick = this.handleSubmitButtonClick.bind(this);
        this.onScrollButtonClick = this.handleScrollButtonClick.bind(this);
        this.onStickyPickerChange = this.handleStickyPickerChange.bind(this);
        this.onVariantChange = this.handleVariantChange.bind(this);
        this.onCartError = this.handleCartError.bind(this);
        this.onCartUpdate = this.handleCartUpdate.bind(this);

        window.addEventListener('scroll', this.onScroll, { passive: true });
        window.addEventListener('resize', this.onResize);
        this.submitButton?.addEventListener('click', this.onSubmitButtonClick);
        this.scrollButton?.addEventListener('click', this.onScrollButtonClick);
        this.combinedSelect?.addEventListener('change', this.onStickyPickerChange);
        this.optionSelects.forEach((select) => select.addEventListener('change', this.onStickyPickerChange));
        if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          this.variantChangeUnsubscriber = subscribe(PUB_SUB_EVENTS.variantChange, this.onVariantChange);
          this.cartErrorUnsubscriber = subscribe(PUB_SUB_EVENTS.cartError, this.onCartError);
          this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, this.onCartUpdate);
        }
        this.observeProductFormErrors();
        this.createFooterSpacer();
        this.updateVisibility();
        this.updateFooterSpacer();
      }

      disconnectedCallback() {
        window.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('resize', this.onResize);
        this.submitButton?.removeEventListener('click', this.onSubmitButtonClick);
        this.scrollButton?.removeEventListener('click', this.onScrollButtonClick);
        this.combinedSelect?.removeEventListener('change', this.onStickyPickerChange);
        this.optionSelects.forEach((select) => select.removeEventListener('change', this.onStickyPickerChange));
        this.variantChangeUnsubscriber?.();
        this.cartErrorUnsubscriber?.();
        this.cartUpdateUnsubscriber?.();
        this.errorObserver?.disconnect();
      }

      updateVisibility() {
        if (this.dataset.displayWhen !== 'after_scroll') {
          this.classList.add('is-visible');
          this.updateFooterSpacer();
          return;
        }

        const threshold = this.mainAtcButton
          ? this.mainAtcButton.getBoundingClientRect().bottom + window.scrollY
          : this.productInfo
            ? this.productInfo.getBoundingClientRect().bottom + window.scrollY
            : 600;
        this.classList.toggle('is-visible', window.scrollY > threshold);
        this.updateFooterSpacer();
      }

      handleScrollButtonClick() {
        const target = this.getScrollTarget();
        if (!target) return;

        const stickyHeader = document.querySelector('sticky-header');
        const headerOffset = stickyHeader?.offsetHeight || 0;
        const top = target.getBoundingClientRect().top + window.scrollY - headerOffset - 15;
        window.scrollTo({ top, behavior: 'smooth' });
      }

      handleVariantChange({ data }) {
        if (data?.sectionId !== this.dataset.section || !data.variant) return;

        const nextSticky = data.html.querySelector(`sticky-atc[data-section="${this.dataset.section}"]`);
        if (!nextSticky) return;

        const price = nextSticky.querySelector('[data-sticky-price]')?.innerHTML;
        const buttonPrice = nextSticky.querySelector('[data-sticky-button-price]')?.innerHTML;
        const image = nextSticky.querySelector('[data-sticky-image]');
        const button = this.querySelector('.shrine-sticky-atc__button');
        const nextButton = nextSticky.querySelector('.shrine-sticky-atc__button');
        const label = nextSticky.querySelector('[data-sticky-button-label]')?.innerHTML;
        const combinedSelect = nextSticky.querySelector('[data-sticky-combined-select]');

        if (price) this.querySelectorAll('[data-sticky-price]').forEach((element) => (element.innerHTML = price));
        if (buttonPrice) {
          this.querySelectorAll('[data-sticky-button-price]').forEach((element) => (element.innerHTML = buttonPrice));
        }
        if (image) {
          this.querySelectorAll('[data-sticky-image]').forEach((element) => {
            element.src = image.getAttribute('src');
            element.srcset = image.getAttribute('srcset') || '';
            element.alt = image.getAttribute('alt') || '';
          });
        }
        if (button && nextButton) {
          button.toggleAttribute('disabled', nextButton.hasAttribute('disabled'));
          const labelElement = button.querySelector('[data-sticky-button-label]');
          if (label && labelElement) labelElement.innerHTML = label;
        }
        if (this.combinedSelect && combinedSelect) this.combinedSelect.value = combinedSelect.value;
        this.optionSelects.forEach((select) => {
          const nextSelect = nextSticky.querySelector(`[data-sticky-option-select][data-option-position="${select.dataset.optionPosition}"]`);
          if (nextSelect) select.value = nextSelect.value;
        });
        this.setStickyError();
        this.setLoading(false);
        this.updateFooterSpacer();
      }

      handleSubmitButtonClick() {
        if (!this.mainAtcButton || this.submitButton?.disabled) return;

        this.setStickyError();
        this.setLoading(true);
        this.mainAtcButton.click();
        window.clearTimeout(this.loadingTimeout);
        this.loadingTimeout = window.setTimeout(() => this.setLoading(false), 8000);
      }

      handleStickyPickerChange(event) {
        const selectedOptions = this.getSelectedOptionsFromSticky(event.target);
        if (!selectedOptions.length) return;
        this.syncMainPicker(selectedOptions);
      }

      getSelectedOptionsFromSticky(target) {
        if (target?.matches('[data-sticky-combined-select]')) {
          try {
            return JSON.parse(target.selectedOptions[0]?.dataset.options || '[]');
          } catch (error) {
            return [];
          }
        }

        const selectedOptions = this.optionSelects.map((select) => select.value);
        const selectedVariant = this.variants.find((variant) =>
          variant.options.every((option, index) => option === selectedOptions[index])
        );
        if (!selectedVariant) return selectedOptions;
        if (this.combinedSelect) this.combinedSelect.value = String(selectedVariant.id);
        return selectedVariant.options;
      }

      syncMainPicker(selectedOptions) {
        const mainPicker = document.getElementById(`variant-selects-${this.dataset.section}`);
        if (!mainPicker) return;

        let dispatchTarget = null;
        selectedOptions.forEach((value, index) => {
          const select = mainPicker.querySelector(`select[id="Option-${this.dataset.section}-${index}"]`);
          if (select) {
            select.value = value;
            dispatchTarget = select;
            return;
          }

          const radio = Array.from(mainPicker.querySelectorAll(`fieldset:nth-of-type(${index + 1}) input[type="radio"]`)).find(
            (input) => input.value === value
          );
          if (radio) {
            radio.checked = true;
            dispatchTarget = radio;
          }
        });

        dispatchTarget?.dispatchEvent(new Event('change', { bubbles: true }));
      }

      handleCartError({ data }) {
        if (data?.source !== 'product-form') return;
        this.setStickyError(data.errors || data.message || '');
        this.setLoading(false);
      }

      handleCartUpdate() {
        this.setStickyError();
        this.setLoading(false);
      }

      setLoading(isLoading) {
        if (!this.submitButton) return;

        this.submitButton.classList.toggle('loading', isLoading);
        this.submitButton.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
        if (!isLoading) this.submitButton.removeAttribute('aria-disabled');
        this.submitButton.querySelector('.loading__spinner')?.classList.toggle('hidden', !isLoading);
      }

      setStickyError(message = '') {
        if (!this.errorElement) return;

        this.errorElement.toggleAttribute('hidden', !message);
        this.errorElement.textContent = typeof message === 'string' ? message : String(message || '');
        this.updateFooterSpacer();
      }

      observeProductFormErrors() {
        const wrapper = this.productInfo?.querySelector('.product-form__error-message-wrapper');
        if (!wrapper) return;

        const syncError = () => {
          const isHidden = wrapper.hasAttribute('hidden');
          const message = wrapper.querySelector('.product-form__error-message')?.textContent?.trim() || '';
          this.setStickyError(!isHidden ? message : '');
        };
        this.errorObserver = new MutationObserver(syncError);
        this.errorObserver.observe(wrapper, { attributes: true, childList: true, subtree: true });
      }

      getScrollTarget() {
        const selector = this.dataset.scrollTarget;
        if (!selector) return null;
        return document.querySelector(selector);
      }

      getVariants() {
        const script = this.querySelector('[data-sticky-variants]');
        if (!script) return [];

        try {
          return JSON.parse(script.textContent);
        } catch (error) {
          return [];
        }
      }

      createFooterSpacer() {
        if (document.querySelector('.sticky-atc-footer-spacer')) return;

        this.footerSpacer = document.createElement('div');
        this.footerSpacer.className = 'sticky-atc-footer-spacer';
        const footer = document.querySelector('.footer');
        if (footer?.parentNode) {
          footer.parentNode.insertBefore(this.footerSpacer, footer);
        } else {
          document.body.appendChild(this.footerSpacer);
        }
      }

      updateFooterSpacer() {
        const spacer = this.footerSpacer || document.querySelector('.sticky-atc-footer-spacer');
        if (!spacer) return;

        spacer.style.height = this.classList.contains('is-visible') ? `${this.offsetHeight}px` : '0px';
      }
    }
  );
}

if (!customElements.get('review-slider')) {
  customElements.define(
    'review-slider',
    class ReviewSlider extends HTMLElement {
      connectedCallback() {
        this.track = this.querySelector('[data-review-track]');
        this.slides = Array.from(this.querySelectorAll('[data-review-slide]'));
        this.dots = Array.from(this.querySelectorAll('[data-review-dot]'));
        this.previousButton = this.querySelector('[data-review-prev]');
        this.nextButton = this.querySelector('[data-review-next]');
        this.currentIndex = 0;

        if (this.slides.length < 2 || !this.track) return;

        this.previousButton?.addEventListener('click', () => this.goTo(this.currentIndex - 1));
        this.nextButton?.addEventListener('click', () => this.goTo(this.currentIndex + 1));
        this.dots.forEach((dot) => {
          dot.addEventListener('click', () => this.goTo(Number(dot.dataset.reviewDot)));
        });

        this.addEventListener('mouseenter', () => this.stopAutoplay());
        this.addEventListener('mouseleave', () => this.startAutoplay());
        this.addEventListener('focusin', () => this.stopAutoplay());
        this.addEventListener('focusout', () => this.startAutoplay());
        this.startAutoplay();
      }

      disconnectedCallback() {
        this.stopAutoplay();
      }

      goTo(index) {
        this.currentIndex = (index + this.slides.length) % this.slides.length;
        this.track.style.transform = `translateX(-${this.currentIndex * 100}%)`;
        this.dots.forEach((dot, dotIndex) => {
          const active = dotIndex === this.currentIndex;
          dot.classList.toggle('is-active', active);
          dot.toggleAttribute('aria-current', active);
        });
      }

      startAutoplay() {
        if (this.dataset.autoplay !== 'true' || this.slides.length < 2) return;

        this.stopAutoplay();
        const speed = Number(this.dataset.autoplaySpeed || 5000);
        this.autoplayTimer = window.setInterval(() => this.goTo(this.currentIndex + 1), speed);
      }

      stopAutoplay() {
        if (!this.autoplayTimer) return;

        window.clearInterval(this.autoplayTimer);
        this.autoplayTimer = null;
      }
    }
  );
}

if (!customElements.get('quantity-breaks')) {
  customElements.define(
    'quantity-breaks',
    class QuantityBreaks extends HTMLElement {
      connectedCallback() {
        this.inputs = Array.from(this.querySelectorAll('input[name="quantity"]'));
        this.breaks = Array.from(this.querySelectorAll('.quantity-break'));
        this.moneyFormat = this.dataset.moneyFormat || '${{amount}}';
        this.variant = this.getSelectedVariant();
        this.onVariantChange = this.handleVariantChange.bind(this);

        this.inputs.forEach((input) => {
          input.addEventListener('change', () => this.handleQuantityChange(input));
        });

        if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          this.variantChangeUnsubscriber = subscribe(PUB_SUB_EVENTS.variantChange, this.onVariantChange);
        }

        this.ensureCheckedOption();
        this.updatePrices();
      }

      disconnectedCallback() {
        this.variantChangeUnsubscriber?.();
      }

      ensureCheckedOption() {
        if (this.inputs.some((input) => input.checked)) return;
        const firstInput = this.inputs[0];
        if (firstInput) firstInput.checked = true;
      }

      handleQuantityChange(input) {
        const quantity = Number(input.value || 1);
        const quantityInput = document.getElementById(`Quantity-${this.dataset.section}`);
        if (quantityInput) {
          quantityInput.value = quantity;
          quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      handleVariantChange({ data }) {
        if (data?.sectionId !== this.dataset.section || !data.variant) return;
        this.variant = data.variant;
        this.updatePrices();
      }

      getSelectedVariant() {
        const variantsScript = this.querySelector('[data-quantity-breaks-variants]');
        if (!variantsScript) return null;

        try {
          const variants = JSON.parse(variantsScript.textContent);
          const selectedInput = document.querySelector(`#product-form-${this.dataset.section} [name="id"]`);
          const selectedId = Number(selectedInput?.value);
          return variants.find((variant) => Number(variant.id) === selectedId) || variants[0] || null;
        } catch (error) {
          return null;
        }
      }

      updatePrices() {
        if (this.dataset.updatePrices !== 'true' || !this.variant) return;

        this.breaks.forEach((item) => {
          const values = this.getPriceValues(item);
          item.querySelectorAll('[data-text]').forEach((element) => {
            element.innerHTML = this.replaceDynamicValues(element.dataset.text || '', values);
          });

          const comparePrice = item.querySelector('.quantity-break__compare-price');
          if (comparePrice) {
            comparePrice.classList.toggle('hidden', values.comparePrice <= values.price);
          }
        });
      }

      getPriceValues(item) {
        const quantity = Number(item.dataset.quantity || 1);
        const percentageLeft = Number(item.dataset.percentageLeft || 1);
        const fixedDiscount = Number(item.dataset.fixedDiscount || 0);
        const basePrice = Number(this.variant.price || 0);
        const compareBase =
          item.dataset.comparePriceBase === 'compare_price' &&
          Number(this.variant.compare_at_price || 0) > basePrice
            ? Number(this.variant.compare_at_price)
            : basePrice;

        const price = Math.max(basePrice * quantity * percentageLeft - fixedDiscount, 0);
        const comparePrice = compareBase * quantity;
        const amountSaved = Math.max(comparePrice - price, 0);

        return {
          quantity,
          price,
          comparePrice,
          priceEach: quantity > 0 ? price / quantity : price,
          comparePriceEach: quantity > 0 ? comparePrice / quantity : comparePrice,
          amountSaved,
          amountSavedRounded: Math.ceil(amountSaved / 100) * 100,
        };
      }

      replaceDynamicValues(text, values) {
        return text
          .replaceAll('[quantity]', values.quantity)
          .replaceAll('[price]', this.formatMoney(values.price))
          .replaceAll('[compare_price]', this.formatMoney(values.comparePrice))
          .replaceAll('[price_each]', this.formatMoney(values.priceEach))
          .replaceAll('[compare_price_each]', this.formatMoney(values.comparePriceEach))
          .replaceAll('[amount_saved]', this.formatMoney(values.amountSaved))
          .replaceAll('[amount_saved_rounded]', this.formatMoney(values.amountSavedRounded));
      }

      formatMoney(cents) {
        if (typeof Shopify !== 'undefined' && typeof Shopify.formatMoney === 'function') {
          return Shopify.formatMoney(cents, this.moneyFormat);
        }

        const amount = (Number(cents || 0) / 100).toFixed(2);
        return this.moneyFormat
          .replace(/\{\{\s*amount\s*\}\}/, amount)
          .replace(/\{\{\s*amount_no_decimals\s*\}\}/, Math.round(Number(cents || 0) / 100).toString())
          .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, amount.replace('.', ','));
      }
    }
  );
}

if (!customElements.get('bundle-offer')) {
  customElements.define(
    'bundle-offer',
    class BundleOffer extends HTMLElement {
      connectedCallback() {
        this.items = Array.from(this.querySelectorAll('[data-bundle-item]'));
        this.submitButton = this.querySelector('[data-bundle-submit]');
        this.errorWrapper = this.querySelector('.shrine-bundle-offer__error');
        this.errorMessage = this.querySelector('[data-bundle-error]');
        this.totalPrice = this.querySelector('[data-bundle-total]');
        this.totalComparePrice = this.querySelector('[data-bundle-total-compare]');
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.moneyFormat = this.dataset.moneyFormat || '${{amount}}';
        this.totalPercentageMultiplier = Number(this.dataset.percentageMultiplier || 1);
        this.totalFixedDiscount = Number(this.dataset.fixedDiscount || 0);
        this.skipUnavailable = this.dataset.skipUnavailable === 'true';

        this.onSubmit = this.handleSubmit.bind(this);
        this.submitButton?.addEventListener('click', this.onSubmit);
        this.items.forEach((item) => this.setupItem(item));
        this.updateTotals();
      }

      disconnectedCallback() {
        this.submitButton?.removeEventListener('click', this.onSubmit);
      }

      setupItem(item) {
        item.variants = this.getVariants(item);
        item.optionSelects = Array.from(item.querySelectorAll('[data-bundle-option]'));
        item.priceElement = item.querySelector('[data-bundle-price]');
        item.comparePriceElement = item.querySelector('[data-bundle-compare-price]');
        item.idInput = item.querySelector('[data-bundle-id]');
        item.image = item.querySelector('[data-bundle-image]');

        item.optionSelects.forEach((select) => {
          select.addEventListener('change', () => this.handleVariantChange(item));
        });
      }

      getVariants(item) {
        const script = item.querySelector('[data-bundle-variant-json]');
        if (!script) return [];

        try {
          return JSON.parse(script.textContent);
        } catch (error) {
          return [];
        }
      }

      handleVariantChange(item) {
        if (!item.variants.length) return;

        const selectedOptions = item.optionSelects.map((select) => select.value);
        let variant = item.variants.find((candidate) =>
          candidate.options.every((option, index) => option === selectedOptions[index])
        );

        if ((!variant || !variant.available) && this.skipUnavailable) {
          variant = item.variants.find((candidate) => candidate.available) || variant;
          if (variant) {
            item.optionSelects.forEach((select, index) => {
              select.value = variant.options[index];
            });
          }
        }

        if (!variant) {
          item.dataset.available = 'false';
          this.updateTotals();
          return;
        }

        item.dataset.available = variant.available ? 'true' : 'false';
        item.idInput.value = variant.id;
        item.dataset.price = this.getDiscountedPrice(item, Number(variant.price || 0));
        item.dataset.comparePrice = Number(variant.compare_at_price || variant.price || 0);

        if (variant.featured_image?.src && item.image) {
          item.image.src = variant.featured_image.src;
          item.image.alt = variant.featured_image.alt || '';
        }

        this.updateItemPrice(item);
        this.updateTotals();
      }

      getDiscountedPrice(item, price) {
        const percentageMultiplier = Number(item.dataset.percentageMultiplier || 1);
        const fixedDiscount = Number(item.dataset.fixedDiscount || 0);
        return Math.max(0, Math.round(price * percentageMultiplier - fixedDiscount));
      }

      updateItemPrice(item) {
        const price = Number(item.dataset.price || 0);
        const comparePrice = Number(item.dataset.comparePrice || 0);

        if (item.priceElement) item.priceElement.textContent = this.formatMoney(price);
        if (item.comparePriceElement) {
          item.comparePriceElement.textContent = comparePrice > price ? this.formatMoney(comparePrice) : '';
        }
      }

      updateTotals() {
        let price = 0;
        let comparePrice = 0;

        this.items.forEach((item) => {
          const itemPrice = Number(item.dataset.price || 0);
          const itemComparePrice = Number(item.dataset.comparePrice || itemPrice);
          price += itemPrice;
          comparePrice += itemComparePrice;
        });

        price = Math.max(0, Math.round(price * this.totalPercentageMultiplier - this.totalFixedDiscount));
        if (this.totalPrice) this.totalPrice.textContent = this.formatMoney(price);
        if (this.totalComparePrice) {
          this.totalComparePrice.textContent = comparePrice > price ? this.formatMoney(comparePrice) : '';
        }
      }

      async handleSubmit() {
        const ids = this.items.map((item) => item.idInput?.value).filter(Boolean);
        if (!ids.length || this.submitButton?.getAttribute('aria-disabled') === 'true') return;

        this.setError();
        this.setLoading(true);

        const formData = new FormData();
        ids.forEach((id, index) => {
          formData.append(`items[${index}][id]`, id);
          formData.append(`items[${index}][quantity]`, '1');
        });

        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement?.(document.activeElement);
        }

        const config = typeof fetchConfig === 'function' ? fetchConfig('javascript') : { method: 'POST', headers: {} };
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];
        config.body = formData;

        try {
          const response = await fetch(`${window.routes?.cart_add_url || '/cart/add.js'}`, config);
          const data = await response.json();

          if (data.status) {
            this.setError(data.description || data.message || 'Unable to add this bundle to cart.');
            return;
          }

          if (!this.cart) {
            window.location = window.routes?.cart_url || '/cart';
            return;
          }

          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
            publish(PUB_SUB_EVENTS.cartUpdate, {
              source: 'bundle-offer',
              productVariantId: ids[0],
              cartData: data,
            });
          }

          this.cart.renderContents(data);
        } catch (error) {
          this.setError('Unable to add this bundle to cart. Please try again.');
        } finally {
          this.setLoading(false);
          if (this.cart?.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
        }
      }

      setLoading(isLoading) {
        if (!this.submitButton) return;

        this.submitButton.toggleAttribute('aria-disabled', isLoading);
        this.submitButton.classList.toggle('is-loading', isLoading);
        this.submitButton.querySelector('.loading-overlay__spinner')?.classList.toggle('hidden', !isLoading);
      }

      setError(message = '') {
        if (!this.errorWrapper || !this.errorMessage) return;

        this.errorWrapper.toggleAttribute('hidden', !message);
        this.errorMessage.textContent = message;
      }

      formatMoney(cents) {
        if (window.Shopify?.formatMoney) return window.Shopify.formatMoney(cents, this.moneyFormat);

        const amount = (Number(cents || 0) / 100).toFixed(2);
        return this.moneyFormat
          .replace(/\{\{\s*amount\s*\}\}/, amount)
          .replace(/\{\{\s*amount_no_decimals\s*\}\}/, Math.round(Number(amount)).toString());
      }
    }
  );
}
