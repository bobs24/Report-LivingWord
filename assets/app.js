// =========================================================
// Sales & Stock Control - app.js
// Stable app with invoice download support
// =========================================================

const APP_CONFIG = window.APP_CONFIG || {};

const MASTER_OPTIONS = {
  category: ['Online', 'Offline', 'Free Sample', 'Tier 1', 'Tier 2', 'Tier 3'],
  channel: ['Shopee', 'Tokopedia', 'WA Order', 'Conference'],
  location: ['Apartemen Surabaya', 'Mavelyn', 'Gudang Jemursari', 'Gudang Riverside', 'Gibeon', 'Petra', 'LilinKecil', 'Insight Unlimited']
};

const MONTHS = [
  { n: 1, name: 'January' }, { n: 2, name: 'February' }, { n: 3, name: 'March' },
  { n: 4, name: 'April' }, { n: 5, name: 'May' }, { n: 6, name: 'June' },
  { n: 7, name: 'July' }, { n: 8, name: 'August' }, { n: 9, name: 'September' },
  { n: 10, name: 'October' }, { n: 11, name: 'November' }, { n: 12, name: 'December' }
];

const INVOICE_THEME = {
  primary: '#2F5D50',
  accent: '#C9A24A',
  text: '#24312F',
  muted: '#6B7B77',
  lightBg: '#F7F3EA',
  border: '#D8D2C2'
};

const state = {
  client: null,
  user: null,
  sales: [],
  stock: [],
  transfers: [],
  movements: [],
  draftLines: [],
  editLineIndex: null,
  editStockId: null,
  reportRows: [],
  reportProductSummary: [],
  reportChannelSummary: [],
  reportTimeSeries: [],
  stockIndex: {
    allProducts: [], availableProducts: [], allSkus: [], availableSkus: [],
    bySku: {}, byProduct: {}, bySkuLocation: {}, byProductLocation: {},
    availableSkusByLocation: {}, availableProductsByLocation: {}
  }
};

const columns = {
  sales: ['status', 'action', 'sale_date', 'created_by', 'location', 'category', 'channel', 'order_number', 'customer_name', 'sku', 'product_name', 'qty', 'price', 'discount_type', 'discount_value', 'discount', 'total_price', 'remark'],
  stock: ['action', 'stock_status', 'location', 'sku', 'product_name', 'qty', 'price', 'tier1_price', 'tier2_price', 'tier3_price', 'cogs', 'updated_at'],
  transfer: ['action', 'transfer_date', 'created_by', 'sku', 'product_name', 'from_location', 'to_location', 'qty', 'remark'],
  movement: ['created_at', 'created_by', 'movement_type', 'location', 'sku', 'product_name', 'qty_change', 'reference_type', 'reference_key', 'remark'],
  draft: ['action', 'sku', 'product_name', 'qty', 'price', 'discount_type', 'discount_value', 'line_total'],
  productSummary: ['product_name', 'qty', 'amount'],
  channelSummary: ['channel', 'qty', 'amount', 'transactions']
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  init();
  setDefaultDates();
  bindEvents();
  renderReportInputs();
  renderDraftTable();
  initDropdowns();
  await loadUser();
  await refreshAll();
});

function init() {
  if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_ANON_KEY) {
    $('userEmail').textContent = 'Supabase config missing';
    showMessage('Missing Supabase config. Check assets/config.js and GitHub Secrets.', 'err');
    return;
  }
  state.client = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
}

function bindEvents() {
  document.querySelectorAll('.tab-button').forEach((button) => button.onclick = () => showTab(button.dataset.tab, button));
  $('loginButton').onclick = signInWithGoogle;
  $('logoutButton').onclick = signOut;
  $('refreshButton').onclick = refreshAll;
  $('addLineButton').onclick = addDraftLine;
  $('submitOrderButton').onclick = submitSalesOrder;
  $('stockForm').onsubmit = submitStock;
  $('transferForm').onsubmit = submitTransfer;
  $('reportType').onchange = renderReportInputs;
  $('loadReportButton').addEventListener('click', loadReport);
  document.querySelectorAll('[data-export]').forEach((button) => button.onclick = () => exportByType(button.dataset.export));
  ['salesSearch', 'stockSearch', 'transferSearch', 'movementSearch'].forEach((id) => $(id).addEventListener('input', renderMainTables));
  document.addEventListener('click', handleTableActions);

  const categoryInput = document.querySelector('[name="category"]');
  if (categoryInput) {
    categoryInput.addEventListener('change', (event) => {
      const channelInput = document.querySelector('[name="channel"]');
      const orderInput = document.querySelector('[name="order_number"]');
      if (['Tier 1', 'Tier 2', 'Tier 3'].includes(event.target.value) && channelInput) channelInput.value = 'WA Order';
      if (event.target.value === 'Free Sample' && orderInput) orderInput.value = '';
      syncSkuProduct(event.target);
    });
  }

  document.querySelectorAll('[name="sku"], [name="order_number"]').forEach((input) => {
    input.addEventListener('input', () => {
      const position = input.selectionStart;
      input.value = input.value.toUpperCase();
      input.setSelectionRange(position, position);
    });
  });
}

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('input[type="date"]').forEach((input) => input.value = today);
}

async function signInWithGoogle() {
  if (!ensureClient()) return;
  const { error } = await state.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } });
  if (error) showMessage(error.message, 'err');
}

async function signOut() {
  if (!ensureClient()) return;
  await state.client.auth.signOut();
  state.user = null;
  updateUserDisplay();
  showMessage('Signed out successfully.', 'ok');
}

async function loadUser() {
  if (!state.client) {
    $('userEmail').textContent = 'Not connected';
    return;
  }

  const { data, error } = await state.client.auth.getUser();
  if (error) {
    $('userEmail').textContent = 'Session check failed';
    showMessage(error.message, 'err');
    return;
  }

  state.user = data.user || null;
  if (!state.user) {
    updateUserDisplay();
    return;
  }

  const { data: isAllowed, error: allowError } = await state.client.rpc('is_allowed_user');
  if (allowError) {
    showMessage(allowError.message, 'err');
    return;
  }

  if (!isAllowed) {
    await state.client.auth.signOut();
    state.user = null;
    updateUserDisplay();
    showMessage('Access denied. Your email is not allowed to use this application.', 'err');
    return;
  }

  updateUserDisplay();
}

function updateUserDisplay() {
  $('userEmail').textContent = state.user?.email || 'Not signed in';
}

