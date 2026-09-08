if (!customElements.get('product-info')) {
  customElements.define(
    'product-info',
    class ProductInfo extends HTMLElement {
      quantityInput = undefined;
      quantityForm = undefined;
      onVariantChangeUnsubscriber = undefined;
      cartUpdateUnsubscriber = undefined;
      abortController = undefined;
      pendingRequestUrl = null;
      preProcessHtmlCallbacks = [];
      postProcessHtmlCallbacks = [];

      requestSequence = 0;
      instantPreviewState = null;
      instantVariantCache = null;

      constructor() {
        super();

        this.quantityInput = this.querySelector('.quantity__input');
      }

      connectedCallback() {
        this.initializeProductSwapUtility();

        this.onVariantChangeUnsubscriber = subscribe(
          PUB_SUB_EVENTS.optionValueSelectionChange,
          this.handleOptionValueChange.bind(this)
        );

        this.initQuantityHandlers();

        this.preloadVariantImages();

        this.dispatchEvent(
          new CustomEvent('product-info:loaded', {
            bubbles: true,
          })
        );
      }

      addPreProcessCallback(callback) {
        this.preProcessHtmlCallbacks.push(callback);
      }

      initQuantityHandlers() {
        if (!this.quantityInput) return;

        this.quantityForm = this.querySelector('.product-form__quantity');

        if (!this.quantityForm) return;

        this.setQuantityBoundries();

        if (!this.dataset.originalSection) {
          this.cartUpdateUnsubscriber = subscribe(
            PUB_SUB_EVENTS.cartUpdate,
            this.fetchQuantityRules.bind(this)
          );
        }
      }

      disconnectedCallback() {
        this.onVariantChangeUnsubscriber?.();
        this.cartUpdateUnsubscriber?.();

        this.abortController?.abort();

        this.requestSequence += 1;

        this.restoreInstantVariantPreview();
      }

      initializeProductSwapUtility() {
        this.preProcessHtmlCallbacks.push((html) =>
          html
            .querySelectorAll('.scroll-trigger')
            .forEach((element) =>
              element.classList.add('scroll-trigger--cancel')
            )
        );

        this.postProcessHtmlCallbacks.push((newNode) => {
          window?.Shopify?.PaymentButton?.init();
          window?.ProductModel?.loadShopifyXR();
        });
      }

      handleOptionValueChange({
        data: {
          event,
          target,
          selectedOptionValues,
        },
      }) {
        if (!this.contains(event.target)) return;

        const requestId = ++this.requestSequence;

        this.previewVariantMedia(target);

        this.resetProductFormState();

        const productUrl =
          target.dataset.productUrl ||
          this.pendingRequestUrl ||
          this.dataset.url;

        this.pendingRequestUrl = productUrl;

        const shouldSwapProduct =
          this.dataset.url !== productUrl;

        const shouldFetchFullPage =
          this.dataset.updateUrl === 'true' &&
          shouldSwapProduct;

        this.renderProductInfo({
          requestUrl: this.buildRequestUrlWithParams(
            productUrl,
            selectedOptionValues,
            shouldFetchFullPage
          ),
          targetId: target.id,
          requestId,
          callback: shouldSwapProduct
            ? this.handleSwapProduct(
                productUrl,
                shouldFetchFullPage
              )
            : this.handleUpdateProductInfo(productUrl),
        });
      }

      getInstantVariants() {
        const picker = this.variantSelectors;

        if (!picker) return [];

        const script = picker.querySelector(
          '[data-tst-instant-variants]'
        );

        if (!script) return [];

        if (
          this.instantVariantCache &&
          this.instantVariantCache.script === script
        ) {
          return this.instantVariantCache.variants;
        }

        try {
          const variants = JSON.parse(
            script.textContent || '[]'
          );

          this.instantVariantCache = {
            script,
            variants,
          };

          return variants;
        } catch (error) {
          console.error(
            'Instant variant data is invalid:',
            error
          );

          return [];
        }
      }

      getSelectedOptionNames() {
        const picker = this.variantSelectors;

        if (!picker) return [];

        return Array.from(
          picker.querySelectorAll('.product-form__input')
        ).map((wrapper) => {
          const select =
            wrapper.querySelector('select');

          if (select) {
            return String(
              select.value || ''
            ).trim();
          }

          const checked =
            wrapper.querySelector(
              'input[type="radio"]:checked'
            );

          if (checked) {
            return String(
              checked.value || ''
            ).trim();
          }

          return '';
        });
      }

      getInstantVariantForSelection() {
        const variants =
          this.getInstantVariants();

        if (!variants.length) {
          return null;
        }

        const selectedOptions =
          this.getSelectedOptionNames();

        if (!selectedOptions.length) {
          return null;
        }

        return (
          variants.find((variant) => {
            if (
              !Array.isArray(variant.options) ||
              variant.options.length !==
                selectedOptions.length
            ) {
              return false;
            }

            return variant.options.every(
              (option, index) =>
                String(option) ===
                String(
                  selectedOptions[index]
                )
            );
          }) || null
        );
      }

      preloadVariantImages() {
        const run = () => {
          const variants =
            this.getInstantVariants();

          if (!variants.length) return;

          window.__tstVariantPreloadedImages =
            window.__tstVariantPreloadedImages ||
            new Set();

          variants.forEach((variant) => {
            const src =
              variant?.imageSrc;

            if (
              !src ||
              window.__tstVariantPreloadedImages.has(
                src
              )
            ) {
              return;
            }

            window.__tstVariantPreloadedImages.add(
              src
            );

            const image = new Image();

            if (variant.imageSrcset) {
              image.srcset =
                variant.imageSrcset;

              image.sizes =
                '(min-width: 990px) 50vw, 100vw';
            }

            image.src = src;

            image
              .decode?.()
              .catch(() => {});
          });
        };

        if (
          'requestIdleCallback' in window
        ) {
          requestIdleCallback(run, {
            timeout: 600,
          });
        } else {
          window.setTimeout(run, 0);
        }
      }

      previewVariantMedia(target) {
        this.restoreInstantVariantPreview();

        if (!target) return;

        let mediaId =
          target.dataset
            ?.tstInstantMediaId || '';

        let imageSrc =
          target.dataset
            ?.tstInstantImageSrc || '';

        let imageSrcset =
          target.dataset
            ?.tstInstantImageSrcset || '';

        if (
          !mediaId &&
          !imageSrc
        ) {
          const instantVariant =
            this.getInstantVariantForSelection();

          if (!instantVariant) return;

          mediaId =
            instantVariant.mediaId || '';

          imageSrc =
            instantVariant.imageSrc || '';

          imageSrcset =
            instantVariant.imageSrcset || '';
        }

        if (
          !mediaId &&
          !imageSrc
        ) {
          return;
        }

        const mediaGallery =
          this.querySelector(
            'media-gallery'
          );

        if (!mediaGallery) return;

        const existingMedia =
          mediaId
            ? mediaGallery.querySelector(
                `[data-media-id="${mediaId}"]`
              )
            : null;

        if (existingMedia) {
          mediaGallery.dataset.tstInstantMediaId =
            mediaId;

          mediaGallery.setActiveMedia?.(
            mediaId,
            true
          );

          return;
        }

        if (!imageSrc) return;

        const viewer =
          mediaGallery.querySelector(
            '[id^="GalleryViewer"]'
          );

        if (!viewer) return;

        const activeMedia =
          viewer.querySelector(
            '.product__media-item.is-active'
          ) ||
          viewer.querySelector(
            '[data-media-id]'
          );

        if (!activeMedia) return;

        const activeImage =
          activeMedia.querySelector(
            '.product__modal-opener--image img'
          ) ||
          activeMedia.querySelector('img');

        if (!activeImage) return;

        this.instantPreviewState = {
          image: activeImage,

          src:
            activeImage.getAttribute(
              'src'
            ),

          srcset:
            activeImage.getAttribute(
              'srcset'
            ),

          sizes:
            activeImage.getAttribute(
              'sizes'
            ),

          loading:
            activeImage.getAttribute(
              'loading'
            ),

          fetchpriority:
            activeImage.getAttribute(
              'fetchpriority'
            ),
        };

        mediaGallery.dataset.tstInstantMediaId =
          mediaId;

        mediaGallery.classList.add(
          'tst-instant-variant-preview'
        );

        activeImage.loading = 'eager';

        try {
          activeImage.fetchPriority =
            'high';
        } catch (error) {}

        if (imageSrcset) {
          activeImage.setAttribute(
            'srcset',
            imageSrcset
          );
        } else {
          activeImage.removeAttribute(
            'srcset'
          );
        }

        activeImage.setAttribute(
          'src',
          imageSrc
        );
      }

      restoreInstantVariantPreview() {
        const state =
          this.instantPreviewState;

        this.instantPreviewState =
          null;

        const mediaGallery =
          this.querySelector(
            'media-gallery'
          );

        if (mediaGallery) {
          mediaGallery.classList.remove(
            'tst-instant-variant-preview'
          );

          delete mediaGallery.dataset
            .tstInstantMediaId;
        }

        if (
          !state?.image?.isConnected
        ) {
          return;
        }

        const restoreAttribute = (
          name,
          value
        ) => {
          if (value === null) {
            state.image.removeAttribute(
              name
            );
          } else {
            state.image.setAttribute(
              name,
              value
            );
          }
        };

        restoreAttribute(
          'srcset',
          state.srcset
        );

        restoreAttribute(
          'sizes',
          state.sizes
        );

        restoreAttribute(
          'loading',
          state.loading
        );

        restoreAttribute(
          'fetchpriority',
          state.fetchpriority
        );

        restoreAttribute(
          'src',
          state.src
        );
      }

      resetProductFormState() {
        const productForm =
          this.productForm;

        productForm?.toggleSubmitButton(
          true
        );

        productForm?.handleErrorMessage();
      }

      handleSwapProduct(
        productUrl,
        updateFullPage
      ) {
        return (html) => {
          this.restoreInstantVariantPreview();

          this.productModal?.remove();

          const selector =
            updateFullPage
              ? "product-info[id^='MainProduct']"
              : 'product-info';

          const productInfoNode =
            html.querySelector(selector);

          const variant =
            this.getSelectedVariant(
              productInfoNode
            );

          this.updateURL(
            productUrl,
            variant?.id
          );

          if (updateFullPage) {
            const currentMain =
              document.querySelector(
                'main'
              );

            const nextMain =
              html.querySelector(
                'main'
              );

            const nextTitle =
              html.querySelector(
                'head title'
              );

            const currentTitle =
              document.querySelector(
                'head title'
              );

            if (
              nextTitle &&
              currentTitle
            ) {
              currentTitle.innerHTML =
                nextTitle.innerHTML;
            }

            if (
              currentMain &&
              nextMain
            ) {
              HTMLUpdateUtility.viewTransition(
                currentMain,
                nextMain,
                this.preProcessHtmlCallbacks,
                this.postProcessHtmlCallbacks
              );
            }
          } else if (productInfoNode) {
            HTMLUpdateUtility.viewTransition(
              this,
              productInfoNode,
              this.preProcessHtmlCallbacks,
              this.postProcessHtmlCallbacks
            );
          }
        };
      }

      renderProductInfo({
        requestUrl,
        targetId,
        requestId,
        callback,
      }) {
        this.abortController?.abort();

        this.abortController =
          new AbortController();

        const controller =
          this.abortController;

        fetch(requestUrl, {
          signal: controller.signal,
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(
                `HTTP error ${response.status}`
              );
            }

            return response.text();
          })
          .then((responseText) => {
            if (
              requestId !==
              this.requestSequence
            ) {
              return false;
            }

            if (
              controller !==
              this.abortController
            ) {
              return false;
            }

            this.pendingRequestUrl =
              null;

            const html =
              new DOMParser().parseFromString(
                responseText,
                'text/html'
              );

            if (
              requestId !==
              this.requestSequence
            ) {
              return false;
            }

            callback(html);

            return true;
          })
          .then((wasApplied) => {
            if (!wasApplied) return;

            if (
              requestId !==
              this.requestSequence
            ) {
              return;
            }

            const escapedTargetId =
              typeof CSS !==
                'undefined' &&
              CSS.escape
                ? CSS.escape(targetId)
                : targetId;

            document
              .querySelector(
                `#${escapedTargetId}`
              )
              ?.focus();
          })
          .catch((error) => {
            if (
              error.name ===
              'AbortError'
            ) {
              return;
            }

            console.error(error);
          });
      }

      getSelectedVariant(
        productInfoNode
      ) {
        if (!productInfoNode) {
          return null;
        }

        const selectedVariant =
          productInfoNode.querySelector(
            'variant-selects [data-selected-variant]'
          )?.innerHTML;

        if (!selectedVariant) {
          return null;
        }

        try {
          return JSON.parse(
            selectedVariant
          );
        } catch (error) {
          console.error(
            'Invalid selected variant JSON:',
            error
          );

          return null;
        }
      }

      buildRequestUrlWithParams(
        url,
        optionValues,
        shouldFetchFullPage = false
      ) {
        const params = [];

        if (!shouldFetchFullPage) {
          params.push(
            `section_id=${encodeURIComponent(
              this.sectionId
            )}`
          );
        }

        if (optionValues.length) {
          params.push(
            `option_values=${optionValues
              .map((value) =>
                encodeURIComponent(
                  value
                )
              )
              .join(',')}`
          );
        }

        return `${url}?${params.join(
          '&'
        )}`;
      }

      updateOptionValues(html) {
        const variantSelects =
          html.querySelector(
            'variant-selects'
          );

        if (
          variantSelects &&
          this.variantSelectors
        ) {
          HTMLUpdateUtility.viewTransition(
            this.variantSelectors,
            variantSelects,
            this.preProcessHtmlCallbacks
          );

          this.instantVariantCache =
            null;
        }
      }

      handleUpdateProductInfo(
        productUrl
      ) {
        return (html) => {
          const variant =
            this.getSelectedVariant(
              html
            );

          if (!variant) {
            this.restoreInstantVariantPreview();

            this.pickupAvailability?.update(
              variant
            );

            this.updateOptionValues(
              html
            );

            this.updateURL(
              productUrl,
              null
            );

            this.updateVariantInputs(
              null
            );

            this.setUnavailable();

            return;
          }

          this.updateMedia(
            html,
            variant?.featured_media?.id
          );

          this.pickupAvailability?.update(
            variant
          );

          this.updateOptionValues(
            html
          );

          this.updateURL(
            productUrl,
            variant?.id
          );

          this.updateVariantInputs(
            variant?.id
          );

          const updateSourceFromDestination = (
            id,
            shouldHide = () => false
          ) => {
            const source =
              html.getElementById(
                `${id}-${this.sectionId}`
              );

            const destination =
              this.querySelector(
                `#${id}-${this.dataset.section}`
              );

            if (
              !source ||
              !destination
            ) {
              return;
            }

            destination.innerHTML =
              source.innerHTML;

            destination.classList.toggle(
              'hidden',
              shouldHide(source)
            );
          };

          updateSourceFromDestination(
            'price'
          );

          updateSourceFromDestination(
            'Sku',
            ({ classList }) =>
              classList.contains(
                'hidden'
              )
          );

          updateSourceFromDestination(
            'Inventory',
            ({ innerText }) =>
              innerText === ''
          );

          updateSourceFromDestination(
            'Volume'
          );

          updateSourceFromDestination(
            'Price-Per-Item',
            ({ classList }) =>
              classList.contains(
                'hidden'
              )
          );

          this.updateQuantityRules(
            this.sectionId,
            html
          );

          this.querySelector(
            `#Quantity-Rules-${this.dataset.section}`
          )?.classList.remove(
            'hidden'
          );

          this.querySelector(
            `#Volume-Note-${this.dataset.section}`
          )?.classList.remove(
            'hidden'
          );

          this.productForm?.toggleSubmitButton(
            html
              .getElementById(
                `ProductSubmitButton-${this.sectionId}`
              )
              ?.hasAttribute(
                'disabled'
              ) ?? true,
            window.variantStrings
              .soldOut
          );

          publish(
            PUB_SUB_EVENTS.variantChange,
            {
              data: {
                sectionId:
                  this.sectionId,
                html,
                variant,
              },
            }
          );
        };
      }

      updateVariantInputs(
        variantId
      ) {
        this.querySelectorAll(
          `#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}`
        ).forEach(
          (productForm) => {
            const input =
              productForm.querySelector(
                'input[name="id"]'
              );

            if (!input) return;

            input.value =
              variantId ?? '';

            input.dispatchEvent(
              new Event(
                'change',
                {
                  bubbles: true,
                }
              )
            );
          }
        );
      }

      updateURL(
        url,
        variantId
      ) {
        this.querySelector(
          'share-button'
        )?.updateUrl(
          `${window.shopUrl}${url}${
            variantId
              ? `?variant=${variantId}`
              : ''
          }`
        );

        if (
          this.dataset.updateUrl ===
          'false'
        ) {
          return;
        }

        window.history.replaceState(
          {},
          '',
          `${url}${
            variantId
              ? `?variant=${variantId}`
              : ''
          }`
        );
      }

      setUnavailable() {
        this.productForm?.toggleSubmitButton(
          true,
          window.variantStrings
            .unavailable
        );

        const selectors = [
          'price',
          'Inventory',
          'Sku',
          'Price-Per-Item',
          'Volume-Note',
          'Volume',
          'Quantity-Rules',
        ]
          .map(
            (id) =>
              `#${id}-${this.dataset.section}`
          )
          .join(', ');

        document
          .querySelectorAll(
            selectors
          )
          .forEach(
            ({ classList }) =>
              classList.add(
                'hidden'
              )
          );
      }

      updateMedia(
        html,
        variantFeaturedMediaId
      ) {
        if (
          !variantFeaturedMediaId
        ) {
          this.restoreInstantVariantPreview();

          return;
        }

        this.restoreInstantVariantPreview();

        const mediaGallery =
          this.querySelector(
            'media-gallery'
          );

        const mediaGalleryDestination =
          html.querySelector(
            'media-gallery'
          );

        if (
          !mediaGallery ||
          !mediaGalleryDestination
        ) {
          return;
        }

        const mediaGallerySource =
          mediaGallery.querySelector(
            '[id^="Slider-Gallery"]'
          );

        const mediaGalleryDestinationList =
          mediaGalleryDestination.querySelector(
            '[id^="Slider-Gallery"]'
          );

        const refreshSourceData =
          () => {
            if (
              this.hasAttribute(
                'data-zoom-on-hover'
              ) &&
              typeof enableZoomOnHover ===
                'function'
            ) {
              enableZoomOnHover(2);
            }

            const mediaGallerySourceItems =
              Array.from(
                mediaGallerySource?.querySelectorAll(
                  'li[data-media-id]'
                ) || []
              );

            const sourceSet =
              new Set(
                mediaGallerySourceItems.map(
                  (item) =>
                    item.dataset
                      .mediaId
                )
              );

            const sourceMap =
              new Map(
                mediaGallerySourceItems.map(
                  (
                    item,
                    index
                  ) => [
                    item.dataset
                      .mediaId,
                    {
                      item,
                      index,
                    },
                  ]
                )
              );

            return [
              mediaGallerySourceItems,
              sourceSet,
              sourceMap,
            ];
          };

        if (
          mediaGallerySource &&
          mediaGalleryDestinationList
        ) {
          let [
            mediaGallerySourceItems,
            sourceSet,
            sourceMap,
          ] = refreshSourceData();

          const mediaGalleryDestinationItems =
            Array.from(
              mediaGalleryDestinationList.querySelectorAll(
                'li[data-media-id]'
              )
            );

          const destinationSet =
            new Set(
              mediaGalleryDestinationItems.map(
                (item) =>
                  item.dataset
                    .mediaId
              )
            );

          let shouldRefresh =
            false;

          for (
            let i =
              mediaGalleryDestinationItems.length -
              1;
            i >= 0;
            i--
          ) {
            const destinationItem =
              mediaGalleryDestinationItems[
                i
              ];

            if (
              !sourceSet.has(
                destinationItem
                  .dataset.mediaId
              )
            ) {
              mediaGallerySource.prepend(
                destinationItem
              );

              shouldRefresh =
                true;
            }
          }

          for (
            let i = 0;
            i <
            mediaGallerySourceItems.length;
            i++
          ) {
            const sourceItem =
              mediaGallerySourceItems[
                i
              ];

            if (
              !destinationSet.has(
                sourceItem.dataset
                  .mediaId
              )
            ) {
              sourceItem.remove();

              shouldRefresh =
                true;
            }
          }

          if (shouldRefresh) {
            [
              mediaGallerySourceItems,
              sourceSet,
              sourceMap,
            ] = refreshSourceData();
          }

          mediaGalleryDestinationItems.forEach(
            (
              destinationItem,
              destinationIndex
            ) => {
              const sourceData =
                sourceMap.get(
                  destinationItem
                    .dataset.mediaId
                );

              if (!sourceData) {
                return;
              }

              if (
                sourceData.index ===
                destinationIndex
              ) {
                return;
              }

              const referenceNode =
                mediaGallerySource.querySelector(
                  `li:nth-of-type(${
                    destinationIndex +
                    1
                  })`
                );

              mediaGallerySource.insertBefore(
                sourceData.item,
                referenceNode ||
                  null
              );

              [
                mediaGallerySourceItems,
                sourceSet,
                sourceMap,
              ] = refreshSourceData();
            }
          );
        }

        const targetMediaId =
          `${this.dataset.section}-${variantFeaturedMediaId}`;

        mediaGallery.setActiveMedia?.(
          targetMediaId,
          true
        );

        mediaGallery.classList.remove(
          'tst-instant-variant-preview'
        );

        delete mediaGallery.dataset
          .tstInstantMediaId;

        window.setTimeout(() => {
          const modalContent =
            this.productModal?.querySelector(
              '.product-media-modal__content'
            );

          const newModalContent =
            html.querySelector(
              'product-modal .product-media-modal__content'
            );

          if (
            modalContent &&
            newModalContent
          ) {
            modalContent.innerHTML =
              newModalContent.innerHTML;
          }
        }, 0);
      }

      setQuantityBoundries() {
        if (!this.quantityInput) {
          return;
        }

        const data = {
          cartQuantity:
            this.quantityInput
              .dataset.cartQuantity
              ? parseInt(
                  this.quantityInput
                    .dataset
                    .cartQuantity
                )
              : 0,

          min:
            this.quantityInput
              .dataset.min
              ? parseInt(
                  this.quantityInput
                    .dataset.min
                )
              : 1,

          max:
            this.quantityInput
              .dataset.max
              ? parseInt(
                  this.quantityInput
                    .dataset.max
                )
              : null,

          step:
            this.quantityInput
              .step
              ? parseInt(
                  this.quantityInput
                    .step
                )
              : 1,
        };

        let min = data.min;

        const max =
          data.max === null
            ? data.max
            : data.max -
              data.cartQuantity;

        if (max !== null) {
          min = Math.min(
            min,
            max
          );
        }

        if (
          data.cartQuantity >=
          data.min
        ) {
          min = Math.min(
            min,
            data.step
          );
        }

        this.quantityInput.min =
          min;

        if (max) {
          this.quantityInput.max =
            max;
        } else {
          this.quantityInput.removeAttribute(
            'max'
          );
        }

        this.quantityInput.value =
          min;

        publish(
          PUB_SUB_EVENTS.quantityUpdate,
          undefined
        );
      }

      fetchQuantityRules() {
        const currentVariantId =
          this.productForm
            ?.variantIdInput
            ?.value;

        if (!currentVariantId) {
          return;
        }

        const spinner =
          this.querySelector(
            '.quantity__rules-cart .loading__spinner'
          );

        spinner?.classList.remove(
          'hidden'
        );

        return fetch(
          `${this.dataset.url}?variant=${currentVariantId}&section_id=${this.dataset.section}`
        )
          .then((response) =>
            response.text()
          )
          .then(
            (responseText) => {
              const html =
                new DOMParser().parseFromString(
                  responseText,
                  'text/html'
                );

              this.updateQuantityRules(
                this.dataset
                  .section,
                html
              );
            }
          )
          .catch((error) =>
            console.error(
              error
            )
          )
          .finally(() => {
            spinner?.classList.add(
              'hidden'
            );
          });
      }

      updateQuantityRules(
        sectionId,
        html
      ) {
        if (
          !this.quantityInput ||
          !this.quantityForm
        ) {
          return;
        }

        this.setQuantityBoundries();

        const quantityFormUpdated =
          html.getElementById(
            `Quantity-Form-${sectionId}`
          );

        if (!quantityFormUpdated) {
          return;
        }

        const selectors = [
          '.quantity__input',
          '.quantity__rules',
          '.quantity__label',
        ];

        for (
          const selector of
          selectors
        ) {
          const current =
            this.quantityForm.querySelector(
              selector
            );

          const updated =
            quantityFormUpdated.querySelector(
              selector
            );

          if (
            !current ||
            !updated
          ) {
            continue;
          }

          if (
            selector ===
            '.quantity__input'
          ) {
            const attributes = [
              'data-cart-quantity',
              'data-min',
              'data-max',
              'step',
            ];

            for (
              const attribute of
              attributes
            ) {
              const valueUpdated =
                updated.getAttribute(
                  attribute
                );

              if (
                valueUpdated !==
                null
              ) {
                current.setAttribute(
                  attribute,
                  valueUpdated
                );
              } else {
                current.removeAttribute(
                  attribute
                );
              }
            }
          } else {
            current.innerHTML =
              updated.innerHTML;

            if (
              selector ===
              '.quantity__label'
            ) {
              const updatedAriaLabelledBy =
                updated.getAttribute(
                  'aria-labelledby'
                );

              if (
                updatedAriaLabelledBy
              ) {
                current.setAttribute(
                  'aria-labelledby',
                  updatedAriaLabelledBy
                );

                const labelId =
                  updatedAriaLabelledBy;

                const currentHiddenLabel =
                  document.getElementById(
                    labelId
                  );

                const updatedHiddenLabel =
                  html.getElementById(
                    labelId
                  );

                if (
                  currentHiddenLabel &&
                  updatedHiddenLabel
                ) {
                  currentHiddenLabel.textContent =
                    updatedHiddenLabel.textContent;
                }
              }
            }
          }
        }
      }

      get productForm() {
        return this.querySelector(
          'product-form'
        );
      }

      get productModal() {
        return document.querySelector(
          `#ProductModal-${this.dataset.section}`
        );
      }

      get pickupAvailability() {
        return this.querySelector(
          'pickup-availability'
        );
      }

      get variantSelectors() {
        return this.querySelector(
          'variant-selects'
        );
      }

      get relatedProducts() {
        const relatedProductsSectionId =
          SectionId.getIdForSection(
            SectionId.parseId(
              this.sectionId
            ),
            'related-products'
          );

        return document.querySelector(
          `product-recommendations[data-section-id^="${relatedProductsSectionId}"]`
        );
      }

      get quickOrderList() {
        const quickOrderListSectionId =
          SectionId.getIdForSection(
            SectionId.parseId(
              this.sectionId
            ),
            'quick_order_list'
          );

        return document.querySelector(
          `quick-order-list[data-id^="${quickOrderListSectionId}"]`
        );
      }

      get sectionId() {
        return (
          this.dataset.originalSection ||
          this.dataset.section
        );
      }
    }
  );
}