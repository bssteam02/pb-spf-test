(() => {
  const RATE_SCALE = 100000n; // prices are in cents, rate is in thousandths

  function initProduct(el) {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';

    const form = el.closest('form');
    const select = form && form.querySelector('[name="id"]');
    const quantityInput = form && form.querySelector('[name="quantity"]');
    if (!select) return;

    const prices = JSON.parse(el.dataset.prices);
    const rateMilli = BigInt(el.dataset.rateMilli);
    const message = el.dataset.message;

    const update = () => {
      const price = prices[select.value];
      const rawQuantity = quantityInput ? quantityInput.value.trim() : '1';
      if (price === undefined || !/^\d+$/.test(rawQuantity) || BigInt(rawQuantity) < 1n) {
        el.hidden = true;
        return;
      }
      const points = (BigInt(price) * BigInt(rawQuantity) * rateMilli) / RATE_SCALE;
      el.textContent = message.replaceAll('X', points.toString());
      el.hidden = false;
    };

    form.addEventListener('change', update);
    form.addEventListener('input', update);
    window.addEventListener('pageshow', update);
    update();
  }

  function initCart(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';

    const { sectionId, cartUrl, changeUrl } = root.dataset;
    const itemsEl = root.querySelector('[data-cart-items]');
    const pointsEl = root.querySelector('[data-cart-points]');
    let queue = Promise.resolve();

    async function refresh() {
      const response = await fetch(`${cartUrl}?section_id=${encodeURIComponent(sectionId)}`, {
        cache: 'no-store',
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) throw new Error(`Cart refresh failed: ${response.status}`);

      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextItems = doc.querySelector('[data-cart-items]');
      const nextPoints = doc.querySelector('[data-cart-points]');
      if (!nextItems || !nextPoints) throw new Error('Cart refresh returned unexpected markup');

      const active = document.activeElement;
      const focusKey = active && itemsEl.contains(active) ? active.dataset.key : null;

      itemsEl.innerHTML = nextItems.innerHTML;
      pointsEl.innerHTML = nextPoints.innerHTML;

      if (focusKey) {
        const input = itemsEl.querySelector(`[data-line-quantity][data-key="${CSS.escape(focusKey)}"]`);
        if (input) input.focus();
      }
    }

    function change(key, quantity) {
      queue = queue.then(async () => {
        try {
          await fetch(changeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ id: key, quantity }),
          });
          await refresh();
        } catch (error) {
          window.location.reload();
        }
      });
    }

    function softRefresh() {
      if (root.contains(document.activeElement)) return;
      queue = queue.then(refresh).catch(() => {});
    }

    root.addEventListener('change', (event) => {
      const input = event.target.closest('[data-line-quantity]');
      if (!input) return;
      const value = input.value.trim();
      if (/^\d+$/.test(value)) {
        change(input.dataset.key, parseInt(value, 10));
      } else {
        queue = queue.then(refresh).catch(() => window.location.reload());
      }
    });

    root.addEventListener('click', (event) => {
      const link = event.target.closest('[data-line-remove]');
      if (!link) return;
      event.preventDefault();
      change(link.dataset.key, 0);
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) softRefresh();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) softRefresh();
    });
  }

  function init() {
    document.querySelectorAll('[data-loyalty-product]').forEach(initProduct);
    document.querySelectorAll('[data-loyalty-cart]').forEach(initCart);
  }

  init();
  document.addEventListener('shopify:section:load', init);
})();