async function refreshAll() {
  if (!ensureClient()) return;
  setLoading(true);
  try {
    await loadUser();
    const results = await Promise.all([
      fetchAllRows('sales', 'created_at', false),
      fetchAllRows('stock', 'location', true),
      fetchAllRows('transfer_stock', 'created_at', false),
      fetchAllRows('stock_movements', 'created_at', false)
    ]);

    for (const result of results) {
      if (result.error) {
        showMessage(result.error.message, 'err');
        return;
      }
    }

    state.sales = results[0].data || [];
    state.stock = (results[1].data || [])
      .map(addStockStatus)
      .sort((a, b) => String(a.location).localeCompare(String(b.location)) || String(a.sku).localeCompare(String(b.sku)));
    state.transfers = results[2].data || [];
    state.movements = results[3].data || [];

    buildStockIndex(state.stock.filter((row) => (row.status || 'ACTIVE') === 'ACTIVE'));
    renderMainTables();
    showMessage('Data refreshed.', 'ok');
  } catch (error) {
    showMessage(error.message || 'Unexpected error while refreshing data.', 'err');
  } finally {
    setLoading(false);
  }
}

async function fetchAllRows(tableName, orderColumn, ascending = true) {
  let allRows = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const result = await state.client.from(tableName).select('*').order(orderColumn, { ascending }).range(from, from + batchSize - 1);
    if (result.error) return { data: allRows, error: result.error };
    allRows = allRows.concat(result.data || []);
    if (!result.data || result.data.length < batchSize) break;
    from += batchSize;
  }

  return { data: allRows, error: null };
}

function buildStockIndex(rows) {
  const allProducts = new Set();
  const availableProducts = new Set();
  const allSkus = new Set();
  const availableSkus = new Set();
  const bySku = {};
  const byProduct = {};
  const bySkuLocation = {};
  const byProductLocation = {};
  const skusByLocation = {};
  const productsByLocation = {};

  rows.forEach((row) => {
    const sku = cleanText(row.sku).toUpperCase();
    const product = cleanText(row.product_name);
    const location = cleanText(row.location);
    const qty = numberValue(row.qty);
    if (!sku && !product) return;

    const record = {
      sku,
      product_name: product,
      location,
      qty,
      price: numberValue(row.price),
      tier1_price: numberValue(row.tier1_price),
      tier2_price: numberValue(row.tier2_price),
      tier3_price: numberValue(row.tier3_price),
      cogs: numberValue(row.cogs)
    };

    if (sku) {
      allSkus.add(sku);
      bySku[sku] ??= record;
      if (location) bySkuLocation[`${location}||${sku}`] = record;
    }

    if (product) {
      allProducts.add(product);
      byProduct[product.toLowerCase()] ??= record;
      if (location) byProductLocation[`${location}||${product.toLowerCase()}`] = record;
    }

    if (qty > 0) {
      if (sku) availableSkus.add(sku);
      if (product) availableProducts.add(product);
      if (location) {
        skusByLocation[location] ??= new Set();
        productsByLocation[location] ??= new Set();
        if (sku) skusByLocation[location].add(sku);
        if (product) productsByLocation[location].add(product);
      }
    }
  });

  state.stockIndex = {
    allProducts: [...allProducts].sort(),
    availableProducts: [...availableProducts].sort(),
    allSkus: [...allSkus].sort(),
    availableSkus: [...availableSkus].sort(),
    bySku,
    byProduct,
    bySkuLocation,
    byProductLocation,
    availableSkusByLocation: setMapToObject(skusByLocation),
    availableProductsByLocation: setMapToObject(productsByLocation)
  };
}

function initDropdowns() {
  document.querySelectorAll('[data-dd]').forEach((input) => {
    if (input.dataset.ready) return;
    input.dataset.ready = '1';

    const panel = document.createElement('div');
    panel.className = 'dropdown-panel';
    panel.hidden = true;
    document.body.appendChild(panel);
    input._panel = panel;

    input.addEventListener('focus', () => renderDropdown(input));
    input.addEventListener('input', () => renderDropdown(input));
    input.addEventListener('change', () => syncSkuProduct(input));
    window.addEventListener('scroll', () => { if (!panel.hidden) positionDropdown(input); }, true);
    window.addEventListener('resize', () => { if (!panel.hidden) positionDropdown(input); });
    document.addEventListener('pointerdown', (event) => { if (event.target !== input && !panel.contains(event.target)) panel.hidden = true; });
  });
}

function positionDropdown(input) {
  const panel = input._panel;
  if (!panel) return;

  const rect = input.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;

  if (viewportWidth <= 700) {
    panel.classList.add('mobile-mode');
    return;
  }

  panel.classList.remove('mobile-mode');
  panel.style.left = `${Math.max(8, Math.min(rect.left, viewportWidth - rect.width - 8))}px`;
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.width = `${Math.max(rect.width, 180)}px`;
  panel.style.maxHeight = `${Math.max(140, viewportHeight - rect.bottom - 16)}px`;
}

function dropdownOptions(input) {
  const type = input.dataset.dd;
  const index = state.stockIndex;

  if (type === 'category') return MASTER_OPTIONS.category;
  if (type === 'channel') return MASTER_OPTIONS.channel;
  if (type === 'location') return MASTER_OPTIONS.location;
  if (type === 'sku-stock') return index.allSkus;
  if (type === 'product-stock' || type === 'product-report') return index.allProducts;

  const form = input.closest('form');
  const location = cleanText(form?.querySelector('[name="location"]')?.value);
  const fromLocation = cleanText(form?.querySelector('[name="from_location"]')?.value);

  if (type === 'sku-sale' || type === 'sku-report') return location && index.availableSkusByLocation[location] ? index.availableSkusByLocation[location] : index.availableSkus;
  if (type === 'product-sale') return location && index.availableProductsByLocation[location] ? index.availableProductsByLocation[location] : index.availableProducts;
  if (type === 'sku-transfer') return fromLocation && index.availableSkusByLocation[fromLocation] ? index.availableSkusByLocation[fromLocation] : index.availableSkus;
  if (type === 'product-transfer') return fromLocation && index.availableProductsByLocation[fromLocation] ? index.availableProductsByLocation[fromLocation] : index.availableProducts;

  return [];
}

