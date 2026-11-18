(() => {
  const DIVISOR = 100000000n;
  const WHOLE_NUMBER = /^\d+$/;

  // Same integer maths as snippets/points-message.liquid: floor(cents x qty x rate / 100).
  const pointsFor = (cents, quantity, rateMicro) =>
    (BigInt(cents) * BigInt(quantity) * BigInt(rateMicro)) / DIVISOR;

  function initProduct(message) {
    const form = message.closest('form');
    const pricesNode = form && form.querySelector('[data-points-variants]');
    if (!pricesNode) return;

    const prices = JSON.parse(pricesNode.textContent);
    const variantField = form.querySelector('[name="id"]');
    const quantityField = form.querySelector('[name="quantity"]');
    const value = message.querySelector('[data-points-value]');
    const rateMicro = message.dataset.rateMicro;

    const update = () => {
      const price = variantField ? prices[variantField.value] : undefined;
      const quantity = quantityField ? quantityField.value.trim() : '1';
      const valid = price !== undefined && WHOLE_NUMBER.test(quantity) && BigInt(quantity) > 0n;
      const points = valid ? pointsFor(price, quantity, rateMicro) : 0n;

      value.textContent = points.toString();
      message.hidden = points < 1n;
    };

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    window.addEventListener('pageshow', update);
    update();
  }

  function initCart() {
    let queue = Promise.resolve();

    const refresh = async () => {
      const root = document.querySelector('[data-cart-root]');
      const activeKey = document.activeElement && document.activeElement.dataset.key;
      const url = `${root.dataset.cartUrl}?section_id=${encodeURIComponent(root.dataset.sectionId)}`;
      const response = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`Cart section request failed: ${response.status}`);

      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = doc.querySelector('[data-cart-root]');
      if (!next) throw new Error('Cart section missing from response');

      root.replaceWith(next);
      if (activeKey) {
        const field = next.querySelector(`[data-cart-quantity][data-key="${CSS.escape(activeKey)}"]`);
        if (field) field.focus();
      }
    };

    // Changes are keyed by line item key and run one at a time, so rapid edits or
    // removals cannot act on stale line positions.
    const change = (key, quantity) => {
      queue = queue.then(async () => {
        try {
          const root = document.querySelector('[data-cart-root]');
          await fetch(`${root.dataset.changeUrl}.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ id: key, quantity }),
          });
          await refresh();
        } catch (error) {
          window.location.reload();
        }
      });
    };

    document.addEventListener('change', (event) => {
      const field = event.target;
      if (!field.matches || !field.matches('[data-cart-quantity]')) return;

      const quantity = field.value.trim();
      if (WHOLE_NUMBER.test(quantity)) {
        change(field.dataset.key, Number(quantity));
      } else {
        queue = queue.then(() => refresh()).catch(() => window.location.reload());
      }
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest && event.target.closest('[data-cart-remove]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;

      event.preventDefault();
      change(link.dataset.key, 0);
    });
  }

  const init = () => {
    document.querySelectorAll('[data-points-product]').forEach(initProduct);
    if (document.querySelector('[data-cart-root]')) initCart();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
