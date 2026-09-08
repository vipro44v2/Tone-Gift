(() => {
  if (window.cartDrawerUpsellsInitialized) return;
  window.cartDrawerUpsellsInitialized = true;

  const recommendationsSelector =
    '[data-cart-drawer-upsells][data-recommendations-url]';

  function getCartAddUrl() {
    if (typeof routes !== 'undefined' && routes.cart_add_url) {
      return routes.cart_add_url;
    }

    const root = window.Shopify?.routes?.root || '/';
    return `${root}cart/add.js`;
  }

  function showError(container, message) {
    const errorElement = container?.querySelector(
      '[data-cart-upsell-error]'
    );

    if (!errorElement) return;

    errorElement.textContent =
      message || 'Could not add this product. Please try again.';

    errorElement.hidden = false;
  }

  function hideError(container) {
    const errorElement = container?.querySelector(
      '[data-cart-upsell-error]'
    );

    if (!errorElement) return;

    errorElement.textContent = '';
    errorElement.hidden = true;
  }

  async function loadRecommendations(container) {
    if (!container || container.dataset.recommendationsLoading === 'true') {
      return;
    }

    const url = container.dataset.recommendationsUrl;
    if (!url) return;

    container.dataset.recommendationsLoading = 'true';

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (!response.ok) {
        throw new Error(`Recommendations request failed: ${response.status}`);
      }

      const html = await response.text();
      const parsedDocument = new DOMParser().parseFromString(
        html,
        'text/html'
      );

      const replacement = parsedDocument.querySelector(
        '[data-cart-drawer-upsells][data-recommendations-ready="true"]'
      );

      if (!replacement) {
        container.remove();
        return;
      }

      container.replaceWith(document.importNode(replacement, true));
    } catch (error) {
      console.error('Cart upsell recommendations error:', error);
      container.remove();
    }
  }

  function scanRecommendations(scope = document) {
    if (
      scope.nodeType === Node.ELEMENT_NODE &&
      scope.matches?.(recommendationsSelector)
    ) {
      loadRecommendations(scope);
    }

    scope
      .querySelectorAll?.(recommendationsSelector)
      .forEach(loadRecommendations);
  }

  function replaceRenderedSections(response) {
    const parser = new DOMParser();

    if (response.sections?.['cart-icon-bubble']) {
      const bubbleDocument = parser.parseFromString(
        response.sections['cart-icon-bubble'],
        'text/html'
      );

      const nextBubble = bubbleDocument.querySelector('#cart-icon-bubble');
      const currentBubble = document.querySelector('#cart-icon-bubble');

      if (nextBubble && currentBubble) {
        currentBubble.replaceWith(nextBubble);
      }
    }

    if (response.sections?.['cart-drawer']) {
      const drawerDocument = parser.parseFromString(
        response.sections['cart-drawer'],
        'text/html'
      );

      const nextDrawer = drawerDocument.querySelector('cart-drawer');
      const currentDrawer = document.querySelector('cart-drawer');

      if (nextDrawer && currentDrawer) {
        currentDrawer.replaceWith(nextDrawer);

        requestAnimationFrame(() => {
          document.querySelector('cart-drawer')?.open?.();
        });
      }
    }
  }

  async function addUpsell(button) {
    if (!button || button.disabled) return;

    const variantId = Number(button.dataset.variantId);
    if (!variantId) return;

    const upsellContainer = button.closest('[data-cart-drawer-upsells]');
    const drawer = document.querySelector('cart-drawer');

    const defaultLabel =
      button.dataset.defaultLabel || button.textContent.trim() || 'Add';

    const addingLabel =
      button.dataset.addingLabel || 'Adding...';

    hideError(upsellContainer);

    button.disabled = true;
button.setAttribute('aria-busy', 'true');
button.setAttribute('aria-label', addingLabel);
button.classList.add('is-loading');

    try {
      const sections =
        typeof drawer?.getSectionsToRender === 'function'
          ? drawer.getSectionsToRender().map((section) => section.id)
          : ['cart-drawer', 'cart-icon-bubble'];

      const formData = new FormData();

      formData.append('id', String(variantId));
      formData.append('quantity', '1');
      formData.append('sections', sections.join(','));
      formData.append('sections_url', window.location.pathname);

      drawer?.setActiveElement?.(button);

      const response = await fetch(getCartAddUrl(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.status) {
        throw new Error(
          result.description ||
            result.message ||
            'Could not add this product.'
        );
      }

      if (
        drawer &&
        typeof drawer.renderContents === 'function' &&
        result.sections
      ) {
        drawer.renderContents(result);
      } else {
        replaceRenderedSections(result);
      }
    } catch (error) {
      console.error('Cart drawer upsell add error:', error);

      showError(
        upsellContainer,
        error.message || 'Could not add this product. Please try again.'
      );

      if (button.isConnected) {
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.setAttribute('aria-label', defaultLabel);
  button.classList.remove('is-loading');
}
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-upsell-add]');
    if (!button) return;

    event.preventDefault();
    addUpsell(button);
  });

  document.addEventListener('DOMContentLoaded', () => {
    scanRecommendations(document);
  });

  document.addEventListener('shopify:section:load', (event) => {
    scanRecommendations(event.target);
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanRecommendations(node);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scanRecommendations(document);
})();
(() => {
  if (window.cartUpsellMouseDragInitialized) return;
  window.cartUpsellMouseDragInitialized = true;

  const dragStates = new WeakMap();

  document.addEventListener('pointerdown', (event) => {
    const slider = event.target.closest('[data-cart-upsell-slider]');

    if (!slider || event.pointerType !== 'mouse' || event.button !== 0) {
      return;
    }

    if (event.target.closest('button, input, select, textarea')) {
      return;
    }

    dragStates.set(slider, {
      pointerId: event.pointerId,
      startX: event.clientX,
      initialScrollLeft: slider.scrollLeft,
      dragged: false,
    });

    slider.classList.add('is-dragging');
    slider.setPointerCapture?.(event.pointerId);
  });

  document.addEventListener(
    'pointermove',
    (event) => {
      const slider = event.target.closest('[data-cart-upsell-slider]');

      if (!slider) return;

      const state = dragStates.get(slider);

      if (!state || state.pointerId !== event.pointerId) {
        return;
      }

      const distance = event.clientX - state.startX;

      if (Math.abs(distance) > 4) {
        state.dragged = true;
      }

      slider.scrollLeft = state.initialScrollLeft - distance;

      if (state.dragged) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  function finishDragging(event) {
    const slider = event.target.closest('[data-cart-upsell-slider]');

    if (!slider) return;

    const state = dragStates.get(slider);

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    slider.classList.remove('is-dragging');

    if (state.dragged) {
      slider.dataset.preventUpsellClick = 'true';

      window.setTimeout(() => {
        delete slider.dataset.preventUpsellClick;
      }, 120);
    }

    slider.releasePointerCapture?.(event.pointerId);
    dragStates.delete(slider);
  }

  document.addEventListener('pointerup', finishDragging);
  document.addEventListener('pointercancel', finishDragging);

  document.addEventListener(
    'click',
    (event) => {
      const slider = event.target.closest('[data-cart-upsell-slider]');

      if (!slider || slider.dataset.preventUpsellClick !== 'true') {
        return;
      }

      if (event.target.closest('button[data-cart-upsell-add]')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      delete slider.dataset.preventUpsellClick;
    },
    true
  );
})();