function renderDropdown(input) {
  const panel = input._panel;
  if (!panel) return;

  const query = cleanText(input.value).toLowerCase();
  const options = dropdownOptions(input).filter((option) => String(option).toLowerCase().includes(query)).slice(0, 40);

  panel.innerHTML = options.length
    ? options.map((option) => `<button type="button" class="dropdown-option">${escapeHtml(option)}</button>`).join('')
    : '<div class="dropdown-empty">No matching option</div>';

  panel.querySelectorAll('button').forEach((button) => {
    button.onclick = () => {
      input.value = button.textContent.trim();
      panel.hidden = true;
      syncSkuProduct(input);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });

  panel.hidden = false;
  positionDropdown(input);
}

function addDraftLine() {
  const form = $('salesForm');
  const line = {
    sku: cleanText(form.sku.value).toUpperCase(),
    product_name: cleanText(form.product_name.value),
    qty: numberValue(form.qty.value),
    price: numberValue(form.price.value),
    discount_type: cleanText(form.discount_type.value) || 'AMOUNT',
    discount_value: numberValue(form.discount_value.value),
    remark: cleanText(form.remark.value)
  };

  if (!line.sku || !line.product_name || line.qty <= 0) return showMessage('Please fill SKU, Product Name, and Qty correctly.', 'err');

  const editIndex = Number.isInteger(state.editLineIndex) ? state.editLineIndex : null;
  const isDuplicateSku = state.draftLines.some((existingLine, index) => existingLine.sku === line.sku && index !== editIndex);
  if (isDuplicateSku) return showMessage('Duplicate SKU in draft.', 'err');

  line.line_total = calculateLineTotal(line);

  if (editIndex !== null && state.draftLines[editIndex]) {
    state.draftLines[editIndex] = line;
    state.editLineIndex = null;
    $('addLineButton').textContent = 'Add Product to Draft';
    showMessage('Draft line updated.', 'ok');
  } else {
    state.draftLines.push(line);
    showMessage('Product added to draft.', 'ok');
  }

  ['sku', 'product_name', 'qty', 'price', 'discount_value', 'remark'].forEach((name) => {
    if (form[name]) form[name].value = name === 'qty' ? 1 : name === 'discount_value' ? 0 : '';
  });

  renderDraftTable();
}

function editDraftLine(index) {
  const line = state.draftLines[index];
  const form = $('salesForm');
  if (!line) return;

  form.sku.value = line.sku;
  form.product_name.value = line.product_name;
  form.qty.value = line.qty;
  form.price.value = line.price;
  form.discount_type.value = line.discount_type;
  form.discount_value.value = line.discount_value;
  form.remark.value = line.remark || '';

  state.editLineIndex = index;
  $('addLineButton').textContent = 'Update Draft Line';
  form.sku.focus();
  showMessage('Draft line loaded for editing.', 'ok');
}

function removeDraftLine(index) {
  state.draftLines.splice(index, 1);
  if (state.editLineIndex === index) {
    state.editLineIndex = null;
    $('addLineButton').textContent = 'Add Product to Draft';
  }
  renderDraftTable();
  showMessage('Draft line removed.', 'ok');
}

function renderDraftTable() {
  renderTable('draftTable', state.draftLines.map((line, index) => ({ ...line, action: index })), columns.draft);
  $('draftSummaryText').textContent = state.draftLines.length
    ? `${state.draftLines.length} line(s), total ${formatCurrency(state.draftLines.reduce((sum, line) => sum + line.line_total, 0))}`
    : 'No draft lines yet.';
}

function calculateLineTotal(line) {
  const gross = line.qty * line.price;
  const discount = line.discount_type === 'PERCENT' ? gross * line.discount_value / 100 : line.discount_value;
  return gross - discount;
}

async function submitSalesOrder() {
  if (!ensureReadyForWrite()) return;
  if (!state.draftLines.length) return showMessage('Please add at least one product first.', 'err');

  const form = $('salesForm');
  const header = {
    sale_date: form.sale_date.value,
    location: cleanText(form.location.value),
    category: cleanText(form.category.value),
    channel: cleanText(form.channel.value),
    order_number: cleanText(form.order_number.value).toUpperCase(),
    customer_name: cleanText(form.customer_name?.value)
  };

  if (['Tier 1', 'Tier 2', 'Tier 3'].includes(header.category)) header.channel = 'WA Order';
  if (header.category === 'Free Sample') header.order_number = '';
  if (header.category !== 'Free Sample' && !header.order_number) return showMessage('Order / Invoice Number is required except for Free Sample.', 'err');

  const { error } = await state.client.rpc('add_sales_order', { p_header: header, p_lines: state.draftLines });
  if (error) return showMessage(error.message, 'err');

  state.draftLines = [];
  state.editLineIndex = null;
  renderDraftTable();
  showMessage('Full order submitted successfully.', 'ok');
  await refreshAll();
}

async function submitStock(event) {
  event.preventDefault();
  if (!ensureReadyForWrite()) return;

  const payload = normalizeStock(formObject(event.target));

  if (state.editStockId) {
    const reason = prompt('Reason for editing this stock?');
    if (reason === null) return;
    if (!cleanText(reason)) return showMessage('Edit reason is required.', 'err');

    const { error } = await state.client.rpc('edit_stock_item', {
      p_stock_id: state.editStockId,
      p_location: payload.location,
      p_sku: payload.sku,
      p_product_name: payload.product_name,
      p_qty: payload.qty,
      p_price: payload.price,
      p_tier1_price: payload.tier1_price,
      p_tier2_price: payload.tier2_price,
      p_tier3_price: payload.tier3_price,
      p_cogs: payload.cogs,
      p_edit_reason: cleanText(reason)
    });

    if (error) return showMessage(error.message, 'err');

    state.editStockId = null;
    event.target.reset();
    const stockSubmitButton = event.target.querySelector('button[type="submit"]');
    if (stockSubmitButton) stockSubmitButton.textContent = 'Add Stock';

    showMessage('Stock updated successfully and movement reason recorded.', 'ok');
    await refreshAll();
    return;
  }

  const { error } = await state.client.rpc('upsert_stock_item', {
    p_location: payload.location,
    p_sku: payload.sku,
    p_product_name: payload.product_name,
    p_qty: payload.qty,
    p_price: payload.price,
    p_tier1_price: payload.tier1_price,
    p_tier2_price: payload.tier2_price,
    p_tier3_price: payload.tier3_price,
    p_cogs: payload.cogs
  });

  if (error) return showMessage(error.message, 'err');

  event.target.reset();
  showMessage('Stock saved.', 'ok');
  await refreshAll();
}

function editStock(stockId) {
  const stockRow = state.stock.find((row) => row.id === stockId);
  if (!stockRow) return showMessage('Stock row not found.', 'err');

  const form = $('stockForm');
  form.location.value = stockRow.location || '';
  form.sku.value = stockRow.sku || '';
  form.product_name.value = stockRow.product_name || '';
  form.qty.value = numberValue(stockRow.qty);
  form.price.value = numberValue(stockRow.price);
  form.tier1_price.value = numberValue(stockRow.tier1_price);
  form.tier2_price.value = numberValue(stockRow.tier2_price);
  form.tier3_price.value = numberValue(stockRow.tier3_price);
  form.cogs.value = numberValue(stockRow.cogs);

  state.editStockId = stockId;
  const stockSubmitButton = form.querySelector('button[type="submit"]');
  if (stockSubmitButton) stockSubmitButton.textContent = 'Update Stock';

  showTab('stockSection', document.querySelector('[data-tab="stockSection"]'));
  form.sku.focus();
  showMessage('Stock loaded for editing. Reason will be required when saving.', 'ok');
}

async function removeStock(stockId) {
  if (!ensureReadyForWrite()) return;

  const reason = prompt('Reason for removing this stock?');
  if (reason === null) return;
  if (!cleanText(reason)) return showMessage('Remove reason is required.', 'err');

  const { error } = await state.client.rpc('remove_stock_item', {
    p_stock_id: stockId,
    p_remove_reason: cleanText(reason)
  });

  if (error) return showMessage(error.message, 'err');

  showMessage('Stock removed and movement reason recorded.', 'ok');
  await refreshAll();
}

async function submitTransfer(event) {
  event.preventDefault();
  if (!ensureReadyForWrite()) return;

  const payload = normalizeTransfer(formObject(event.target));
  const { error } = await state.client.rpc('transfer_stock_transaction', {
    p_transfer_date: payload.transfer_date,
    p_sku: payload.sku,
    p_product_name: payload.product_name,
    p_from_location: payload.from_location,
    p_to_location: payload.to_location,
    p_qty: payload.qty,
    p_remark: payload.remark
  });

  if (error) return showMessage(error.message, 'err');

  event.target.reset();
  setDefaultDates();
  showMessage('Transfer saved.', 'ok');
  await refreshAll();
}

async function removeTransfer(transferId) {
  if (!ensureReadyForWrite()) return;

  const reason = prompt('Reason for removing this transfer?');
  if (reason === null) return;
  if (!cleanText(reason)) return showMessage('Remove reason is required.', 'err');

  const { error } = await state.client.rpc('remove_transfer_transaction', {
    p_transfer_id: transferId,
    p_remove_reason: cleanText(reason)
  });

  if (error) return showMessage(error.message, 'err');

  showMessage('Transfer removed, stock reversed, and movement reason recorded.', 'ok');
  await refreshAll();
}

async function revokeSale(id) {
  if (!ensureReadyForWrite()) return;

  const reason = prompt('Reason for revoke?');
  if (reason === null) return;
  if (!cleanText(reason)) return showMessage('Revoke reason is required.', 'err');

  const { error } = await state.client.rpc('revoke_sales_transaction', {
    p_sales_id: id,
    p_revoke_reason: cleanText(reason)
  });

  if (error) return showMessage(error.message, 'err');

  showMessage('Sales revoked and stock returned.', 'ok');
  await refreshAll();
}

function handleTableActions(event) {
  const editDraftButton = event.target.closest('[data-edit-line]');
  const removeDraftButton = event.target.closest('[data-remove-line]');
  const revokeSalesButton = event.target.closest('[data-revoke-sales-id]');
  const editStockButton = event.target.closest('[data-edit-stock-id]');
  const removeStockButton = event.target.closest('[data-remove-stock-id]');
  const removeTransferButton = event.target.closest('[data-remove-transfer-id]');
  const invoiceButton = event.target.closest('[data-invoice-sales-id]');

  if (editDraftButton) editDraftLine(Number(editDraftButton.dataset.editLine));
  if (removeDraftButton) removeDraftLine(Number(removeDraftButton.dataset.removeLine));
  if (revokeSalesButton) revokeSale(revokeSalesButton.dataset.revokeSalesId);
  if (editStockButton) editStock(editStockButton.dataset.editStockId);
  if (removeStockButton) removeStock(removeStockButton.dataset.removeStockId);
  if (removeTransferButton) removeTransfer(removeTransferButton.dataset.removeTransferId);
  if (invoiceButton) downloadSalesInvoice(invoiceButton.dataset.invoiceSalesId);
}

function renderMainTables() {
  const salesRows = filterRows(state.sales, $('salesSearch').value);
  const activeStockRows = filterRows(state.stock.filter((row) => (row.status || 'ACTIVE') === 'ACTIVE'), $('stockSearch').value).map((row) => ({ ...row, __actionType: 'stock' }));
  const activeTransferRows = filterRows(state.transfers.filter((row) => (row.status || 'ACTIVE') === 'ACTIVE'), $('transferSearch').value).map((row) => ({ ...row, __actionType: 'transfer' }));
  const movementRows = filterRows(state.movements, $('movementSearch').value);

  renderTable('salesTable', salesRows, columns.sales);
  renderTable('stockTable', activeStockRows, columns.stock);
  renderTable('transferTable', activeTransferRows, columns.transfer);
  renderTable('movementTable', movementRows, columns.movement);

  $('salesCountText').textContent = `Showing ${salesRows.length.toLocaleString()} of ${state.sales.length.toLocaleString()} loaded transactions.`;
}

function renderReportInputs() {
  const type = $('reportType').value;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthSelect = `<select id="reportMonth">${MONTHS.map((item) => `<option value="${item.n}" ${item.n === month ? 'selected' : ''}>${item.name}</option>`).join('')}</select>`;

  if (type === 'daily') {
    $('reportDynamicInputs').innerHTML = `<label>Start Date<input id="reportStartDate" type="date" value="${today}"></label><label>End Date<input id="reportEndDate" type="date" value="${today}"></label>`;
    return;
  }

  if (type === 'weekly') {
    $('reportDynamicInputs').innerHTML = `<label>Week<select id="reportWeek"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label><label>Month${monthSelect}</label><label>Year<input id="reportYear" type="number" value="${year}"></label>`;
    return;
  }

  $('reportDynamicInputs').innerHTML = `<label>Month${monthSelect}</label><label>Year<input id="reportYear" type="number" value="${year}"></label>`;
}

async function loadReport(event) {
  if (event) event.preventDefault();
  if (!ensureClient()) return;

  const range = getRange();
  if (!range) return;

  let query = state.client.from('sales').select('*').eq('status', 'ACTIVE').gte('sale_date', range.startDate).lte('sale_date', range.endDate).order('sale_date', { ascending: true });
  const product = cleanText($('reportProductFilter')?.value);
  const sku = cleanText($('reportSkuFilter')?.value);
  const location = cleanText($('reportLocationFilter')?.value);

  if (product) query = query.ilike('product_name', `%${product}%`);
  if (sku) query = query.ilike('sku', `%${sku}%`);
  if (location) query = query.ilike('location', `%${location}%`);

  const { data, error } = await query;
  if (error) return showMessage(error.message, 'err');

  buildReport(data || []);
  showMessage('Report loaded.', 'ok');
}

function buildReport(rows) {
  state.reportRows = rows;
  const productMap = new Map();
  const channelMap = new Map();
  const dateMap = new Map();
  let totalQty = 0;
  let totalAmount = 0;

  rows.forEach((row) => {
    const qty = numberValue(row.qty);
    const amount = numberValue(row.total_price);
    const product = row.product_name || 'Unknown';
    const channel = row.channel || 'Unknown';
    const date = row.sale_date || 'Unknown';

    totalQty += qty;
    totalAmount += amount;
    addSummary(productMap, product, { product_name: product, qty: 0, amount: 0 }, qty, amount);
    addSummary(channelMap, channel, { channel, qty: 0, amount: 0, transactions: 0 }, qty, amount, true);
    addSummary(dateMap, date, { label: date, qty: 0, amount: 0 }, qty, amount);
  });

  state.reportProductSummary = [...productMap.values()].sort((a, b) => b.amount - a.amount);
  state.reportChannelSummary = [...channelMap.values()].sort((a, b) => b.amount - a.amount);
  state.reportTimeSeries = [...dateMap.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));

  $('kpiQty').textContent = formatNumber(totalQty);
  $('kpiAmount').textContent = formatCurrency(totalAmount);
  $('kpiTransactions').textContent = formatNumber(rows.length);
  $('kpiTopProduct').textContent = state.reportProductSummary[0]?.product_name || '-';
  renderTable('productSummaryTable', state.reportProductSummary, columns.productSummary);
  renderTable('channelSummaryTable', state.reportChannelSummary, columns.channelSummary);
  drawChart('trendChart', state.reportTimeSeries);
}

