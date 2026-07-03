// Master options for hardcoded dropdown fields
const MASTER_OPTIONS = {
  category: ['Online', 'Offline', 'Free Sample', 'Tier 1', 'Tier 2', 'Tier 3'],
  channel: ['Shopee', 'Tokopedia', 'WA Order', 'Conference'],
  location: [
    'Apartemen Surabaya',
    'Mavelyn',
    'Gudang Jemursari',
    'Gudang Riverside',
    'Gibeon',
    'Petra',
    'LilinKecil',
    'Insight Unlimited'
  ]
};

// Stock index used for SKU/Product dropdowns and smart sync
let STOCK_INDEX = {
  allProducts: [],
  availableProducts: [],
  allSkus: [],
  availableSkus: [],
  bySku: {},
  byProduct: {},
  bySkuLocation: {},
  byProductLocation: {},
  availableSkusByLocation: {},
  availableProductsByLocation: {}
};

// Build searchable stock index after stock rows are loaded
function buildStockIndex(stockRows) {
  const allP = new Set();
  const availP = new Set();
  const allS = new Set();
  const availS = new Set();
  const bySku = {};
  const byProduct = {};
  const bySkuLocation = {};
  const byProductLocation = {};
  const skuLoc = {};
  const prodLoc = {};

  // Normalize stock rows and create lookup maps
  (stockRows || []).forEach(r => {
    const sku = clean(r.sku).toUpperCase();
    const p = clean(r.product_name);
    const l = clean(r.location);
    const q = num(r.qty);

    const rec = {
      sku,
      product_name: p,
      location: l,
      qty: q,
      price: num(r.price),
      tier1_price: num(r.tier1_price),
      tier2_price: num(r.tier2_price),
      tier3_price: num(r.tier3_price),
      cogs: num(r.cogs)
    };

    // Skip empty stock row
    if (!sku && !p) return;

    // Index SKU values
    if (sku) {
      allS.add(sku);
      if (!bySku[sku]) bySku[sku] = rec;
      if (l) bySkuLocation[`${l}||${sku}`] = rec;
    }

    // Index product values
    if (p) {
      allP.add(p);
      if (!byProduct[p.toLowerCase()]) byProduct[p.toLowerCase()] = rec;
      if (l) byProductLocation[`${l}||${p.toLowerCase()}`] = rec;
    }

    // Only stock with qty > 0 is available for sales/transfer
    if (q > 0) {
      if (sku) availS.add(sku);
      if (p) availP.add(p);

      if (l) {
        if (!skuLoc[l]) skuLoc[l] = new Set();
        if (!prodLoc[l]) prodLoc[l] = new Set();
        if (sku) skuLoc[l].add(sku);
        if (p) prodLoc[l].add(p);
      }
    }
  });

  // Save final index
  STOCK_INDEX = {
    allProducts: [...allP].sort(),
    availableProducts: [...availP].sort(),
    allSkus: [...allS].sort(),
    availableSkus: [...availS].sort(),
    bySku,
    byProduct,
    bySkuLocation,
    byProductLocation,
    availableSkusByLocation: Object.fromEntries(
      Object.entries(skuLoc).map(([k, v]) => [k, [...v].sort()])
    ),
    availableProductsByLocation: Object.fromEntries(
      Object.entries(prodLoc).map(([k, v]) => [k, [...v].sort()])
    )
  };

  // Initialize dropdowns and smart sync after stock data is ready
  initLiveDropdowns();
  bindSmartSync();
}

