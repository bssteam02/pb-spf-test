(function () {
  var root = document.querySelector('[data-kit]');
  if (!root) return;

  var form = root.querySelector('[data-kit-form]');
  var boardSelect = root.querySelector('[data-kit-board]');
  var sizeStep = root.querySelector('[data-kit-size-step]');
  var sizeLegend = root.querySelector('[data-kit-size-legend]');
  var sizesEl = root.querySelector('[data-kit-sizes]');
  var waxEl = root.querySelector('[data-kit-wax]');
  var submit = root.querySelector('[data-kit-submit]');
  var errorEl = root.querySelector('[data-kit-error]');
  var i18n = JSON.parse(root.querySelector('[data-kit-i18n]').textContent);

  var currency = root.dataset.currency;
  var savingPercent = Number(root.dataset.savingPercent);
  var formatter = new Intl.NumberFormat(root.dataset.locale || undefined, {
    style: 'currency',
    currency: currency,
  });
  var fractionDigits = formatter.resolvedOptions().maximumFractionDigits;
  // Shopify prices are integers in hundredths of the currency; zero-decimal currencies round to whole units.
  var roundingUnit = Math.pow(10, 2 - fractionDigits);

  var boards = JSON.parse(root.querySelector('[data-kit-boards]').textContent);
  var selectedBoard = null;
  var selectedVariant = null;
  var submitting = false;

  function money(cents) {
    return formatter.format(cents / 100);
  }

  function lineSaving(cents) {
    return Math.round((cents * savingPercent) / 100 / roundingUnit) * roundingUnit;
  }

  function hasSellableVariant(board) {
    return board.variants.some(function (variant) {
      return variant.available;
    });
  }

  function renderBoardOptions() {
    var current = boardSelect.value;
    while (boardSelect.options.length > 1) boardSelect.remove(1);
    boards.forEach(function (board) {
      var option = document.createElement('option');
      option.value = board.handle;
      option.textContent = hasSellableVariant(board)
        ? board.title
        : board.title + ' (' + i18n.boardSoldOut + ')';
      option.disabled = !hasSellableVariant(board);
      boardSelect.add(option);
    });
    boardSelect.value = current;
  }

  function isSingleDefaultVariant(board) {
    return board.variants.length === 1 && board.variants[0].title === 'Default Title';
  }

  function renderSizes() {
    sizesEl.textContent = '';
    selectedVariant = null;

    if (!selectedBoard) {
      sizeStep.hidden = true;
      return;
    }

    if (isSingleDefaultVariant(selectedBoard)) {
      sizeStep.hidden = true;
      selectedVariant = selectedBoard.variants[0].available ? selectedBoard.variants[0] : null;
      return;
    }

    sizeLegend.textContent = selectedBoard.optionNames.join(' / ') || i18n.size;
    sizeStep.hidden = false;

    selectedBoard.variants.forEach(function (variant) {
      var label = document.createElement('label');
      label.className = 'kit__option' + (variant.available ? '' : ' is-disabled');

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'size';
      input.value = variant.id;
      input.disabled = !variant.available;
      input.addEventListener('change', function () {
        selectedVariant = variant;
        update();
      });

      var text = document.createElement('span');
      text.className = 'kit__option-text';
      text.textContent = variant.title + ' · ' + money(variant.price);
      if (!variant.available) text.textContent += ' (' + i18n.soldOut + ')';

      label.appendChild(input);
      label.appendChild(text);
      sizesEl.appendChild(label);
    });
  }

  function selectedGift() {
    var input = form.querySelector('[data-kit-gift]:checked');
    if (!input || !input.value) return null;
    return { id: Number(input.value), price: Number(input.dataset.price) };
  }

  function setText(selector, text) {
    root.querySelector(selector).textContent = text;
  }

  function update() {
    var wax = waxEl && waxEl.dataset.available === 'true'
      ? { id: Number(waxEl.dataset.variantId), price: Number(waxEl.dataset.price) }
      : null;
    var gift = selectedGift();
    var ready = Boolean(selectedBoard && selectedVariant && wax);

    setText(
      '[data-kit-board-name]',
      selectedBoard && selectedVariant && !isSingleDefaultVariant(selectedBoard)
        ? selectedBoard.title + ' – ' + selectedVariant.title
        : selectedBoard ? selectedBoard.title : i18n.noBoardSelected
    );
    setText('[data-kit-board-price]', selectedVariant ? money(selectedVariant.price) : '–');
    setText('[data-kit-wax-price]', wax ? money(wax.price) : '–');

    var giftLine = root.querySelector('[data-kit-gift-line]');
    giftLine.hidden = !gift;
    if (gift) setText('[data-kit-gift-price]', money(gift.price));

    if (ready) {
      var saving = lineSaving(selectedVariant.price) + lineSaving(wax.price);
      var total = selectedVariant.price + wax.price - saving + (gift ? gift.price : 0);
      setText('[data-kit-saving]', '−' + money(saving));
      setText('[data-kit-total]', money(total));
    } else {
      setText('[data-kit-saving]', '–');
      setText('[data-kit-total]', '–');
    }

    submit.disabled = !ready || submitting;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function setSubmitting(value) {
    submitting = value;
    submit.textContent = value ? i18n.adding : i18n.addToCart;
    update();
  }

  boardSelect.addEventListener('change', function () {
    selectedBoard =
      boards.find(function (board) {
        return board.handle === boardSelect.value;
      }) || null;
    renderSizes();
    update();
  });

  form.addEventListener('change', function (event) {
    if (event.target.matches('[data-kit-gift]')) update();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting || submit.disabled) return;

    var items = [
      { id: selectedVariant.id, quantity: 1 },
      { id: Number(waxEl.dataset.variantId), quantity: 1 },
    ];
    var gift = selectedGift();
    if (gift) items.push({ id: gift.id, quantity: 1 });

    showError('');
    setSubmitting(true);

    fetch(root.dataset.cartAddUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items }),
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body.description || body.message || i18n.error);
          window.location.assign(root.dataset.cartUrl);
        });
      })
      .catch(function (error) {
        showError(error.message || i18n.error);
        setSubmitting(false);
      });
  });

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) setSubmitting(false);
  });

  // The first page of products is rendered by Liquid; pull in any further pages.
  function loadRemainingPages() {
    var pages = Number(root.dataset.pages || 1);
    var requests = [];
    for (var page = 2; page <= pages; page += 1) {
      var url = new URL(window.location.href);
      url.searchParams.set('page', page);
      requests.push(
        fetch(url.toString())
          .then(function (response) {
            return response.text();
          })
          .then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var data = doc.querySelector('[data-kit-boards]');
            return data ? JSON.parse(data.textContent) : [];
          })
          .catch(function () {
            return [];
          })
      );
    }
    if (!requests.length) return;
    Promise.all(requests).then(function (results) {
      results.forEach(function (more) {
        boards = boards.concat(more);
      });
      renderBoardOptions();
    });
  }

  root.querySelectorAll('[data-kit-money]').forEach(function (el) {
    el.textContent = money(Number(el.dataset.kitMoney));
  });

  renderBoardOptions();
  update();
  loadRemainingPages();
})();
