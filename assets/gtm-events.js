(function () {
  'use strict';

  function pushEvent(payload) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ ecommerce: null });
      window.dataLayer.push(payload);
    } catch (error) {
      // Analytics must never break the storefront.
    }
  }

  function currency() {
    var shopify = window.Shopify;
    return window.gtmThemeCurrency || (shopify && shopify.currency && shopify.currency.active) || '';
  }

  function roundMoney(amount) {
    return Math.round(amount * 100) / 100;
  }

  function ecommerceEvent(name, items) {
    var value = 0;
    items.forEach(function (item) {
      value += item.price * item.quantity;
    });
    pushEvent({
      event: name,
      ecommerce: { currency: currency(), value: roundMoney(value), items: items },
    });
  }

  function readJson(selector) {
    var element = document.querySelector(selector);
    if (!element) return null;
    try {
      return JSON.parse(element.textContent);
    } catch (error) {
      return null;
    }
  }

  function findVariant(product, variantId) {
    var variants = (product && product.variants) || [];
    for (var i = 0; i < variants.length; i++) {
      if (String(variants[i].id) === String(variantId)) return variants[i];
    }
    return null;
  }

  function productItem(product, variant, quantity) {
    return {
      item_id: variant.sku || String(variant.id),
      item_name: product.title,
      item_brand: product.vendor || '',
      item_category: product.type || '',
      item_variant: variant.title || '',
      price: roundMoney(variant.price / 100),
      quantity: quantity,
    };
  }

  function toQuantity(value) {
    var quantity = parseInt(value, 10);
    return quantity > 0 ? quantity : 1;
  }

  // view_item
  var productData = readJson('script[data-gtm-product]');
  if (productData) {
    var viewedVariant = findVariant(productData.product, productData.variant_id);
    if (viewedVariant) {
      ecommerceEvent('view_item', [productItem(productData.product, viewedVariant, 1)]);
    }
  }

  // search, view_search_results
  var searchData = readJson('script[data-gtm-search]');
  var searchTerm = searchData && typeof searchData.term === 'string' ? searchData.term.trim() : '';
  if (searchTerm) {
    pushEvent({ event: 'search', search_term: searchTerm });
    pushEvent({ event: 'view_search_results', search_term: searchTerm });
  }

  // add_to_cart via a form post. The page is about to navigate, so the event is
  // pushed synchronously on submit. The submit is never cancelled or delayed.
  document.addEventListener('submit', function (event) {
    try {
      var form = event.target;
      if (event.defaultPrevented || !form.matches || !form.matches('form[action*="/cart/add"]')) return;
      if (event.submitter && event.submitter.name === 'checkout') return;

      var data = readJson('script[data-gtm-product]');
      if (!data) return;
      var formData = new FormData(form);
      var variant = findVariant(data.product, formData.get('id'));
      if (!variant) return;
      ecommerceEvent('add_to_cart', [productItem(data.product, variant, toQuantity(formData.get('quantity')))]);
    } catch (error) {
      // Never interfere with the add to cart submit.
    }
  });

  // add_to_cart via script: theme code calling /cart/add(.js) with fetch.
  function parseRequestedLines(body) {
    var lines = [];
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
        body = new URLSearchParams(body);
      }
    }
    if (!body || typeof body !== 'object') return lines;

    if (typeof body.forEach === 'function' && typeof body.get === 'function') {
      var indexed = {};
      var single = {};
      body.forEach(function (value, key) {
        var match = /^items\[(\d+)\]\[(id|quantity)\]$/.exec(key);
        if (match) {
          indexed[match[1]] = indexed[match[1]] || {};
          indexed[match[1]][match[2]] = value;
        } else if (key === 'id' || key === 'quantity') {
          single[key] = value;
        }
      });
      lines = Object.keys(indexed).map(function (key) {
        return indexed[key];
      });
      if (single.id) lines.push(single);
    } else if (Array.isArray(body.items)) {
      lines = body.items;
    } else if (body.id) {
      lines = [body];
    }

    return lines.map(function (line) {
      return { id: String(line.id), quantity: toQuantity(line.quantity) };
    });
  }

  function trackFetchedAdd(input, init, request) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var path = new URL(url, window.location.href).pathname;
    if (!/\/cart\/add(\.js|\.json)?$/.test(path)) return;

    var requested = parseRequestedLines(init && init.body);
    request
      .then(function (response) {
        if (!response.ok) return null;
        return response.clone().json();
      })
      .then(function (json) {
        if (!json) return;
        var lines = Array.isArray(json.items) ? json.items : [json];
        var items = lines.map(function (line) {
          var variantId = String(line.variant_id || line.id);
          var quantity = line.quantity;
          requested.forEach(function (candidate) {
            if (candidate.id === variantId) quantity = candidate.quantity;
          });
          return {
            item_id: line.sku || variantId,
            item_name: line.product_title,
            item_brand: line.vendor || '',
            item_category: line.product_type || '',
            item_variant: line.variant_title || '',
            price: roundMoney(line.price / 100),
            quantity: quantity,
          };
        });
        if (items.length) ecommerceEvent('add_to_cart', items);
      })
      .catch(function () {});
  }

  var nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      var request = nativeFetch.apply(this, arguments);
      try {
        trackFetchedAdd(input, init, request);
      } catch (error) {
        // Never interfere with the request.
      }
      return request;
    };
  }
})();