// Initialize all inputs marked with data-live-dropdown
function initLiveDropdowns() {
  document.querySelectorAll('[data-live-dropdown]').forEach(input => {
    // Prevent duplicate setup
    if (input.dataset.liveReady === '1') return;
    input.dataset.liveReady = '1';

    // Disable native browser autocomplete
    input.setAttribute('autocomplete', 'off');

    // Create floating panel in body so it is not affected by form/card/grid layout
    const panel = document.createElement('div');
    panel.className = 'live-dropdown-floating-panel';
    panel.hidden = true;
    document.body.appendChild(panel);

    // Store panel reference on input
    input._panel = panel;

    // Show dropdown on focus
    input.addEventListener('focus', () => renderLiveDropdown(input));

    // Filter dropdown while typing
    input.addEventListener('input', () => renderLiveDropdown(input));

    // Sync SKU/Product/Price when value changes
    input.addEventListener('change', () => syncSkuProduct(input));

    // Close dropdown using Enter
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        panel.hidden = true;
        syncSkuProduct(input);
      }
    });

    // Reposition on any scroll, including inner scroll containers
    window.addEventListener(
      'scroll',
      () => {
        if (!panel.hidden) positionLiveDropdown(input);
      },
      true
    );

    // Reposition on screen resize
    window.addEventListener('resize', () => {
      if (!panel.hidden) positionLiveDropdown(input);
    });

    // Hide dropdown when clicking outside input and panel
    document.addEventListener('click', e => {
      if (e.target !== input && !panel.contains(e.target)) {
        panel.hidden = true;
      }
    });
  });
}

// Position the floating dropdown exactly below the input field
function positionLiveDropdown(input) {
  const panel = input._panel;
  if (!panel) return;

  // Read exact input coordinates from browser viewport
  const rect = input.getBoundingClientRect();

  // Match dropdown with input position and width
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.width = `${rect.width}px`;
}

// Return available dropdown options based on input type
function optionsFor(input) {
  const t = input.dataset.liveDropdown;

  // Static dropdowns
  if (t === 'category') return MASTER_OPTIONS.category;
  if (t === 'channel') return MASTER_OPTIONS.channel;
  if (t === 'location') return MASTER_OPTIONS.location;

  // Stock/report dropdowns
  if (t === 'sku-stock') return STOCK_INDEX.allSkus;
  if (t === 'product-stock' || t === 'product-report') return STOCK_INDEX.allProducts;

  // Sales SKU/report SKU should use selected location when available
  if (t === 'sku-sale' || t === 'sku-report') {
    const l = clean(input.closest('form')?.querySelector('[name="location"]')?.value);
    return l && STOCK_INDEX.availableSkusByLocation[l]
      ? STOCK_INDEX.availableSkusByLocation[l]
      : STOCK_INDEX.availableSkus;
  }

  // Sales product should use selected location when available
  if (t === 'product-sale') {
    const l = clean(input.closest('form')?.querySelector('[name="location"]')?.value);
    return l && STOCK_INDEX.availableProductsByLocation[l]
      ? STOCK_INDEX.availableProductsByLocation[l]
      : STOCK_INDEX.availableProducts;
  }

  // Transfer SKU should use selected from_location when available
  if (t === 'sku-transfer') {
    const l = clean(input.closest('form')?.querySelector('[name="from_location"]')?.value);
    return l && STOCK_INDEX.availableSkusByLocation[l]
      ? STOCK_INDEX.availableSkusByLocation[l]
      : STOCK_INDEX.availableSkus;
  }

  // Transfer product should use selected from_location when available
  if (t === 'product-transfer') {
    const l = clean(input.closest('form')?.querySelector('[name="from_location"]')?.value);
    return l && STOCK_INDEX.availableProductsByLocation[l]
      ? STOCK_INDEX.availableProductsByLocation[l]
      : STOCK_INDEX.availableProducts;
  }

  return [];
}

// Render dropdown options below the active input
function renderLiveDropdown(input) {
  const panel = input._panel;
  if (!panel) return;

  // Position before rendering to avoid layout jump
  positionLiveDropdown(input);

  // Filter available options using typed keyword
  const q = clean(input.value).toLowerCase();
  const opts = optionsFor(input)
    .filter(x => x.toLowerCase().includes(q))
    .slice(0, 40);

  // Show empty state when nothing matches
  if (!opts.length) {
    panel.innerHTML = '<div class="live-dropdown-empty">No matching option</div>';
    panel.hidden = false;
    positionLiveDropdown(input);
    return;
  }

  // Render dropdown buttons
  panel.innerHTML = opts
    .map(o => `<button type="button" class="live-dropdown-option">${esc(o)}</button>`)
    .join('');

  // Apply selected value when user clicks an option
  panel.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      input.value = btn.textContent;
      panel.hidden = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncSkuProduct(input);
    };
  });

  // Show and reposition after content is ready
  panel.hidden = false;
  positionLiveDropdown(input);
}