function addSummary(map, key, initialValue, qty, amount, countTransaction = false) {
  if (!map.has(key)) map.set(key, initialValue);
  const current = map.get(key);
  current.qty += qty;
  current.amount += amount;
  if (countTransaction) current.transactions += 1;
}

function getRange() {
  const type = $('reportType').value;

  if (type === 'daily') {
    const startDate = $('reportStartDate').value;
    const endDate = $('reportEndDate').value;
    if (!startDate || !endDate || startDate > endDate) {
      showMessage('Invalid date range.', 'err');
      return null;
    }
    return { startDate, endDate };
  }

  const month = Number($('reportMonth').value);
  const year = Number($('reportYear').value);

  if (type === 'monthly') return { startDate: formatDate(year, month, 1), endDate: formatDate(year, month, new Date(year, month, 0).getDate()) };

  const week = Number($('reportWeek').value);
  const startDay = (week - 1) * 7 + 1;
  const endDay = week === 5 ? new Date(year, month, 0).getDate() : week * 7;
  return { startDate: formatDate(year, month, startDay), endDate: formatDate(year, month, endDay) };
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function renderTable(id, rows, tableColumns) {
  const element = $(id);
  if (!rows || !rows.length) {
    element.innerHTML = '<div class="empty-state">No data to show.</div>';
    return;
  }

  element.innerHTML = `<table><thead><tr>${tableColumns.map((column) => `<th>${escapeHtml(label(column))}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${tableColumns.map((column) => {
    const value = column === 'action' && id === 'draftTable' ? row.action : column === 'action' ? row : row[column];
    return `<td>${cell(value, column)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

function drawChart(id, data) {
  const element = $(id);
  if (!data || !data.length) {
    element.innerHTML = '<div class="empty-state">No report data.</div>';
    return;
  }

  const width = 1120;
  const height = 470;
  const padding = { top: 48, right: 92, bottom: 92, left: 92 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxAmount = Math.max(...data.map((item) => numberValue(item.amount)), 1);
  const maxQty = Math.max(...data.map((item) => numberValue(item.qty)), 1);
  const amountAxisMax = maxAmount * 1.15;
  const qtyAxisMax = maxQty * 1.25;
  const step = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(58, Math.max(24, step * 0.5));
  const x = (index) => padding.left + step * index + step / 2;
  const yAmount = (value) => padding.top + plotHeight - (numberValue(value) / amountAxisMax) * plotHeight;
  const yQty = (value) => padding.top + plotHeight - (numberValue(value) / qtyAxisMax) * plotHeight;
  const safe = (value) => escapeHtml(String(value));
  const shortAmount = (value) => {
    const number = numberValue(value);
    if (number >= 1000000000) return `${(number / 1000000000).toFixed(1)}B`;
    if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
    if (number >= 1000) return `${(number / 1000).toFixed(0)}K`;
    return formatNumber(number);
  };
  const shortQty = (value) => formatNumber(value);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const amountAxis = ticks.map((ratio) => {
    const y = padding.top + plotHeight - ratio * plotHeight;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="grid-line"></line><text x="${padding.left - 14}" y="${y + 4}" text-anchor="end" class="axis-label amount-axis-label">${safe(shortAmount(amountAxisMax * ratio))}</text>`;
  }).join('');
  const qtyAxis = ticks.map((ratio) => {
    const y = padding.top + plotHeight - ratio * plotHeight;
    return `<text x="${width - padding.right + 14}" y="${y + 4}" text-anchor="start" class="axis-label qty-axis-label">${safe(shortQty(qtyAxisMax * ratio))}</text>`;
  }).join('');
  const axisTitles = `<text x="${padding.left}" y="24" text-anchor="start" class="axis-title amount-title">Sales Amount</text><text x="${width - padding.right}" y="24" text-anchor="end" class="axis-title qty-title">Qty Sold</text>`;
  const highestAmount = Math.max(...data.map((item) => numberValue(item.amount)));
  const bars = data.map((item, index) => {
    const amount = numberValue(item.amount);
    const barHeight = padding.top + plotHeight - yAmount(amount);
    const barX = x(index) - barWidth / 2;
    const barY = yAmount(amount);
    const labelInside = barHeight >= 32;
    const labelY = labelInside ? barY + 18 : barY - 8;
    const labelClass = labelInside ? 'bar-label inside' : 'bar-label outside';
    const barClass = amount === highestAmount ? 'amount-bar max-bar' : 'amount-bar';
    return `<g class="bar-group"><rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="9" class="${barClass}"><title>${safe(item.label)} | Amount: ${safe(formatCurrency(amount))}</title></rect><text x="${x(index)}" y="${labelY}" text-anchor="middle" class="${labelClass}">${safe(shortAmount(amount))}</text></g>`;
  }).join('');
  const linePoints = data.map((item, index) => `${x(index)},${yQty(item.qty)}`).join(' ');
  const qtyDots = data.map((item, index) => {
    const qty = numberValue(item.qty);
    const dotX = x(index);
    const dotY = yQty(qty);
    const labelX = dotX + 10;
    const labelY = dotY - 12;
    return `<g class="qty-point"><circle cx="${dotX}" cy="${dotY}" r="5.5" class="qty-dot"><title>${safe(item.label)} | Qty: ${safe(formatNumber(qty))}</title></circle><rect x="${labelX - 4}" y="${labelY - 14}" width="${Math.max(34, String(shortQty(qty)).length * 8)}" height="18" rx="8" class="qty-label-bg"></rect><text x="${labelX}" y="${labelY}" text-anchor="start" class="qty-label">${safe(shortQty(qty))}</text></g>`;
  }).join('');
  const xLabels = data.map((item, index) => `<text x="${x(index)}" y="${height - 42}" text-anchor="end" transform="rotate(-35 ${x(index)} ${height - 42})" class="x-axis-label">${safe(item.label)}</text>`).join('');
  const averageAmount = data.reduce((sum, item) => sum + numberValue(item.amount), 0) / data.length;
  const averageY = yAmount(averageAmount);
  const averageLine = `<line x1="${padding.left}" y1="${averageY}" x2="${width - padding.right}" y2="${averageY}" class="average-line"></line><text x="${width - padding.right - 8}" y="${averageY - 6}" text-anchor="end" class="average-label">Avg Amount ${safe(shortAmount(averageAmount))}</text>`;

  element.innerHTML = `<svg class="combo-chart advanced-chart" viewBox="0 0 ${width} ${height}" role="img"><rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>${axisTitles}${amountAxis}${qtyAxis}${averageLine}<line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" class="axis-line"></line><line x1="${width - padding.right}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" class="right-axis-line"></line><g class="amount-bars">${bars}</g><polyline class="qty-line" points="${linePoints}"></polyline><g class="qty-dots">${qtyDots}</g><g class="x-labels">${xLabels}</g></svg>`;
}

function exportByType(type) {
  if (type === 'report') {
    const workbook = XLSX.utils.book_new();
    addSheet(workbook, state.reportRows, 'Raw Sales', columns.sales.filter((column) => column !== 'action'));
    addSheet(workbook, state.reportProductSummary, 'Product Summary', columns.productSummary);
    addSheet(workbook, state.reportChannelSummary, 'Channel Summary', columns.channelSummary);
    addSheet(workbook, state.reportTimeSeries, 'Trend', ['label', 'qty', 'amount']);
    XLSX.writeFile(workbook, `sales_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    return;
  }

  let rows = [];
  let fileName = 'export.xlsx';
  let tableColumns = [];

  if (type === 'sales') { rows = filterRows(state.sales, $('salesSearch').value); fileName = 'sales_export.xlsx'; tableColumns = columns.sales.filter((column) => column !== 'action'); }
  if (type === 'stock') { rows = filterRows(state.stock, $('stockSearch').value); fileName = 'stock_export.xlsx'; tableColumns = columns.stock.filter((column) => column !== 'action'); }
  if (type === 'transfer') { rows = filterRows(state.transfers, $('transferSearch').value); fileName = 'transfer_stock_export.xlsx'; tableColumns = columns.transfer.filter((column) => column !== 'action'); }
  if (type === 'movements') { rows = filterRows(state.movements, $('movementSearch').value); fileName = 'stock_movements_export.xlsx'; tableColumns = columns.movement; }

  if (!rows.length) return showMessage('No data available to export.', 'err');

  const workbook = XLSX.utils.book_new();
  addSheet(workbook, rows, 'Data', tableColumns);
  XLSX.writeFile(workbook, fileName);
}

function addSheet(workbook, rows, sheetName, tableColumns) {
  const exportRows = rows.map((row) => Object.fromEntries(tableColumns.map((column) => [label(column), exportValue(row[column], column)])));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), sheetName);
}

function findMatch(form, changedFieldName = '') {
  const sku = cleanText(form.querySelector('[name="sku"]')?.value).toUpperCase();
  const product = cleanText(form.querySelector('[name="product_name"]')?.value).toLowerCase();
  const location = cleanText(form.querySelector('[name="location"]')?.value) || cleanText(form.querySelector('[name="from_location"]')?.value);
  const index = state.stockIndex;
  const skuLocationKey = `${location}||${sku}`;
  const productLocationKey = `${location}||${product}`;

  if (changedFieldName === 'product_name') return (location && product && index.byProductLocation[productLocationKey]) || (product && index.byProduct[product]) || null;
  if (changedFieldName === 'sku') return (location && sku && index.bySkuLocation[skuLocationKey]) || (sku && index.bySku[sku]) || null;

  return (location && sku && index.bySkuLocation[skuLocationKey]) || (sku && index.bySku[sku]) || (location && product && index.byProductLocation[productLocationKey]) || (product && index.byProduct[product]) || null;
}

function priceFor(match, category) {
  if (!match) return '';
  if (category === 'Free Sample') return 0;
  if (category === 'Tier 1') return match.tier1_price || 0;
  if (category === 'Tier 2') return match.tier2_price || 0;
  if (category === 'Tier 3') return match.tier3_price || 0;
  return match.price || 0;
}

function syncSkuProduct(input) {
  const form = input.closest('form');
  if (!form) return;

  const skuInput = form.querySelector('[name="sku"]');
  const productInput = form.querySelector('[name="product_name"]');
  const categoryInput = form.querySelector('[name="category"]');
  const channelInput = form.querySelector('[name="channel"]');
  const orderInput = form.querySelector('[name="order_number"]');
  const priceInput = form.querySelector('[name="price"]');

  if (categoryInput && channelInput && ['Tier 1', 'Tier 2', 'Tier 3'].includes(categoryInput.value)) channelInput.value = 'WA Order';
  if (categoryInput && orderInput && categoryInput.value === 'Free Sample') orderInput.value = '';
  if (skuInput) skuInput.value = cleanText(skuInput.value).toUpperCase();
  if (!skuInput || !productInput) return;

  const changedFieldName = input.name || '';
  if (changedFieldName === 'product_name' && !cleanText(productInput.value)) return;
  if (changedFieldName === 'sku' && !cleanText(skuInput.value)) return;

  const match = findMatch(form, changedFieldName);
  if (!match) return;

  if (changedFieldName === 'sku') productInput.value = match.product_name || '';
  if (changedFieldName === 'product_name') skuInput.value = match.sku || '';

  if (changedFieldName !== 'sku' && changedFieldName !== 'product_name') {
    if (!cleanText(skuInput.value) && match.sku) skuInput.value = match.sku;
    if (!cleanText(productInput.value) && match.product_name) productInput.value = match.product_name;
  }

  if (categoryInput && priceInput) priceInput.value = priceFor(match, categoryInput.value);

  if (form.id === 'stockForm') {
    ['price', 'tier1_price', 'tier2_price', 'tier3_price', 'cogs'].forEach((key) => {
      if (form[key] && match[key] !== undefined) form[key].value = match[key];
    });
  }
}

function cell(value, column) {
  if (column === 'stock_status') {
    const className = value === 'Out of Stock' ? 'badge badge-out' : value === 'Low Stock' ? 'badge badge-low' : 'badge badge-ok';
    return `<span class="${className}">${escapeHtml(value)}</span>`;
  }

  if (column === 'status') {
    const status = value || 'ACTIVE';
    const className = status === 'REVOKED' ? 'status-revoked' : 'status-active';
    return `<span class="${className}">${escapeHtml(status)}</span>`;
  }

  if (column === 'action') {
    if (typeof value === 'number') {
      return `<div class="draft-actions"><button class="icon-btn edit-line-btn" type="button" data-edit-line="${value}" title="Edit draft line">✎</button><button class="icon-btn remove-line-btn" type="button" data-remove-line="${value}" title="Remove draft line">×</button></div>`;
    }

    const row = value || {};

    if (row.__actionType === 'stock') {
      return `<div class="draft-actions"><button class="icon-btn edit-line-btn" type="button" data-edit-stock-id="${escapeHtml(row.id)}" title="Edit stock">✎</button><button class="icon-btn remove-line-btn" type="button" data-remove-stock-id="${escapeHtml(row.id)}" title="Remove stock">×</button></div>`;
    }

    if (row.__actionType === 'transfer') {
      return `<div class="draft-actions"><button class="icon-btn remove-line-btn" type="button" data-remove-transfer-id="${escapeHtml(row.id)}" title="Remove transfer">×</button></div>`;
    }

    if ((row.status || 'ACTIVE') === 'REVOKED') return '<span class="revoke-disabled">Revoked</span>';

    const invoiceButton = cleanText(row.channel) === 'WA Order'
      ? `<button class="icon-btn edit-line-btn" type="button" data-invoice-sales-id="${escapeHtml(row.id)}" title="Download invoice">🧾</button>`
      : '';
    const revokeButton = `<button class="revoke-btn" type="button" data-revoke-sales-id="${escapeHtml(row.id)}">Revoke</button>`;
    return `<div class="draft-actions">${invoiceButton}${revokeButton}</div>`;
  }

  return escapeHtml(formatCell(value, column));
}

async function downloadSalesInvoice(salesId) {
  if (!ensureReadyForWrite()) return;

  const selectedSale = state.sales.find((row) => row.id === salesId);
  if (!selectedSale) return showMessage('Sales record not found.', 'err');
  if (cleanText(selectedSale.channel) !== 'WA Order') return showMessage('Invoice is only available for WA Order.', 'err');
  if ((selectedSale.status || 'ACTIVE') !== 'ACTIVE') return showMessage('Cannot download invoice for revoked sales.', 'err');

  const invoiceNumber = cleanText(selectedSale.order_number) || selectedSale.id;
  const customerName = cleanText(selectedSale.customer_name) || '-';
  const invoiceRows = cleanText(selectedSale.order_number)
    ? state.sales.filter((row) => (row.status || 'ACTIVE') === 'ACTIVE' && cleanText(row.channel) === 'WA Order' && cleanText(row.order_number) === cleanText(selectedSale.order_number))
    : [selectedSale];

  if (!invoiceRows.length) return showMessage('No invoice rows found.', 'err');

  try {
    await generateInvoicePdf({ invoiceNumber, customerName, invoiceDate: selectedSale.sale_date, rows: invoiceRows });
    await recordInvoiceDownload(invoiceNumber, customerName);
    showMessage('Invoice downloaded and movement recorded.', 'ok');
    await refreshAll();
  } catch (error) {
    showMessage(error.message || 'Failed to generate invoice.', 'err');
  }
}

async function generateInvoicePdf({ invoiceNumber, customerName, invoiceDate, rows }) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF is not loaded. Please check the jsPDF script in index.html.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 16;
  const logoDataUrl = await loadLogoDataUrl('assets/logo.png');

  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', marginX, 14, 30, 30);

  doc.setTextColor(INVOICE_THEME.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('LivingWord', marginX, 50);

  doc.setTextColor(INVOICE_THEME.primary);
  doc.setFontSize(28);
  doc.text('INVOICE', pageWidth - marginX, 25, { align: 'right' });

  doc.setTextColor(INVOICE_THEME.text);
  doc.setFontSize(11);
  doc.text(`No: ${invoiceNumber}`, pageWidth - marginX, 33, { align: 'right' });

  doc.setDrawColor(INVOICE_THEME.accent);
  doc.setLineWidth(0.8);
  doc.line(marginX, 58, pageWidth - marginX, 58);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(INVOICE_THEME.text);
  doc.setFontSize(11);
  doc.text(`Date: ${formatInvoiceDate(invoiceDate)}`, marginX, 70);
  doc.text(`Customer Name: ${customerName}`, marginX, 78);

  let y = 94;
  doc.setFillColor(INVOICE_THEME.primary);
  doc.roundedRect(marginX, y - 7, pageWidth - marginX * 2, 10, 2, 2, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Product Name', marginX + 3, y);
  doc.text('Qty', 112, y, { align: 'right' });
  doc.text('Price (Rp)', 150, y, { align: 'right' });
  doc.text('Total (Rp)', pageWidth - marginX - 3, y, { align: 'right' });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(INVOICE_THEME.text);

  let grandTotal = 0;

  rows.forEach((row, index) => {
    const qty = numberValue(row.qty);
    const price = numberValue(row.price);
    const total = numberValue(row.total_price || qty * price);
    const productLines = doc.splitTextToSize(cleanText(row.product_name), 82);
    grandTotal += total;

    if (y > 185) {
      doc.addPage();
      y = 24;
    }

    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, y - 5, pageWidth - marginX * 2, 8, 'F');
    }

    doc.text(productLines, marginX + 3, y);
    doc.text(formatNumber(qty), 112, y, { align: 'right' });
    doc.text(invoiceCurrency(price), 150, y, { align: 'right' });
    doc.text(invoiceCurrency(total), pageWidth - marginX - 3, y, { align: 'right' });
    y += Math.max(8, productLines.length * 5);
  });

  doc.setDrawColor(INVOICE_THEME.border);
  doc.setLineWidth(0.3);
  doc.line(marginX, y + 2, pageWidth - marginX, y + 2);

  y += 14;
  doc.setFillColor(INVOICE_THEME.lightBg);
  doc.roundedRect(pageWidth - 88, y - 8, 72, 18, 2, 2, 'F');
  doc.setTextColor(INVOICE_THEME.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Grand Total', pageWidth - 52, y - 1, { align: 'center' });
  doc.setTextColor(INVOICE_THEME.primary);
  doc.setFontSize(13);
  doc.text(invoiceCurrency(grandTotal), pageWidth - 52, y + 6, { align: 'center' });

  drawPaymentSection(doc, marginX, 180);
  drawInvoiceFooter(doc, pageWidth, pageHeight, marginX);
  doc.save(`Invoice_${safeFileName(invoiceNumber)}.pdf`);
}

function drawPaymentSection(doc, marginX, paymentY) {
  const paymentRows = [
    ['Account Name', 'Berita Baik Indonesia PT'],
    ['Account No', '1466777880'],
    ['SWIFT No', 'CENAIDJA'],
    ['Account Holder Address', 'Jl. Gunung Catur IV No. 8'],
    ['Bank Name / Branch', 'Bank Central Asia (BCA)'],
    ['Bank Address', 'Jl. Sunset Road No. 88B, Kuta, Kabupaten Badung, Bali, Indonesia']
  ];

  doc.setTextColor(INVOICE_THEME.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Payment Information', marginX, paymentY);
  doc.setDrawColor(INVOICE_THEME.accent);
  doc.setLineWidth(0.5);
  doc.line(marginX, paymentY + 3, marginX + 52, paymentY + 3);

  let y = paymentY + 12;
  doc.setFontSize(9.5);
  doc.setTextColor(INVOICE_THEME.text);

  paymentRows.forEach(([labelText, valueText]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(labelText, marginX, y);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(valueText, 115);
    doc.text(valueLines, 65, y);
    y += Math.max(6, valueLines.length * 5);
  });
}

function drawInvoiceFooter(doc, pageWidth, pageHeight, marginX) {
  const footerY = pageHeight - 34;
  doc.setDrawColor(INVOICE_THEME.border);
  doc.setLineWidth(0.4);
  doc.line(marginX, footerY - 8, pageWidth - marginX, footerY - 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(INVOICE_THEME.text);
  doc.text('Website  : livingword.id', marginX, footerY);
  doc.text('WhatsApp : +6285775242424', marginX, footerY + 6);
  doc.text('Email    : devin@livingword.id', marginX, footerY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(INVOICE_THEME.primary);
  doc.text('Thank you', pageWidth - marginX, footerY + 2, { align: 'right' });
  doc.setFontSize(11);
  doc.setTextColor(INVOICE_THEME.muted);
  doc.text('for your purchase', pageWidth - marginX, footerY + 9, { align: 'right' });
}

async function recordInvoiceDownload(invoiceNumber, customerName) {
  const { error } = await state.client.rpc('record_invoice_download', {
    p_invoice_number: invoiceNumber,
    p_customer_name: customerName
  });
  if (error) throw new Error(error.message);
}

async function loadLogoDataUrl(path) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatInvoiceDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value) || '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function invoiceCurrency(value) {
  return 'Rp ' + numberValue(value).toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function safeFileName(value) {
  return cleanText(value).replace(/[^a-z0-9-_]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'invoice';
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizeStock(payload) {
  return {
    location: cleanText(payload.location),
    sku: cleanText(payload.sku).toUpperCase(),
    product_name: cleanText(payload.product_name),
    qty: numberValue(payload.qty),
    price: numberValue(payload.price),
    tier1_price: numberValue(payload.tier1_price),
    tier2_price: numberValue(payload.tier2_price),
    tier3_price: numberValue(payload.tier3_price),
    cogs: numberValue(payload.cogs)
  };
}

function normalizeTransfer(payload) {
  return {
    transfer_date: payload.transfer_date,
    sku: cleanText(payload.sku).toUpperCase(),
    product_name: cleanText(payload.product_name),
    from_location: cleanText(payload.from_location),
    to_location: cleanText(payload.to_location),
    qty: numberValue(payload.qty),
    remark: cleanText(payload.remark)
  };
}

function addStockStatus(row) {
  const qty = numberValue(row.qty);
  return { ...row, stock_status: qty <= 0 ? 'Out of Stock' : qty <= 5 ? 'Low Stock' : 'Healthy' };
}

function filterRows(rows, searchText) {
  const query = cleanText(searchText).toLowerCase();
  return query ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query)) : rows;
}

function showTab(id, button) {
  document.querySelectorAll('.tab-section').forEach((section) => section.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach((tab) => tab.classList.remove('active'));
  $(id).classList.add('active');
  if (button) button.classList.add('active');
}

function showMessage(text, type = 'ok') {
  $('messageBox').textContent = text;
  $('messageBox').className = `message ${type}`;
}

function setLoading(value) {
  document.body.classList.toggle('loading', value);
}

function ensureClient() {
  if (!state.client) {
    showMessage('Supabase client is not ready.', 'err');
    return false;
  }
  return true;
}

function ensureReadyForWrite() {
  if (!ensureClient()) return false;
  if (!state.user) {
    showMessage('Please login first before saving data.', 'err');
    return false;
  }
  return true;
}

function formatCell(value, column) {
  if (['price', 'tier1_price', 'tier2_price', 'tier3_price', 'discount', 'total_price', 'cogs', 'amount', 'line_total'].includes(column)) return formatCurrency(value);
  if (['discount_value', 'qty', 'qty_change', 'transactions'].includes(column)) return formatNumber(value);
  if (['created_at', 'updated_at', 'revoked_at', 'removed_at'].includes(column) && value) return formatDateTime(value);
  return value ?? '';
}

function exportValue(value, column) {
  if (['price', 'tier1_price', 'tier2_price', 'tier3_price', 'discount', 'total_price', 'cogs', 'amount', 'line_total', 'discount_value', 'qty', 'qty_change', 'transactions'].includes(column)) return numberValue(value);
  if (['created_at', 'updated_at', 'revoked_at', 'removed_at'].includes(column) && value) return formatDateTime(value);
  return value ?? '';
}

function formatNumber(value) {
  return numberValue(value).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function formatCurrency(value) {
  return 'IDR ' + numberValue(value).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function cleanText(value) {
  return String(value || '').trim();
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function label(value) {
  return String(value).replaceAll('_', ' ');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setMapToObject(source) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, [...value].sort()]));
}