// Bind smart sync events once
function bindSmartSync() {
  document
    .querySelectorAll('[name="sku"],[name="product_name"],[name="category"],[name="location"],[name="from_location"]')
    .forEach(input => {
      if (input.dataset.syncReady === '1') return;
      input.dataset.syncReady = '1';
      input.addEventListener('change', () => syncSkuProduct(input));
    });
}

// Find stock match from form values
function findMatch(form) {
  const sku = clean(form.querySelector('[name="sku"]')?.value).toUpperCase();
  const product = clean(form.querySelector('[name="product_name"]')?.value).toLowerCase();
  const loc =
    clean(form.querySelector('[name="location"]')?.value) ||
    clean(form.querySelector('[name="from_location"]')?.value);

  // Priority: location+SKU, location+product, SKU, product
  return (
    (loc && sku && STOCK_INDEX.bySkuLocation[`${loc}||${sku}`]) ||
    (loc && product && STOCK_INDEX.byProductLocation[`${loc}||${product}`]) ||
    (sku && STOCK_INDEX.bySku[sku]) ||
    (product && STOCK_INDEX.byProduct[product]) ||
    null
  );
}

// Select price based on category
function priceForCategory(m, c) {
  if (!m) return '';
  if (c === 'Free Sample') return 0;
  if (c === 'Tier 1') return m.tier1_price || 0;
  if (c === 'Tier 2') return m.tier2_price || 0;
  if (c === 'Tier 3') return m.tier3_price || 0;
  return m.price || 0;
}

// Sync SKU, product name, category, channel, price, and stock defaults
function syncSkuProduct(input) {
  const form = input.closest('form');
  if (!form) return;

  const skuI = form.querySelector('[name="sku"]');
  const prodI = form.querySelector('[name="product_name"]');
  const catI = form.querySelector('[name="category"]');
  const chanI = form.querySelector('[name="channel"]');

  // Tier category always uses WA Order channel
  if (catI && chanI && ['Tier 1', 'Tier 2', 'Tier 3'].includes(catI.value)) {
    chanI.value = 'WA Order';
    flash(chanI);
  }

  // Force SKU uppercase
  if (skuI) skuI.value = clean(skuI.value).toUpperCase();

  // Stop if form does not have SKU/Product pair
  if (!skuI || !prodI) return;

  const m = findMatch(form);
  if (!m) return;

  // SKU selected should fill product
  if (input.name === 'sku' || !prodI.value) {
    prodI.value = m.product_name || prodI.value;
    flash(prodI);
  }

  // Product selected should fill SKU
  if (input.name === 'product_name' || !skuI.value) {
    skuI.value = m.sku || skuI.value;
    flash(skuI);
  }

  // Sales price follows category
  if (catI && form.querySelector('[name="price"]')) {
    setVal(form, 'price', priceForCategory(m, catI.value));
  }

  // Stock form should prefill existing price and COGS values
  if (form.id === 'stockForm') {
    setVal(form, 'price', m.price);
    setVal(form, 'tier1_price', m.tier1_price);
    setVal(form, 'tier2_price', m.tier2_price);
    setVal(form, 'tier3_price', m.tier3_price);
    setVal(form, 'cogs', m.cogs);
  }
}

// Set a form value and flash it
function setVal(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el && value !== undefined && value !== null && value !== '') {
    el.value = value;
    flash(el);
  }
}

// Add flash animation to changed field
function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// Trim text safely
function clean(v) {
  return String(v || '').trim();
}

// Convert value to safe number
function num(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

// Escape option text before rendering HTML
function esc(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
