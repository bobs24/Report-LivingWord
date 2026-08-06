// =========================================================
// Sales & Stock Control - app.js
// Stable app with invoice download support
// =========================================================

const APP_CONFIG = window.APP_CONFIG || {};

const MASTER_OPTIONS = {
  category: ['Online', 'Offline', 'Free Sample', 'Tier 1', 'Tier 2', 'Tier 3'],
  channel: ['Shopee', 'Tokopedia', 'WA Order', 'Conference', 'Konsinyasi'],
  location: ['Apartemen Surabaya', 'Mavelyn', 'Gudang Jemursari', 'Gudang Riverside', 'Gibeon', 'Konsinyasi - Petra', 'Konsinyasi - LilinKecil', 'Konsinyasi - Insight Unlimited']
};

const MONTHS = [
  { n: 1, name: 'January' }, { n: 2, name: 'February' }, { n: 3, name: 'March' },
  { n: 4, name: 'April' }, { n: 5, name: 'May' }, { n: 6, name: 'June' },
  { n: 7, name: 'July' }, { n: 8, name: 'August' }, { n: 9, name: 'September' },
  { n: 10, name: 'October' }, { n: 11, name: 'November' }, { n: 12, name: 'December' }
];

const MONTHLY_SALES_TARGET = 25000000;

const INVOICE_THEME = {
  primary: '#50603A',
  accent: '#50603A',
  text: '#50603A',
  muted: '#50603A',
  lightBg: '#FFFFFF',
  border: '#50603A'
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
  stockSort: {
    column: null,
    direction: 'asc'
  },
  reportRows: [],
  reportCategorySummary: [],
  reportProductSummary: [],
  reportChannelSummary: [],
  reportTimeSeries: [],
  latestSalesDateBySku: {},
  stockIndex: {
    allLocations: [], allProducts: [], availableProducts: [], allSkus: [], availableSkus: [],
    bySku: {}, byProduct: {}, bySkuLocation: {}, byProductLocation: {},
    availableSkusByLocation: {}, availableProductsByLocation: {}
  }
};

const columns = {
  sales: ['status', 'action', 'sale_date', 'created_by', 'location', 'category', 'channel', 'order_number', 'customer_name', 'ongkos_kirim', 'sku', 'product_name', 'qty', 'price', 'discount_type', 'discount_value', 'discount', 'total_price', 'remark'],
  stock: ['action', 'stock_status', 'location', 'sku', 'product_name', 'qty', 'price', 'tier1_price', 'tier2_price', 'tier3_price', 'consign_price', 'cogs', 'updated_at', 'last_sold'],
  transfer: ['action', 'transfer_date', 'created_by', 'sku', 'product_name', 'from_location', 'to_location', 'qty', 'remark'],
  movement: ['created_at', 'created_by', 'movement_type', 'location', 'sku', 'product_name', 'qty_change', 'reference_type', 'reference_key', 'remark'],
  draft: ['action', 'sku', 'product_name', 'qty', 'price', 'discount_type', 'discount_value', 'line_total'],
  categorySummary: ['category', 'qty', 'amount', 'transactions'],
  channelSummary: ['channel', 'qty', 'amount', 'transactions'],
  productSummary: ['product_name', 'qty', 'amount']
};

const uiColumns = {
  sales: [
    'status',
    'action',
    'sale_date',
    'order_number',
    'channel',
    'sales_product',
    'qty',
    'total_price'
  ],

  // Compact Stock table shown on screen.
  stock: [
    'action',
    'location',
    'sku',
    'product_name',
    'qty',
    'price',
    'consign_price',
    'cogs',
    'last_sold'
  ]
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  init();
  setDefaultDates();
  bindEvents();
  initializeCompactTableStyles();
  initializeSalesInfoTooltips();
  renderReportInputs();

  // Make Report KPI cards look consistent before user loads report.
  initializeReportDashboardUi();

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

function initializeCompactTableStyles() {
  // Prevent the same CSS from being added more than once.
  if ($('compactTableUiStyles')) return;

  // Create one style element for the compact Sales and Stock UI.
  const style = document.createElement('style');
  style.id = 'compactTableUiStyles';

  style.textContent = `
    /* =====================================================
       TABLE WRAPPERS
       Remove horizontal scrolling and fit tables to container.
       ===================================================== */

    #salesTable,
    #stockTable {
      overflow-x: hidden;
      max-width: 100%;
    }

    #salesTable table,
    #stockTable table {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      table-layout: fixed;
    }

    /* =====================================================
       GENERAL TABLE TYPOGRAPHY
       Smaller spacing with larger, more readable text.
       ===================================================== */

    #salesTable th,
    #salesTable td,
    #stockTable th,
    #stockTable td {
      padding: 8px 5px;
      font-size: 11.5px;
      line-height: 1.25;
      text-align: center;
      vertical-align: middle;
      white-space: normal;
      overflow-wrap: break-word;
    }

    #salesTable th,
    #stockTable th {
      padding: 9px 4px;
      font-size: 9.5px;
      line-height: 1.1;
      font-weight: 850;
      text-align: center;
      vertical-align: middle;
      text-transform: uppercase;
      letter-spacing: 0.015em;
      color: #50603A;
    }

    /* =====================================================
       SALES TABLE WIDTHS

       Visible columns:
       Status | Action | Date | Order No. |
       Channel | SKU / Product | Qty | Net Sales

       Total width = 100%
       ===================================================== */

    #salesTable th:nth-child(1),
    #salesTable td:nth-child(1) {
      width: 8%;
      text-align: center;
      white-space: nowrap;
      word-break: normal;
    }

    #salesTable th:nth-child(2),
    #salesTable td:nth-child(2) {
      width: 18%;
      text-align: center;
      overflow: visible;
    }

    #salesTable th:nth-child(3),
    #salesTable td:nth-child(3) {
      width: 10%;
      text-align: center;
      white-space: nowrap;
    }

    #salesTable th:nth-child(4),
    #salesTable td:nth-child(4) {
      width: 17%;
      text-align: center;
      white-space: nowrap;
      word-break: normal;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #salesTable th:nth-child(5),
    #salesTable td:nth-child(5) {
      width: 9%;
      text-align: center;
      white-space: nowrap;
    }

    #salesTable th:nth-child(6),
    #salesTable td:nth-child(6) {
      width: 21%;
      text-align: center;
    }

    #salesTable th:nth-child(7),
    #salesTable td:nth-child(7) {
      width: 6%;
      text-align: center;
      white-space: nowrap;
    }

    #salesTable th:nth-child(8),
    #salesTable td:nth-child(8) {
      width: 11%;
      text-align: center;
      white-space: nowrap;
    }

    /* Keep ACTIVE and REVOKED on one line. */

    #salesTable .status-active,
    #salesTable .status-revoked {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      word-break: normal;
      line-height: 1;
    }

    /* Keep Order No. on one centered line.
       The complete value remains available through title hover. */

    .sales-order-number {
      display: block;
      width: 100%;
      overflow: hidden;
      white-space: nowrap;
      word-break: normal;
      text-overflow: ellipsis;
      text-align: center;
    }

    /* Center the combined Sales SKU and Product Name. */

    #salesTable .compact-product-cell {
      width: 100%;
      text-align: center;
    }

    #salesTable .compact-product-sku {
      margin-bottom: 3px;
      text-align: center;
      font-size: 10.5px;
      line-height: 1;
      font-weight: 900;
      color: #50603A;
      letter-spacing: 0.03em;
    }

    #salesTable .compact-product-name {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      text-align: center;
      font-size: 11.5px;
      line-height: 1.25;
      font-weight: 700;
      color: #1F2933;
    }

    /* =====================================================
       STOCK TABLE WIDTHS

       Visible columns:
       Action | Location | SKU | Product Name | Qty |
       Price | Consign Price | COGS | Last Sold

       Total width = 100%
       ===================================================== */

    #stockTable th:nth-child(1),
    #stockTable td:nth-child(1) {
      width: 12%;
      text-align: center;
      overflow: visible;
    }

    #stockTable th:nth-child(2),
    #stockTable td:nth-child(2) {
      width: 16%;
      text-align: center;
      vertical-align: middle;
    }

    #stockTable th:nth-child(3),
    #stockTable td:nth-child(3) {
      width: 7%;
      text-align: center;
      white-space: nowrap;
    }

    #stockTable th:nth-child(4),
    #stockTable td:nth-child(4) {
      width: 21%;
      text-align: center;
      vertical-align: middle;
    }

    #stockTable th:nth-child(5),
    #stockTable td:nth-child(5) {
      width: 6%;
      text-align: center;
      white-space: nowrap;
    }

    #stockTable th:nth-child(6),
    #stockTable td:nth-child(6) {
      width: 10%;
      text-align: center;
      white-space: nowrap;
    }

    #stockTable th:nth-child(7),
    #stockTable td:nth-child(7) {
      width: 10%;
      text-align: center;
      white-space: nowrap;
    }

    #stockTable th:nth-child(8),
    #stockTable td:nth-child(8) {
      width: 9%;
      text-align: center;
      white-space: nowrap;
    }

    #stockTable th:nth-child(9),
    #stockTable td:nth-child(9) {
      width: 9%;
      text-align: center;
      white-space: nowrap;
    }

    /* =====================================================
       ACTION CONTROLS
       Keep buttons on one centered horizontal line.
       ===================================================== */

    .sales-action-group {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: nowrap;
      gap: 4px;
      width: 100%;
      overflow: visible;
    }

    #salesTable .draft-actions,
    #stockTable .draft-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: nowrap;
      gap: 4px;
      width: 100%;
    }

    /* Consistent icon size. */

    #salesTable .icon-btn,
    #stockTable .icon-btn,
    #salesTable .sales-info-button,
    #stockTable .sales-info-button {
      width: 27px;
      height: 27px;
      min-width: 27px;
      flex: 0 0 27px;
    }

    /* Keep Revoke compact and on one line. */

    #salesTable .revoke-btn {
      padding: 6px 8px;
      font-size: 10px;
      line-height: 1;
      white-space: nowrap;
    }

    /* =====================================================
       INFORMATION ICON
       Shared by Sales and Stock.
       ===================================================== */

    .sales-info-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
    }

    .sales-info-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 27px;
      height: 27px;
      min-width: 27px;
      flex: 0 0 27px;
      padding: 0;
      border: 1.7px solid #50603A;
      border-radius: 50%;
      background: #FFFFFF;
      color: #50603A;
      cursor: help;
      transition:
        color 150ms ease,
        background 150ms ease,
        border-color 150ms ease,
        box-shadow 150ms ease,
        transform 150ms ease;
    }

    .sales-info-button > span {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px;
      line-height: 1;
      font-weight: 900;
      transform: translateY(-0.3px);
    }

    .sales-info-button:hover,
    .sales-info-button:focus-visible {
      border-color: #50603A;
      background: #50603A;
      color: #FFFFFF;
      box-shadow: 0 7px 18px rgba(80, 96, 58, 0.24);
      transform: translateY(-1px);
      outline: none;
    }

    /* =====================================================
       FLOATING INFORMATION PANEL
       Shared by Sales and Stock.
       ===================================================== */

    .sales-info-tooltip {
      position: fixed;
      z-index: 9999;
      display: none;
      width: min(430px, calc(100vw - 32px));
      padding: 16px;
      border: 1px solid rgba(80, 96, 58, 0.20);
      border-radius: 16px;
      background: #FFFFFF;
      color: #1F2933;
      text-align: left;
      box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18);
    }

    .sales-info-tooltip.is-visible {
      display: block;
    }

    .sales-info-tooltip-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(80, 96, 58, 0.13);
    }

    .sales-info-tooltip-title,
    .sales-info-tooltip-subtitle {
      display: block;
    }

    .sales-info-tooltip-title {
      font-size: 14px;
      line-height: 1.2;
      font-weight: 900;
      color: #50603A;
    }

    .sales-info-tooltip-subtitle {
      margin-top: 3px;
      font-size: 10px;
      line-height: 1.2;
      font-weight: 750;
      color: rgba(80, 96, 58, 0.66);
    }

    .sales-info-tooltip-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 8px;
      border-radius: 999px;
      background: rgba(80, 96, 58, 0.09);
      color: #50603A;
      font-size: 9px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .sales-info-tooltip-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 11px 16px;
    }

    .sales-info-item {
      display: block;
      min-width: 0;
    }

    .sales-info-item > span {
      display: block;
      margin-bottom: 3px;
      font-size: 9px;
      line-height: 1.15;
      font-weight: 800;
      color: rgba(80, 96, 58, 0.66);
      text-transform: uppercase;
      letter-spacing: 0.035em;
    }

    .sales-info-item > strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 11px;
      line-height: 1.3;
      font-weight: 800;
      color: #1F2933;
    }

    .sales-info-tooltip-remark {
      display: block;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(80, 96, 58, 0.13);
    }

    .sales-info-tooltip-remark > span {
      display: block;
      margin-bottom: 4px;
      font-size: 9px;
      line-height: 1.15;
      font-weight: 800;
      color: rgba(80, 96, 58, 0.66);
      text-transform: uppercase;
      letter-spacing: 0.035em;
    }

    .sales-info-tooltip-remark > strong {
      display: block;
      font-size: 11px;
      line-height: 1.35;
      font-weight: 700;
      color: #1F2933;
    }

    /* Stock tooltip can be slightly smaller because it has
       fewer hidden fields than the Sales tooltip. */

    .stock-info-tooltip {
      width: min(390px, calc(100vw - 32px));
    }

    /* =====================================================
       FINAL STOCK ALIGNMENT
       Center headers, arrows, values, and actions.
       ===================================================== */

    #stockTable th,
    #stockTable td {
      text-align: center !important;
      vertical-align: middle !important;
    }

    /* Center direct child elements inside Stock cells. */

    #stockTable td > * {
      margin-left: auto;
      margin-right: auto;
    }

    /* Center Edit, Info, and Remove controls. */

    #stockTable .sales-action-group,
    #stockTable .draft-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: nowrap;
      gap: 4px;
      width: 100%;
    }

    /* Override inline styles generated by headerCell().
       This centers both the title and sorting arrow. */

    #stockTable th button[data-sort-stock-column] {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      width: 100% !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      color: inherit !important;
      font: inherit !important;
      font-weight: 850 !important;
      text-align: center !important;
      white-space: normal !important;
      cursor: pointer;
    }

    #stockTable th button[data-sort-stock-column] > span:first-child {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    #stockTable th button[data-sort-stock-column] > span:last-child {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }

    /* Keep selected Stock values on one line. */

    #stockTable td:nth-child(3),
    #stockTable td:nth-child(5),
    #stockTable td:nth-child(6),
    #stockTable td:nth-child(7),
    #stockTable td:nth-child(8),
    #stockTable td:nth-child(9) {
      white-space: nowrap;
      word-break: normal;
    }

    /* =====================================================
   SALES STATUS AND ACTION CONSISTENCY
   Use uniform font size and fixed Action positions.
   ===================================================== */
    #salesTable .status-active,
    #salesTable .status-revoked,
    #salesTable .revoke-btn,
    #salesTable .sales-revoked-action {
      box-sizing: border-box;
      font-family: inherit;
      font-size: 10px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0;
      white-space: nowrap;
      word-break: normal;
    }

    /* Status values in the Status column. */
    #salesTable .status-active,
    #salesTable .status-revoked {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 8px;
    }

    /* Revoke button in the Action column. */
    #salesTable .revoke-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 27px;
      min-width: 58px;
      padding: 0 8px;
    }

    /* Revoked label replacing the Revoke button. */
    #salesTable .sales-revoked-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 27px;
      min-width: 58px;
      padding: 0 8px;
      border-radius: 999px;
      background: rgba(180, 54, 54, 0.09);
      color: #B43636;
    }

    /* Fixed positions:
      Slot 1 = Invoice
      Slot 2 = Information */
    #salesTable .sales-action-slot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 27px;
      height: 27px;
      min-width: 27px;
      flex: 0 0 27px;
    }

    /* Fixed third slot for Revoke or Revoked. */
    #salesTable .sales-revoke-slot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      min-width: 58px;
      flex: 0 0 58px;
    }

    /* Invisible Invoice placeholder.
      Visibility hidden preserves the layout width,
      unlike display none, which would shift the Info icon. */
    #salesTable .sales-invoice-placeholder {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 27px;
      height: 27px;
      visibility: hidden;
      pointer-events: none;
    }

    /* Keep all three Sales Action slots aligned. */
    #salesTable .sales-action-group {
      display: grid;
      grid-template-columns: 27px 27px 58px;
      align-items: center;
      justify-content: center;
      column-gap: 4px;
      width: 100%;
      overflow: visible;
    }

    /* =====================================================
       RESPONSIVE TOOLTIP
       ===================================================== */

    @media (max-width: 700px) {
      .sales-info-tooltip-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  // Add the completed UI styles to the page.
  document.head.appendChild(style);
}

function initializeSalesInfoTooltips() {
  // Event delegation continues working after table re-rendering.
  document.addEventListener('pointerover', (event) => {
    const button = event.target.closest('.sales-info-button');
    if (!button) return;

    const tooltip = button
      .closest('.sales-info-wrapper')
      ?.querySelector('.sales-info-tooltip');

    if (!tooltip) return;

    showSalesInfoTooltip(button, tooltip);
  });

  document.addEventListener('pointerout', (event) => {
    const button = event.target.closest('.sales-info-button');

    if (!button) return;

    // Do not close when the pointer is only moving between
    // elements inside the same information button.
    if (
      event.relatedTarget &&
      button.contains(event.relatedTarget)
    ) {
      return;
    }

    hideAllSalesInfoTooltips();
  });

  // Keyboard accessibility.
  document.addEventListener('focusin', (event) => {
    const button = event.target.closest('.sales-info-button');
    if (!button) return;

    const tooltip = button
      .closest('.sales-info-wrapper')
      ?.querySelector('.sales-info-tooltip');

    if (!tooltip) return;

    showSalesInfoTooltip(button, tooltip);
  });

  document.addEventListener('focusout', (event) => {
    if (event.target.closest('.sales-info-button')) {
      hideAllSalesInfoTooltips();
    }
  });

  // Close panels during scrolling or resizing.
  window.addEventListener(
    'scroll',
    hideAllSalesInfoTooltips,
    true
  );

  window.addEventListener(
    'resize',
    hideAllSalesInfoTooltips
  );
}

function showSalesInfoTooltip(button, tooltip) {
  hideAllSalesInfoTooltips();

  // Make visible first so dimensions can be measured.
  tooltip.classList.add('is-visible');

  const buttonRect = button.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gap = 10;
  const edge = 12;

  // Align the tooltip to the right edge of the Info button.
  let left = buttonRect.right - tooltipRect.width;
  let top = buttonRect.bottom + gap;

  // Keep inside horizontal viewport.
  left = Math.max(
    edge,
    Math.min(
      left,
      viewportWidth - tooltipRect.width - edge
    )
  );

  // Show above the icon when space below is insufficient.
  if (top + tooltipRect.height > viewportHeight - edge) {
    top = buttonRect.top - tooltipRect.height - gap;
  }

  // Keep inside vertical viewport.
  top = Math.max(
    edge,
    Math.min(
      top,
      viewportHeight - tooltipRect.height - edge
    )
  );

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideAllSalesInfoTooltips() {
  document
    .querySelectorAll('.sales-info-tooltip.is-visible')
    .forEach((tooltip) => {
      tooltip.classList.remove('is-visible');
    });
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
  $('reportType').onchange = () => {
    renderReportInputs();
    if (state.reportRows.length) {
      buildReport(state.reportRows);
    }
  };
  $('loadReportButton').addEventListener('click', loadReport);
  document.querySelectorAll('[data-export]').forEach((button) => button.onclick = () => exportByType(button.dataset.export));
  $('matrixStockExportButton')
    ?.addEventListener('click', exportMatrixStock);
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

  const channelInput = document.querySelector('[name="channel"]');
  if (channelInput) {
    channelInput.addEventListener('change', (event) => {
      const form = event.target.closest('form');
      const locationInput = form?.querySelector('[name="location"]');

      if (locationInput && event.target.value === 'Konsinyasi') {
        const location = cleanText(locationInput.value);

        if (location && !location.startsWith('Konsinyasi - ')) {
          locationInput.value = '';
        }
      }

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

    // Build reusable indexes once per refresh instead of repeatedly scanning Sales.
    buildLatestSalesDateIndex(state.sales);
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
  const allLocations = new Set();
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
    if (location) allLocations.add(location);
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
      consign_price: numberValue(row.consign_price),
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
    allLocations: mergeUniqueSorted(MASTER_OPTIONS.location, [...allLocations]),
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
  if (type === 'location') return locationOptionsForInput(input);
  
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

function locationOptionsForInput(input) {
  const form = input.closest('form');
  const channel = cleanText(form?.querySelector('[name="channel"]')?.value);

  const allLocations = state.stockIndex.allLocations?.length
    ? state.stockIndex.allLocations
    : MASTER_OPTIONS.location;

  if (form?.id === 'salesForm' && channel === 'Konsinyasi') {
    return allLocations.filter((location) =>
      cleanText(location).startsWith('Konsinyasi - ')
    );
  }

  return allLocations;
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
    customer_name: cleanText(form.customer_name?.value),
    ongkos_kirim: numberValue(form.ongkos_kirim?.value)
  };

  if (['Tier 1', 'Tier 2', 'Tier 3'].includes(header.category)) header.channel = 'WA Order';
  if (header.category === 'Free Sample') header.order_number = '';
  if (header.category !== 'Free Sample' && !header.order_number) return showMessage('Order / Invoice Number is required except for Free Sample.', 'err');

  if (header.channel === 'Konsinyasi' && !header.location.startsWith('Konsinyasi - ')) {
    return showMessage('For Konsinyasi channel, please choose a Konsinyasi stock location.', 'err');
  }

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
      p_consign_price: payload.consign_price,
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
    p_consign_price: payload.consign_price,
    p_cogs: payload.cogs,
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
  form.consign_price.value = numberValue(stockRow.consign_price);
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
  const stockSortButton = event.target.closest('[data-sort-stock-column]');

  if (editDraftButton) editDraftLine(Number(editDraftButton.dataset.editLine));
  if (removeDraftButton) removeDraftLine(Number(removeDraftButton.dataset.removeLine));
  if (revokeSalesButton) revokeSale(revokeSalesButton.dataset.revokeSalesId);
  if (editStockButton) editStock(editStockButton.dataset.editStockId);
  if (removeStockButton) removeStock(removeStockButton.dataset.removeStockId);
  if (removeTransferButton) removeTransfer(removeTransferButton.dataset.removeTransferId);
  if (invoiceButton) downloadSalesInvoice(invoiceButton.dataset.invoiceSalesId);
  if (stockSortButton) sortStockTable(stockSortButton.dataset.sortStockColumn);
}

function renderMainTables() {
  // Filter against complete Sales objects.
  // Hidden Sales fields remain searchable.
  const salesRows = filterRows(
    state.sales,
    $('salesSearch').value
  );

  // Filter against complete Stock objects.
  // Hidden tier prices and updated date remain searchable.
  const filteredStockRows = filterRows(
    state.stock.filter((row) =>
      (row.status || 'ACTIVE') === 'ACTIVE'
    ),
    $('stockSearch').value
  );

  const activeStockRows = sortStockRows(
    filteredStockRows.map((row) => ({
      ...row,
      __actionType: 'stock',
      last_sold: latestSalesDateBySku(row.sku)
    }))
  );

  const activeTransferRows = filterRows(
    state.transfers.filter((row) =>
      (row.status || 'ACTIVE') === 'ACTIVE'
    ),
    $('transferSearch').value
  ).map((row) => ({
    ...row,
    __actionType: 'transfer'
  }));

  const movementRows = filterRows(
    state.movements,
    $('movementSearch').value
  );

  // Use compact UI-only columns for Sales and Stock.
  renderTable('salesTable', salesRows, uiColumns.sales);
  renderTable('stockTable', activeStockRows, uiColumns.stock);

  // Transfer and Movement remain unchanged.
  renderTable('transferTable', activeTransferRows, columns.transfer);
  renderTable('movementTable', movementRows, columns.movement);

  $('salesCountText').textContent =
    `Showing ${salesRows.length.toLocaleString()} of ` +
    `${state.sales.length.toLocaleString()} loaded transactions.`;
}

function buildLatestSalesDateIndex(salesRows) {
  // Cache the latest active sale date per SKU in one pass.
  // This avoids scanning and sorting the complete Sales dataset for every Stock row.
  const latestBySku = {};

  salesRows.forEach((sale) => {
    if ((sale.status || 'ACTIVE') !== 'ACTIVE') return;

    const sku = cleanText(sale.sku).toUpperCase();
    const saleDate = cleanText(sale.sale_date);

    if (!sku || !saleDate) return;

    if (!latestBySku[sku] || saleDate > latestBySku[sku]) {
      latestBySku[sku] = saleDate;
    }
  });

  state.latestSalesDateBySku = latestBySku;
}

function latestSalesDateBySku(sku) {
  // Return the cached latest active Sales date for the requested SKU.
  const stockSku = cleanText(sku).toUpperCase();
  return stockSku ? state.latestSalesDateBySku[stockSku] || '-' : '-';
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

  const summaryRows = rows;
  const trendRows = rows.filter((row) => !isFreeSampleSale(row));

  const categoryMap = new Map();
  const channelMap = new Map();
  const productMap = new Map();
  const dateMap = new Map();

  let totalQty = 0;
  let totalAmount = 0;
  let revenueAmount = 0;
  let totalCogs = 0;

  summaryRows.forEach((row) => {
    const qty = numberValue(row.qty);
    const amount = numberValue(row.total_price);
    const category = row.category || 'Unknown';
    const channel = row.channel || 'Unknown';
    const product = row.product_name || 'Unknown';

    totalQty += qty;
    totalAmount += amount;

    addSummary(
      categoryMap,
      category,
      { category, qty: 0, amount: 0, transactions: 0 },
      qty,
      amount,
      true
    );

    addSummary(
      channelMap,
      channel,
      { channel, qty: 0, amount: 0, transactions: 0 },
      qty,
      amount,
      true
    );

    addSummary(
      productMap,
      product,
      { product_name: product, qty: 0, amount: 0 },
      qty,
      amount
    );
  });

  trendRows.forEach((row) => {
    const qty = numberValue(row.qty);
    const amount = numberValue(row.total_price);
    const date = row.sale_date || 'Unknown';
    const unitCogs = cogsForSale(row);

    revenueAmount += amount;
    totalCogs += qty * unitCogs;

    addSummary(
      dateMap,
      date,
      { label: date, qty: 0, amount: 0 },
      qty,
      amount
    );
  });

  const transactions = rows.length;
  const averageQtyPerTransaction = transactions > 0
    ? totalQty / transactions
    : 0;

  const grossProfit = revenueAmount - totalCogs;
  const grossProfitMargin = revenueAmount > 0
    ? grossProfit / revenueAmount * 100
    : 0;

  state.reportCategorySummary = [...categoryMap.values()]
    .sort((a, b) => b.amount - a.amount);

  state.reportChannelSummary = [...channelMap.values()]
    .sort((a, b) => b.amount - a.amount);

  state.reportProductSummary = [...productMap.values()]
    .sort((a, b) => b.amount - a.amount);

  state.reportTimeSeries = [...dateMap.values()]
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  renderReportKpiCards({
    transactions,
    totalQty,
    averageQtyPerTransaction,
    totalAmount,
    totalCogs,
    grossProfit,
    grossProfitMargin
  });

  ensureCategorySummaryCard();

  renderTable('categorySummaryTable', state.reportCategorySummary, columns.categorySummary);
  renderTable('channelSummaryTable', state.reportChannelSummary, columns.channelSummary);
  renderTable('productSummaryTable', state.reportProductSummary, columns.productSummary);

  styleSummaryTable('categorySummaryTable');
  styleSummaryTable('channelSummaryTable');
  styleSummaryTable('productSummaryTable');

  arrangeReportLayout();

  drawChart('trendChart', state.reportTimeSeries);
}

function isFreeSampleSale(row) {
  return cleanText(row.category) === 'Free Sample';
}

function cogsForSale(row) {
  const sku = cleanText(row.sku).toUpperCase();
  const location = cleanText(row.location).toLowerCase();

  if (!sku) return 0;

  const exactStock = state.stock.find((stockRow) =>
    (stockRow.status || 'ACTIVE') === 'ACTIVE' &&
    cleanText(stockRow.sku).toUpperCase() === sku &&
    cleanText(stockRow.location).toLowerCase() === location
  );

  if (exactStock) return numberValue(exactStock.cogs);

  const sameSkuRows = state.stock.filter((stockRow) =>
    (stockRow.status || 'ACTIVE') === 'ACTIVE' &&
    cleanText(stockRow.sku).toUpperCase() === sku
  );

  if (!sameSkuRows.length) return 0;

  const totalQty = sameSkuRows.reduce((sum, stockRow) => {
    return sum + numberValue(stockRow.qty);
  }, 0);

  if (totalQty > 0) {
    return sameSkuRows.reduce((sum, stockRow) => {
      return sum + numberValue(stockRow.cogs) * numberValue(stockRow.qty);
    }, 0) / totalQty;
  }

  return sameSkuRows.reduce((sum, stockRow) => {
    return sum + numberValue(stockRow.cogs);
  }, 0) / sameSkuRows.length;
}

function renderReportKpiCards({
  transactions,
  totalQty,
  averageQtyPerTransaction,
  totalAmount,
  totalCogs,
  grossProfit,
  grossProfitMargin
}) {
  const qtyCard = $('kpiQty')?.closest('.kpi-card');
  const amountCard = $('kpiAmount')?.closest('.kpi-card');
  const transactionsCard = $('kpiTransactions')?.closest('.kpi-card');
  const topProductCard = $('kpiTopProduct')?.closest('.kpi-card');

  if (!qtyCard || !amountCard || !transactionsCard || !topProductCard) return;

  styleUnifiedKpiCard(qtyCard, 'Qty');
  styleUnifiedKpiCard(amountCard, monthlyTargetBadge(totalAmount));
  styleUnifiedKpiCard(transactionsCard, 'Cost');
  styleUnifiedKpiCard(topProductCard, 'Margin');

  renderTransactionsQtyCard(transactions, totalQty, averageQtyPerTransaction);
  renderSalesTargetCard(totalAmount);
  renderCogsCard(totalCogs);
  renderGrossProfitMarginCard(grossProfitMargin, grossProfit);
}

function initializeReportDashboardUi() {
  renderReportKpiCards({
    transactions: 0,
    totalQty: 0,
    averageQtyPerTransaction: 0,
    totalAmount: 0,
    totalCogs: 0,
    grossProfit: 0,
    grossProfitMargin: 0
  });

  ensureCategorySummaryCard();
  arrangeReportLayout();
}

function styleUnifiedKpiCard(card, badgeText) {
  Object.assign(card.style, {
    position: 'relative',
    overflow: 'hidden',
    minHeight: '158px',
    padding: '18px 20px 16px',
    borderRadius: '18px',
    border: '1px solid rgba(80, 96, 58, 0.20)',
    background: 'linear-gradient(135deg, rgba(80, 96, 58, 0.10), #FFFFFF 58%)',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.065)'
  });

  let badge = card.querySelector('.kpi-corner-badge');

  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'kpi-corner-badge';
    card.appendChild(badge);
  }

  badge.textContent = badgeText;

  Object.assign(badge.style, {
    position: 'absolute',
    top: '14px',
    right: '14px',
    minWidth: '62px',
    padding: '7px 9px',
    borderRadius: '12px',
    textAlign: 'center',
    color: '#50603A',
    background: 'rgba(80, 96, 58, 0.095)',
    border: '1px solid rgba(80, 96, 58, 0.22)',
    boxShadow: '0 6px 16px rgba(80, 96, 58, 0.12)',
    fontSize: '10px',
    lineHeight: '1',
    fontWeight: '900',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap'
  });
}

function setKpiTitle(card, title, subtitle = '') {
  const titleElement = card?.querySelector('p');
  if (!titleElement) return;

  titleElement.innerHTML = `
    <span style="
      display:block;
      max-width:calc(100% - 82px);
      font-size:12px;
      line-height:1.1;
      font-weight:850;
      letter-spacing:0.045em;
      color:#50603A;
      text-transform:uppercase;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    ">
      ${escapeHtml(title)}
    </span>

    ${subtitle ? `
      <span style="
        display:block;
        max-width:calc(100% - 82px);
        margin-top:2px;
        font-size:10.5px;
        line-height:1.1;
        font-weight:750;
        letter-spacing:0.04em;
        color:rgba(80, 96, 58, 0.68);
        text-transform:uppercase;
        white-space:nowrap;
      ">
        ${escapeHtml(subtitle)}
      </span>
    ` : ''}
  `;
}

function ensureCategorySummaryCard() {
  if ($('categorySummaryTable')) {
    arrangeReportLayout();
    return;
  }

  const reportGrid = document.querySelector('.report-grid');
  const channelTable = $('channelSummaryTable');
  const channelCard = channelTable?.closest('.card');

  if (!reportGrid || !channelCard) return;

  const categoryCard = document.createElement('article');
  categoryCard.className = 'card report-summary-card';
  categoryCard.innerHTML = `
    <h2>Category Summary</h2>
    <div class="table-wrap compact" id="categorySummaryTable"></div>
  `;

  reportGrid.insertBefore(categoryCard, channelCard);

  arrangeReportLayout();
}

function arrangeReportLayout() {
  const reportGrid = document.querySelector('.report-grid');
  const trendChart = $('trendChart');
  const categoryTable = $('categorySummaryTable');
  const channelTable = $('channelSummaryTable');
  const productTable = $('productSummaryTable');

  if (!reportGrid) return;

  // Keep Sales Trend full width and put 3 summary cards in one row.
  Object.assign(reportGrid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '18px',
    alignItems: 'start'
  });

  const trendCard = trendChart?.closest('.card');

  if (trendCard) {
    trendCard.style.gridColumn = '1 / -1';
  }

  [categoryTable, channelTable, productTable].forEach((tableElement) => {
    const card = tableElement?.closest('.card');

    if (!card) return;

    card.classList.add('report-summary-card');

    // Important: allow card content to shrink inside 1 row.
    card.style.gridColumn = 'auto';
    card.style.minWidth = '0';
    card.style.overflow = 'hidden';
    card.style.padding = '18px 20px';

    const title = card.querySelector('h2');

    if (title) {
      Object.assign(title.style, {
        fontSize: '18px',
        lineHeight: '1.15',
        marginBottom: '14px',
        color: '#1F2933',
        fontWeight: '850'
      });
    }
  });
}

function styleSummaryTable(tableId) {
  const wrapper = $(tableId);
  const table = wrapper?.querySelector('table');

  if (!wrapper || !table) return;

  // Keep vertical scroll allowed, but remove horizontal scroll.
  Object.assign(wrapper.style, {
    overflowX: 'hidden',
    overflowY: 'auto',
    maxWidth: '100%',
    maxHeight: tableId === 'productSummaryTable' ? '360px' : '320px',
    borderRadius: '14px'
  });

  // Force table to fit the card width.
  Object.assign(table.style, {
    width: '100%',
    minWidth: '0',
    maxWidth: '100%',
    tableLayout: 'fixed'
  });

  // General compact table styling.
  table.querySelectorAll('th, td').forEach((cell) => {
    Object.assign(cell.style, {
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflow: 'visible',
      textOverflow: 'clip',
      fontSize: '10.5px',
      lineHeight: '1.3',
      padding: '8px 8px',
      verticalAlign: 'middle'
    });
  });

  // Header style.
  table.querySelectorAll('th').forEach((header) => {
    Object.assign(header.style, {
      fontSize: '8.5px',
      fontWeight: '850',
      color: '#50603A',
      textTransform: 'uppercase',
      letterSpacing: '0.015em',
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: '1.15',
      padding: '8px 6px'
    });
  });

  // Category Summary and Channel Summary have 4 columns.
  if (tableId === 'categorySummaryTable' || tableId === 'channelSummaryTable') {
    table.querySelectorAll('th:nth-child(1), td:nth-child(1)').forEach((cell) => {
      cell.style.width = '31%';
      cell.style.textAlign = 'left';
    });

    table.querySelectorAll('th:nth-child(2), td:nth-child(2)').forEach((cell) => {
      cell.style.width = '13%';
      cell.style.textAlign = 'center';
    });

    table.querySelectorAll('th:nth-child(3), td:nth-child(3)').forEach((cell) => {
      cell.style.width = '30%';
      cell.style.textAlign = 'center';
    });

    table.querySelectorAll('th:nth-child(4), td:nth-child(4)').forEach((cell) => {
      cell.style.width = '26%';
      cell.style.textAlign = 'center';
    });
  }

  // Product Summary has 3 columns.
  // Product name gets the most space and wraps vertically if long.
  if (tableId === 'productSummaryTable') {
    table.querySelectorAll('th:nth-child(1), td:nth-child(1)').forEach((cell) => {
      cell.style.width = '54%';
      cell.style.textAlign = 'left';
    });

    table.querySelectorAll('th:nth-child(2), td:nth-child(2)').forEach((cell) => {
      cell.style.width = '14%';
      cell.style.textAlign = 'center';
    });

    table.querySelectorAll('th:nth-child(3), td:nth-child(3)').forEach((cell) => {
      cell.style.width = '32%';
      cell.style.textAlign = 'center';
    });
  }
}

function renderTransactionsQtyCard(transactions, totalQty, averageQtyPerTransaction) {
  const card = $('kpiQty')?.closest('.kpi-card');

  // Main title now focuses on Qty Sold.
  setKpiTitle(card, 'Qty Sold', 'Transactions');

  $('kpiQty').innerHTML = `
    <div style="
      margin-top:18px;
      font-size:31px;
      line-height:1;
      font-weight:900;
      color:#50603A;
      letter-spacing:-0.04em;
      white-space:nowrap;
    ">
      ${formatNumber(totalQty)}
    </div>

    <div style="
      margin-top:14px;
      padding-top:11px;
      border-top:1px solid rgba(80, 96, 58, 0.14);
      display:flex;
      justify-content:space-between;
      gap:12px;
      font-size:12px;
      line-height:1.2;
    ">
      <span style="font-weight:800; color:rgba(80, 96, 58, 0.72);">
        Transactions
      </span>

      <span style="font-weight:900; color:#1F2933; white-space:nowrap;">
        ${formatNumber(transactions)}
      </span>
    </div>

    <div style="
      margin-top:7px;
      display:flex;
      justify-content:space-between;
      gap:12px;
      font-size:12px;
      line-height:1.2;
    ">
      <span style="font-weight:800; color:rgba(80, 96, 58, 0.72);">
        Avg Qty / Trx
      </span>

      <span style="font-weight:900; color:#50603A; white-space:nowrap;">
        ${averageQtyPerTransaction.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
      </span>
    </div>
  `;
}

function renderSalesTargetCard(totalAmount) {
  const card = $('kpiAmount')?.closest('.kpi-card');
  const isMonthly = $('reportType')?.value === 'monthly';
  const percentage = MONTHLY_SALES_TARGET > 0
    ? totalAmount / MONTHLY_SALES_TARGET * 100
    : 0;

  const cappedPercentage = Math.min(percentage, 100);
  const remainingAmount = Math.max(MONTHLY_SALES_TARGET - totalAmount, 0);

  setKpiTitle(card, 'Total Sales Amount', isMonthly ? 'Monthly Target' : '');

  $('kpiAmount').innerHTML = `
    <div style="
      margin-top:${isMonthly ? '16px' : '26px'};
      margin-bottom:8px;
      font-size:27px;
      line-height:1.05;
      font-weight:900;
      color:#50603A;
      letter-spacing:-0.035em;
      white-space:nowrap;
    ">
      ${formatCurrency(totalAmount)}
    </div>

    ${isMonthly ? `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-bottom:8px;
        font-size:12px;
        line-height:1.2;
        color:rgba(80, 96, 58, 0.76);
      ">
        <span style="font-weight:800;">Target</span>
        <span style="font-weight:900; color:#1F2933; white-space:nowrap;">
          ${formatCurrency(MONTHLY_SALES_TARGET)}
        </span>
      </div>

      <div style="
        width:100%;
        height:7px;
        border-radius:999px;
        background:rgba(80, 96, 58, 0.12);
        overflow:hidden;
        margin:8px 0 8px;
      ">
        <div style="
          width:${cappedPercentage}%;
          height:100%;
          border-radius:999px;
          background:#50603A;
        "></div>
      </div>

      <div style="
        font-size:11.5px;
        line-height:1.25;
        font-weight:750;
        color:rgba(80, 96, 58, 0.72);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      ">
        ${percentage >= 100
          ? `Passed target by ${formatCurrency(totalAmount - MONTHLY_SALES_TARGET)}`
          : `Remaining ${formatCurrency(remainingAmount)} to target`}
      </div>
    ` : ''}
  `;
}

function renderCogsCard(totalCogs) {
  const card = $('kpiTransactions')?.closest('.kpi-card');

  setKpiTitle(card, 'COGS', 'Cost of Goods Sold');

  $('kpiTransactions').innerHTML = `
    <div style="
      margin-top:25px;
      font-size:27px;
      line-height:1.05;
      font-weight:900;
      color:#1F2933;
      letter-spacing:-0.035em;
      white-space:nowrap;
    ">
      ${formatCurrency(totalCogs)}
    </div>

    <div style="
      margin-top:16px;
      padding-top:11px;
      border-top:1px solid rgba(80, 96, 58, 0.14);
      font-size:12px;
      line-height:1.2;
      font-weight:750;
      color:rgba(80, 96, 58, 0.72);
    ">
      Estimated from current stock COGS
    </div>
  `;
}

function renderGrossProfitMarginCard(grossProfitMargin, grossProfit) {
  const card = $('kpiTopProduct')?.closest('.kpi-card');

  setKpiTitle(card, 'Gross Profit Margin', 'Margin');

  $('kpiTopProduct').innerHTML = `
    <div style="
      margin-top:18px;
      font-size:31px;
      line-height:1;
      font-weight:900;
      color:#50603A;
      letter-spacing:-0.045em;
      white-space:nowrap;
    ">
      ${grossProfitMargin.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
    </div>

    <div style="
      margin-top:18px;
      padding-top:11px;
      border-top:1px solid rgba(80, 96, 58, 0.14);
      display:flex;
      justify-content:space-between;
      gap:12px;
      font-size:12px;
      line-height:1.2;
    ">
      <span style="font-weight:800; color:rgba(80, 96, 58, 0.72);">Margin</span>
      <span style="font-weight:900; color:#1F2933; white-space:nowrap;">
        ${formatCurrency(grossProfit)}
      </span>
    </div>
  `;
}

function monthlyTargetBadge(totalAmount) {
  if ($('reportType')?.value !== 'monthly') return 'Sales';

  const percentage = MONTHLY_SALES_TARGET > 0
    ? totalAmount / MONTHLY_SALES_TARGET * 100
    : 0;

  return `${percentage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
}

function ensureKpiCard({ id, labelId, valueId, metaId, title }) {
  let card = $(id);

  if (!card) {
    const grid = document.querySelector('.kpi-grid');

    card = document.createElement('article');
    card.className = 'kpi-card';
    card.id = id;

    card.innerHTML = `
      <p id="${labelId}">${title}</p>
      <h3 id="${valueId}">IDR 0</h3>
      <div id="${metaId}"></div>
    `;

    grid.appendChild(card);
  }

  return card;
}

function styleReportKpiCard(card, type) {
  if (!card) return;

  Object.assign(card.style, {
    position: 'relative',
    overflow: 'hidden',
    minHeight: '145px',
    padding: '18px 20px 16px',
    border: '1px solid rgba(80, 96, 58, 0.18)',
    background: type === 'margin'
      ? 'linear-gradient(135deg, rgba(80, 96, 58, 0.10), #FFFFFF 58%)'
      : '#FFFFFF',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)'
  });

  const title = card.querySelector('p');
  const meta = card.querySelector('div[id$="Meta"]');

  if (title) {
    Object.assign(title.style, {
      fontSize: '12px',
      lineHeight: '1.15',
      fontWeight: '850',
      letterSpacing: '0.045em',
      color: '#50603A',
      textTransform: 'uppercase',
      marginBottom: '20px',
      whiteSpace: 'nowrap'
    });
  }

  if (meta) {
    Object.assign(meta.style, {
      marginTop: '16px',
      paddingTop: '11px',
      borderTop: '1px solid rgba(80, 96, 58, 0.14)',
      fontSize: '12px',
      lineHeight: '1.2'
    });
  }
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

  element.innerHTML = `
    <table>
      <thead>
        <tr>
          ${tableColumns.map((column) => headerCell(id, column)).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${tableColumns.map((column) => {
              // These columns need access to the complete source row.
              const rowBasedColumns = [
                'action',
                'sales_product'
              ];

              const value = column === 'action' && id === 'draftTable'
                ? row.action
                : rowBasedColumns.includes(column)
                  ? row
                  : row[column];

              return `<td>${cell(value, column)}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function headerCell(tableId, column) {
  if (tableId !== 'stockTable' || column === 'action') {
    return `<th>${escapeHtml(label(column))}</th>`;
  }

  const isActive = state.stockSort.column === column;
  const arrow = isActive
    ? state.stockSort.direction === 'asc'
      ? '↑'
      : '↓'
    : '↕';

  return `
    <th>
      <button
        type="button"
        data-sort-stock-column="${escapeHtml(column)}"
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:6px;
          width:100%;
          border:0;
          background:transparent;
          padding:0;
          font:inherit;
          font-weight:800;
          color:inherit;
          cursor:pointer;
          text-align:left;
        "
        title="Sort by ${escapeHtml(label(column))}"
      >
        <span>${escapeHtml(label(column))}</span>
        <span style="
          font-size:11px;
          opacity:${isActive ? '1' : '0.45'};
          color:${isActive ? '#50603A' : 'inherit'};
        ">
          ${arrow}
        </span>
      </button>
    </th>
  `;
}

function sortStockTable(column) {
  if (state.stockSort.column === column) {
    state.stockSort.direction = state.stockSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.stockSort.column = column;
    state.stockSort.direction = 'asc';
  }

  renderMainTables();
}

function sortStockRows(rows) {
  const column = state.stockSort.column;
  const direction = state.stockSort.direction;

  if (!column) return rows;

  return [...rows].sort((a, b) => {
    const result = compareStockValue(a[column], b[column], column);
    return direction === 'asc' ? result : -result;
  });
}

function compareStockValue(a, b, column) {
  if (column === 'last_sold' || column === 'updated_at') {
    return compareDateValue(a, b);
  }

  if ([
    'qty',
    'price',
    'tier1_price',
    'tier2_price',
    'tier3_price',
    'consign_price',
    'cogs'
  ].includes(column)) {
    return numberValue(a) - numberValue(b);
  }

  return cleanText(a).localeCompare(cleanText(b), 'id-ID', {
    numeric: true,
    sensitivity: 'base'
  });
}

function compareDateValue(a, b) {
  const dateA = cleanText(a);
  const dateB = cleanText(b);

  if (dateA === '-' && dateB === '-') return 0;
  if (dateA === '-') return 1;
  if (dateB === '-') return -1;

  return dateA.localeCompare(dateB);
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
  const qtyAxisMax = Math.max(Math.ceil(maxQty * 1.15), 1);

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

  const amountTicks = [0, 0.25, 0.5, 0.75, 1];
  const qtyTicks = integerTicks(qtyAxisMax);

  const amountAxis = amountTicks.map((ratio) => {
    const y = padding.top + plotHeight - ratio * plotHeight;

    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="grid-line"></line>
      <text x="${padding.left - 14}" y="${y + 4}" text-anchor="end" class="axis-label amount-axis-label">
        ${safe(shortAmount(amountAxisMax * ratio))}
      </text>
    `;
  }).join('');

  const qtyAxis = qtyTicks.map((tick) => {
    const y = yQty(tick);

    return `
      <text x="${width - padding.right + 14}" y="${y + 4}" text-anchor="start" class="axis-label qty-axis-label">
        ${safe(tick)}
      </text>
    `;
  }).join('');

  const axisTitles = `
    <text x="${padding.left}" y="24" text-anchor="start" class="axis-title amount-title">Sales Amount</text>
    <text x="${width - padding.right}" y="24" text-anchor="end" class="axis-title qty-title">Qty Sold</text>
  `;

  const highestAmount = Math.max(...data.map((item) => numberValue(item.amount)));

  const bars = data.map((item, index) => {
    const amount = numberValue(item.amount);
    const barHeight = padding.top + plotHeight - yAmount(amount);
    const barX = x(index) - barWidth / 2;
    const barY = yAmount(amount);
    const barClass = amount === highestAmount
      ? 'amount-bar max-bar chart-hover'
      : 'amount-bar chart-hover';

    const tooltip = `${item.label} | Amount: ${formatCurrency(amount)} | Qty: ${formatNumber(item.qty)}`;

    return `
      <rect
        x="${barX}"
        y="${barY}"
        width="${barWidth}"
        height="${barHeight}"
        rx="9"
        class="${barClass}"
        data-tooltip="${safe(tooltip)}"
      ></rect>
    `;
  }).join('');

  const linePoints = data.map((item, index) => {
    return `${x(index)},${yQty(item.qty)}`;
  }).join(' ');

  const qtyDots = data.map((item, index) => {
    const qty = numberValue(item.qty);
    const tooltip = `${item.label} | Qty: ${formatNumber(qty)} | Amount: ${formatCurrency(item.amount)}`;

    return `
      <circle
        cx="${x(index)}"
        cy="${yQty(qty)}"
        r="5.8"
        class="qty-dot chart-hover"
        data-tooltip="${safe(tooltip)}"
      ></circle>
    `;
  }).join('');

  const xLabels = data.map((item, index) => {
    const labelParts = formatChartDateLabel(item.label);

    const labelX = x(index);
    const labelY = height - 42;

    return `
      <text
        x="${labelX}"
        y="${labelY}"
        text-anchor="middle"
        class="x-axis-label"
        transform="rotate(-10 ${labelX} ${labelY})"
      >
        <tspan x="${labelX}" dy="0">${safe(labelParts.main)}</tspan>
        ${labelParts.year ? `<tspan x="${labelX}" dy="13">${safe(labelParts.year)}</tspan>` : ''}
      </text>
    `;
  }).join('');

  element.style.position = 'relative';

  element.innerHTML = `
    <div id="${id}Tooltip" style="
      position:absolute;
      z-index:20;
      pointer-events:none;
      opacity:0;
      transform:translateY(4px);
      transition:opacity 140ms ease, transform 140ms ease;
      background:#FFFFFF;
      color:#1F2933;
      border:1px solid rgba(80, 96, 58, 0.22);
      box-shadow:0 10px 24px rgba(15, 23, 42, 0.14);
      border-radius:12px;
      padding:9px 11px;
      font-size:12px;
      font-weight:750;
      white-space:nowrap;
    "></div>

    <svg class="combo-chart advanced-chart" viewBox="0 0 ${width} ${height}" role="img">
      <style>
        .chart-hover {
          transition: opacity 160ms ease, filter 160ms ease;
          cursor: pointer;
        }

        .chart-hover:hover {
          opacity: 0.82;
          filter: drop-shadow(0 5px 8px rgba(80, 96, 58, 0.28));
        }
      </style>

      <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
      ${axisTitles}
      ${amountAxis}
      ${qtyAxis}
      <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" class="axis-line"></line>
      <line x1="${width - padding.right}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" class="right-axis-line"></line>
      <g class="amount-bars">${bars}</g>
      <polyline class="qty-line" points="${linePoints}"></polyline>
      <g class="qty-dots">${qtyDots}</g>
      <g class="x-labels">${xLabels}</g>
    </svg>
  `;

  attachChartTooltip(element, id);
}

function formatChartDateLabel(value) {
  // Convert chart label from YYYY-MM-DD into two-line date format.
  const text = cleanText(value);

  // If the value is not a normal date, show it as-is.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return {
      main: text,
      year: ''
    };
  }

  // Split date into year, month, and day.
  const [year, month, day] = text.split('-');

  // Return two-line label:
  // main = DD - MM
  // year = YYYY
  return {
    main: `${day} - ${month}`,
    year
  };
}

function integerTicks(maxValue) {
  const max = Math.max(Math.ceil(maxValue), 1);

  if (max <= 5) {
    return Array.from({ length: max + 1 }, (_, index) => index);
  }

  const rawTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    return Math.round(max * ratio);
  });

  return [...new Set(rawTicks)].sort((a, b) => a - b);
}

function attachChartTooltip(container, chartId) {
  const tooltip = $(`${chartId}Tooltip`);

  if (!tooltip) return;

  container.querySelectorAll('.chart-hover').forEach((item) => {
    item.addEventListener('mousemove', (event) => {
      const rect = container.getBoundingClientRect();

      tooltip.textContent = item.dataset.tooltip || '';
      tooltip.style.left = `${event.clientX - rect.left + 12}px`;
      tooltip.style.top = `${event.clientY - rect.top - 12}px`;
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    });

    item.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(4px)';
    });
  });
}

function exportByType(type) {
  if (type === 'report') {
    const workbook = XLSX.utils.book_new();
    addSheet(workbook, state.reportRows, 'Raw Sales', columns.sales.filter((column) => column !== 'action'));
    addSheet(workbook, state.reportCategorySummary, 'Category Summary', columns.categorySummary);
    addSheet(workbook, state.reportChannelSummary, 'Channel Summary', columns.channelSummary);
    addSheet(workbook, state.reportProductSummary, 'Product Summary', columns.productSummary);
    addSheet(workbook, state.reportTimeSeries, 'Trend', ['label', 'qty', 'amount']);
    XLSX.writeFile(workbook, `sales_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    return;
  }

  let rows = [];
  let fileName = 'export.xlsx';
  let tableColumns = [];

  if (type === 'sales') { rows = filterRows(state.sales, $('salesSearch').value); fileName = 'sales_export.xlsx'; tableColumns = columns.sales.filter((column) => column !== 'action'); }
  if (type === 'stock') {
    rows = filterRows(
      state.stock.map((row) => ({
        ...row,
        last_sold: latestSalesDateBySku(row.sku)
      })),
      $('stockSearch').value
    );

    fileName = 'stock_export.xlsx';

    tableColumns = columns.stock.filter(
      (column) => column !== 'action'
    );
  }
  if (type === 'transfer') { rows = filterRows(state.transfers, $('transferSearch').value); fileName = 'transfer_stock_export.xlsx'; tableColumns = columns.transfer.filter((column) => column !== 'action'); }
  if (type === 'movements') { rows = filterRows(state.movements, $('movementSearch').value); fileName = 'stock_movements_export.xlsx'; tableColumns = columns.movement; }

  if (!rows.length) return showMessage('No data available to export.', 'err');

  const workbook = XLSX.utils.book_new();
  addSheet(workbook, rows, 'Data', tableColumns);
  XLSX.writeFile(workbook, fileName);
}

async function exportMatrixStock() {
  // Ensure Supabase is connected.
  if (!ensureClient()) return;

  const button = $('matrixStockExportButton');

  try {
    // Prevent duplicate clicks when the button exists in the current layout.
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparing...';
    }

    // Refresh the Supabase matrix before downloading.
    const { data: refreshResult, error: refreshError } =
      await state.client.rpc('refresh_matrix_stock');

    if (refreshError) throw refreshError;

    // Retrieve the refreshed Matrix Stock rows.
    const { data, error } = await state.client
      .from('matrix_stock')
      .select('*')
      .order('product_name')
      .order('month_start');

    if (error) throw error;
    if (!data?.length) throw new Error('Matrix Stock is empty.');

    // Convert normalized rows into the monthly Excel matrix.
    const matrixRows = buildWideStockMatrix(data);

    const worksheet =
      XLSX.utils.aoa_to_sheet(matrixRows.rows);

    worksheet['!merges'] = matrixRows.merges;
    worksheet['!cols'] = matrixRows.columnWidths;

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Matrix Stock'
    );

    XLSX.writeFile(
      workbook,
      `matrix_stock_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    const status =
      refreshResult?.[0]?.refresh_status || 'SUCCESS';

    showMessage(
      `Matrix Stock exported. Refresh status: ${status}.`,
      'ok'
    );
  } catch (error) {
    showMessage(
      error.message || 'Failed to export Matrix Stock.',
      'err'
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Matrix Stock';
    }
  }
}

function buildWideStockMatrix(sourceRows) {
  // Collect unique months once and keep chronological order.
  const months = [...new Set(
    sourceRows.map((row) => cleanText(row.month_start))
  )].sort();

  // Group normalized Supabase rows by Product Name and month.
  const products = new Map();

  sourceRows.forEach((sourceRow) => {
    const productName = cleanText(sourceRow.product_name) || '-';
    const month = cleanText(sourceRow.month_start);

    if (!products.has(productName)) {
      products.set(productName, new Map());
    }

    products.get(productName).set(month, sourceRow);
  });

  // Build the two-row Excel header.
  const monthHeader = ['Product Name'];
  const metricHeader = [''];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }
  ];

  months.forEach((month, index) => {
    const startColumn = 1 + index * 4;

    monthHeader.push(
      formatStockMatrixMonth(month),
      '',
      '',
      ''
    );

    metricHeader.push(
      'Beginning',
      'Addition',
      'Sales',
      'Sales w/o Free Sample'
    );

    merges.push({
      s: { r: 0, c: startColumn },
      e: { r: 0, c: startColumn + 3 }
    });
  });

  const rows = [monthHeader, metricHeader];

  // Add one output row per Product Name.
  [...products.entries()]
    .sort(([productA], [productB]) =>
      productA.localeCompare(productB, 'id-ID', {
        numeric: true,
        sensitivity: 'base'
      })
    )
    .forEach(([productName, monthData]) => {
      const outputRow = [productName];

      months.forEach((month) => {
        const value = monthData.get(month) || {};

        outputRow.push(
          numberValue(value.beginning_qty),
          numberValue(value.addition_qty),
          numberValue(value.sales_qty),
          numberValue(value.sales_without_free_sample_qty)
        );
      });

      rows.push(outputRow);
    });

  // Keep Product Name readable and monthly metrics compact.
  const columnWidths = [{ wch: 38 }];

  months.forEach(() => {
    columnWidths.push(
      { wch: 13 },
      { wch: 13 },
      { wch: 13 },
      { wch: 23 }
    );
  });

  return {
    rows,
    merges,
    columnWidths
  };
}

function formatStockMatrixMonth(value) {
  // Format YYYY-MM-DD into Month YYYY.
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
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

function priceFor(match, category, channel) {
  if (!match) return '';

  if (category === 'Free Sample') return 0;

  if (channel === 'Konsinyasi') {
    return match.consign_price || 0;
  }

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

  if (categoryInput && priceInput) {
    priceInput.value = priceFor(match, categoryInput.value, channelInput?.value);
  }

  if (form.id === 'stockForm') {
    ['price', 'tier1_price', 'tier2_price', 'tier3_price', 'consign_price', 'cogs'].forEach((key) => {
      if (form[key] && match[key] !== undefined) form[key].value = match[key];
    });
  }
}

function cell(value, column) {
  // =======================================================
  // UI-only combined Sales product column
  // =======================================================

  if (column === 'sales_product') {
    const row = value || {};

    // Keep safe fallback values when source data is empty.
    const sku = cleanText(row.sku) || '-';
    const productName = cleanText(row.product_name) || '-';

    return `
      <div class="compact-product-cell">
        <div class="compact-product-sku">
          ${escapeHtml(sku)}
        </div>

        <div
          class="compact-product-name"
          title="${escapeHtml(productName)}"
        >
          ${escapeHtml(productName)}
        </div>
      </div>
    `;
  }

  if (column === 'order_number') {
    const orderNumber = cleanText(value) || '-';

    return `
      <span
        class="sales-order-number"
        title="${escapeHtml(orderNumber)}"
      >
        ${escapeHtml(orderNumber)}
      </span>
    `;
  }



  if (column === 'stock_status') {
    const className =
      value === 'Out of Stock'
        ? 'badge badge-out'
        : value === 'Low Stock'
          ? 'badge badge-low'
          : 'badge badge-ok';

    return `
      <span class="${className}">
        ${escapeHtml(value)}
      </span>
    `;
  }

  // =======================================================
  // Sales status display
  // =======================================================

  if (column === 'status') {
    const status = value || 'ACTIVE';

    const className =
      status === 'REVOKED'
        ? 'status-revoked'
        : 'status-active';

    return `
      <span class="${className}">
        ${escapeHtml(status)}
      </span>
    `;
  }

  // =======================================================
  // Action controls
  // =======================================================

  if (column === 'action') {
    // Draft-row actions.
    if (typeof value === 'number') {
      return `
        <div class="draft-actions">
          <button
            class="icon-btn edit-line-btn"
            type="button"
            data-edit-line="${value}"
            title="Edit draft line"
          >
            ✎
          </button>

          <button
            class="icon-btn remove-line-btn"
            type="button"
            data-remove-line="${value}"
            title="Remove draft line"
          >
            ×
          </button>
        </div>
      `;
    }

    const row = value || {};

    // Stock-row actions.
    if (row.__actionType === 'stock') {
      return `
        <div class="sales-action-group">
          <button
            class="icon-btn edit-line-btn"
            type="button"
            data-edit-stock-id="${escapeHtml(row.id)}"
            title="Edit stock"
            aria-label="Edit stock"
          >
            ✎
          </button>

          ${stockInfoControl(row)}

          <button
            class="icon-btn remove-line-btn"
            type="button"
            data-remove-stock-id="${escapeHtml(row.id)}"
            title="Remove stock"
            aria-label="Remove stock"
          >
            ×
          </button>
        </div>
      `;
    }

    // Transfer-row actions.
    if (row.__actionType === 'transfer') {
      return `
        <div class="draft-actions">
          <button
            class="icon-btn remove-line-btn"
            type="button"
            data-remove-transfer-id="${escapeHtml(row.id)}"
            title="Remove transfer"
          >
            ×
          </button>
        </div>
      `;
    }

    const isRevoked =
      (row.status || 'ACTIVE') === 'REVOKED';

    const invoiceChannels = [
      'WA Order',
      'Konsinyasi'
    ];

    const canDownloadInvoice =
      !isRevoked &&
      invoiceChannels.includes(
        cleanText(row.channel)
      );

    const invoiceControl = canDownloadInvoice
      ? `
        <span class="sales-action-slot">
          <button
            class="icon-btn edit-line-btn"
            type="button"
            data-invoice-sales-id="${escapeHtml(row.id)}"
            title="Download invoice"
            aria-label="Download invoice"
          >
            🧾
          </button>
        </span>
      `
      : `
        <span
          class="sales-action-slot"
          aria-hidden="true"
        >
          <span class="sales-invoice-placeholder">
            🧾
          </span>
        </span>
      `;

    // The Information icon always occupies the second slot.
    const infoControl = `
      <span class="sales-action-slot">
        ${salesInfoControl(row)}
      </span>
    `;

    // The third slot contains either Revoke or Revoked.
    const revokeControl = isRevoked
      ? `
        <span class="sales-revoked-action">
          Revoked
        </span>
      `
      : `
        <button
          class="revoke-btn"
          type="button"
          data-revoke-sales-id="${escapeHtml(row.id)}"
        >
          Revoke
        </button>
      `;

    return `
      <div class="sales-action-group">
        ${invoiceControl}
        ${infoControl}

        <span class="sales-revoke-slot">
          ${revokeControl}
        </span>
      </div>
    `;
  }

  // Default cell output for normal fields.
  return escapeHtml(formatCell(value, column));
}

function salesInfoControl(row) {
  // Prepare clean values for the professional Sales details panel.
  const orderNumber =
    cleanText(row.order_number) || 'No order number';

  const customerName =
    cleanText(row.customer_name) || '-';

  const channel =
    cleanText(row.channel) || '-';

  const location =
    cleanText(row.location) || '-';

  const category =
    cleanText(row.category) || '-';

  const sku =
    cleanText(row.sku) || '-';

  const productName =
    cleanText(row.product_name) || '-';

  const createdBy =
    cleanText(row.created_by) || '-';

  const remark =
    cleanText(row.remark) || '-';

  const status =
    cleanText(row.status) || 'ACTIVE';

  return `
    <span class="sales-info-wrapper">
      <button
        type="button"
        class="sales-info-button"
        aria-label="View sales details for ${escapeHtml(orderNumber)}"
        title="View sales details"
      >
        <span aria-hidden="true">i</span>
      </button>

      <span
        class="sales-info-tooltip"
        role="tooltip"
      >
        <span class="sales-info-tooltip-header">
          <span>
            <span class="sales-info-tooltip-title">
              Sales Details
            </span>

            <span class="sales-info-tooltip-subtitle">
              ${escapeHtml(orderNumber)}
            </span>
          </span>

          <span class="sales-info-tooltip-status">
            ${escapeHtml(status)}
          </span>
        </span>

        <span class="sales-info-tooltip-grid">
          ${salesInfoItem(
            'Customer',
            customerName
          )}

          ${salesInfoItem(
            'Channel',
            channel
          )}

          ${salesInfoItem(
            'Location',
            location
          )}

          ${salesInfoItem(
            'Category',
            category
          )}

          ${salesInfoItem(
            'SKU',
            sku
          )}

          ${salesInfoItem(
            'Product',
            productName
          )}

          ${salesInfoItem(
            'Unit Price',
            formatCurrency(row.price)
          )}

          ${salesInfoItem(
            'Quantity',
            formatNumber(row.qty)
          )}

          ${salesInfoItem(
            'Discount Type',
            cleanText(row.discount_type) || '-'
          )}

          ${salesInfoItem(
            'Discount Input',
            formatDiscountInput(row)
          )}

          ${salesInfoItem(
            'Discount Amount',
            formatCurrency(row.discount)
          )}

          ${salesInfoItem(
            'Shipping Fee',
            formatCurrency(row.ongkos_kirim)
          )}

          ${salesInfoItem(
            'Net Sales',
            formatCurrency(row.total_price)
          )}

          ${salesInfoItem(
            'Created By',
            createdBy
          )}
        </span>

        <span class="sales-info-tooltip-remark">
          <span>Remark</span>

          <strong>
            ${escapeHtml(remark)}
          </strong>
        </span>
      </span>
    </span>
  `;
}

function stockInfoControl(row) {
  // Stock Status is hidden from the compact Stock table,
  // so it is displayed inside the information panel.
  const stockStatus =
    cleanText(row.stock_status) || '-';

  // Updated At is also hidden from the compact Stock table.
  const updatedAt =
    row.updated_at
      ? formatDateTime(row.updated_at)
      : '-';

  // Keep SKU as the tooltip reference.
  const sku =
    cleanText(row.sku) || '-';

  return `
    <span class="sales-info-wrapper">
      <button
        type="button"
        class="sales-info-button"
        aria-label="View hidden stock details for ${escapeHtml(sku)}"
        title="View stock details"
      >
        <span aria-hidden="true">i</span>
      </button>

      <span
        class="sales-info-tooltip stock-info-tooltip"
        role="tooltip"
      >
        <span class="sales-info-tooltip-header">
          <span>
            <span class="sales-info-tooltip-title">
              Stock Details
            </span>

            <span class="sales-info-tooltip-subtitle">
              ${escapeHtml(sku)}
            </span>
          </span>

          <span class="sales-info-tooltip-status">
            ${escapeHtml(stockStatus)}
          </span>
        </span>

        <span class="sales-info-tooltip-grid">
          ${salesInfoItem(
            'Tier 1 Price',
            formatCurrency(row.tier1_price)
          )}

          ${salesInfoItem(
            'Tier 2 Price',
            formatCurrency(row.tier2_price)
          )}

          ${salesInfoItem(
            'Tier 3 Price',
            formatCurrency(row.tier3_price)
          )}

          ${salesInfoItem(
            'Updated At',
            updatedAt
          )}
        </span>
      </span>
    </span>
  `;
}

function salesInfoItem(labelText, valueText) {
  // Generate one consistent label and value pair
  // inside the Sales information panel.
  return `
    <span class="sales-info-item">
      <span>
        ${escapeHtml(labelText)}
      </span>

      <strong>
        ${escapeHtml(valueText)}
      </strong>
    </span>
  `;
}

function formatDiscountInput(row) {
  // Read the original discount type.
  const discountType =
    cleanText(row.discount_type);

  // Convert the original input into a safe number.
  const discountValue =
    numberValue(row.discount_value);

  // Show percentage input as a percentage.
  if (discountType === 'PERCENT') {
    return `${formatNumber(discountValue)}%`;
  }

  // Show amount input as currency.
  return formatCurrency(discountValue);
}

async function downloadSalesInvoice(salesId) {
  if (!ensureReadyForWrite()) return;

  const selectedSale = state.sales.find((row) => row.id === salesId);

  if (!selectedSale) {
    return showMessage('Sales record not found.', 'err');
  }

  // Invoice can be generated for WA Order and Konsinyasi.
  const invoiceChannels = ['WA Order', 'Konsinyasi'];

  if (!invoiceChannels.includes(cleanText(selectedSale.channel))) {
    return showMessage(
      'Invoice is only available for WA Order and Konsinyasi.',
      'err'
    );
  }

  if ((selectedSale.status || 'ACTIVE') !== 'ACTIVE') {
    return showMessage(
      'Cannot download invoice for revoked sales.',
      'err'
    );
  }

  const invoiceNumber =
    cleanText(selectedSale.order_number) || selectedSale.id;

  const customerName =
    cleanText(selectedSale.customer_name) || '-';

  // Match the same active channel and same order number.
  const selectedChannel = cleanText(selectedSale.channel);
  const selectedOrderNumber = cleanText(selectedSale.order_number);

  const invoiceRows = selectedOrderNumber
    ? state.sales.filter((row) =>
        (row.status || 'ACTIVE') === 'ACTIVE' &&
        cleanText(row.channel) === selectedChannel &&
        cleanText(row.order_number) === selectedOrderNumber
      )
    : [selectedSale];

  if (!invoiceRows.length) {
    return showMessage('No invoice rows found.', 'err');
  }

  try {
    await generateInvoicePdf({
      invoiceNumber,
      customerName,
      invoiceDate: selectedSale.sale_date,
      rows: invoiceRows
    });

    await recordInvoiceDownload(invoiceNumber, customerName);

    showMessage(
      'Invoice downloaded and movement recorded.',
      'ok'
    );

    await refreshAll();
  } catch (error) {
    showMessage(
      error.message || 'Failed to generate invoice.',
      'err'
    );
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
  // doc.text('LivingWord', marginX, 50);

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

  let subtotal = 0;
  let totalDiscount = 0;
  const ongkosKirim = numberValue(rows[0]?.ongkos_kirim);

  rows.forEach((row, index) => {
    const qty = numberValue(row.qty);
    const price = numberValue(row.price);
    const lineGross = qty * price;
    const lineDiscount = numberValue(row.discount);
    const productLines = doc.splitTextToSize(cleanText(row.product_name), 82);
    subtotal += lineGross;
    totalDiscount += lineDiscount;

    if (y > 185) {
      doc.addPage();
      y = 24;
    }

    if (index % 2 === 0) {
      doc.setFillColor(255, 255, 255);
      doc.rect(marginX, y - 5, pageWidth - marginX * 2, 8, 'F');
    }

    doc.text(productLines, marginX + 3, y);
    doc.text(formatNumber(qty), 112, y, { align: 'right' });
    doc.text(invoiceCurrency(price), 150, y, { align: 'right' });
    doc.text(invoiceCurrency(lineGross), pageWidth - marginX - 3, y, { align: 'right' });
    y += Math.max(8, productLines.length * 5);
  });

  doc.setDrawColor(INVOICE_THEME.border);
  doc.setLineWidth(0.3);
  doc.line(marginX, y + 2, pageWidth - marginX, y + 2);

  const grandTotal = subtotal - totalDiscount + ongkosKirim;

  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(INVOICE_THEME.text);
  doc.text('Subtotal', pageWidth - 86, y, { align: 'left' });
  doc.text(invoiceCurrency(subtotal), pageWidth - marginX, y, { align: 'right' });

  y += 6;
  doc.text('Discount', pageWidth - 86, y, { align: 'left' });
  doc.text(`- ${invoiceCurrency(totalDiscount)}`, pageWidth - marginX, y, { align: 'right' });

  y += 6;
  doc.text('Ongkos Kirim', pageWidth - 86, y, { align: 'left' });
  doc.text(invoiceCurrency(ongkosKirim), pageWidth - marginX, y, { align: 'right' });

  y += 8;
  doc.setDrawColor(INVOICE_THEME.primary);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - 86, y - 4, pageWidth - marginX, y - 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(INVOICE_THEME.primary);
  doc.text('Grand Total', pageWidth - 86, y + 2, { align: 'left' });
  doc.text(invoiceCurrency(grandTotal), pageWidth - marginX, y + 2, { align: 'right' });

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

  doc.setFillColor(INVOICE_THEME.lightBg);
  doc.roundedRect(marginX, paymentY - 8, 178, 58, 3, 3, 'F');

  doc.setTextColor(INVOICE_THEME.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Payment Information', marginX + 5, paymentY);

  doc.setDrawColor(INVOICE_THEME.accent);
  doc.setLineWidth(0.6);
  doc.line(marginX + 5, paymentY + 4, marginX + 58, paymentY + 4);

  let y = paymentY + 14;

  paymentRows.forEach(([labelText, valueText]) => {
    doc.setFillColor(INVOICE_THEME.accent);
    doc.circle(marginX + 6, y - 1.5, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(INVOICE_THEME.text);
    doc.text(labelText, marginX + 11, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);

    const valueLines = doc.splitTextToSize(valueText, 112);
    doc.text(valueLines, 66, y);

    y += Math.max(6, valueLines.length * 4.8);
  });
}

function drawInvoiceFooter(doc, pageWidth, pageHeight, marginX) {
  const footerY = pageHeight - 31;

  const iconX = marginX + 9;
  const textX = marginX + 17;

  const rowGap = 8.5;

  const row1TextY = footerY;
  const row2TextY = footerY + rowGap;
  const row3TextY = footerY + rowGap * 2;

  doc.setDrawColor(INVOICE_THEME.border);
  doc.setLineWidth(0.4);
  doc.line(marginX, footerY - 10, pageWidth - marginX, footerY - 10);

  drawContactIcon(doc, iconX, row1TextY, 'website');
  drawContactIcon(doc, iconX, row2TextY, 'whatsapp');
  drawContactIcon(doc, iconX, row3TextY, 'email');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(INVOICE_THEME.text);

  doc.text('livingword.id', textX, row1TextY);
  doc.text('+6285775242424', textX, row2TextY);
  doc.text('devin@livingword.id', textX, row3TextY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(INVOICE_THEME.primary);
  doc.text('Thank you', pageWidth - marginX, row1TextY, { align: 'right' });

  doc.setFontSize(10.5);
  doc.setTextColor(INVOICE_THEME.muted);
  doc.text('for your purchase', pageWidth - marginX, row2TextY, { align: 'right' });

  doc.setDrawColor(INVOICE_THEME.accent);
  doc.setLineWidth(0.8);
  doc.line(pageWidth - marginX - 42, row3TextY + 4, pageWidth - marginX, row3TextY + 4);
}

function drawContactIcon(doc, iconX, textY, type) {
  const cx = iconX;
  const cy = textY - 0.4;
  const r = 2.25;

  doc.setDrawColor(INVOICE_THEME.primary);
  doc.setLineWidth(0.38);

  if (type === 'website') {
    doc.circle(cx, cy, r, 'S');
    doc.line(cx - r, cy, cx + r, cy);
    doc.line(cx, cy - r, cx, cy + r);
    doc.ellipse(cx, cy, 0.8, r, 'S');
    doc.ellipse(cx, cy, r, 0.8, 'S');
    return;
  }

  if (type === 'whatsapp') {
    doc.circle(cx, cy, r, 'S');

    doc.setFillColor('#FFFFFF');
    doc.triangle(
      cx - 1.1, cy + 1.55,
      cx - 0.35, cy + 0.9,
      cx - 1.25, cy + 0.75,
      'F'
    );

    doc.setLineWidth(0.48);
    doc.line(cx - 0.8, cy - 0.45, cx - 0.15, cy + 0.2);
    doc.line(cx - 0.15, cy + 0.2, cx + 0.75, cy + 0.55);
    doc.line(cx - 0.8, cy - 0.45, cx - 0.4, cy - 0.8);
    doc.line(cx + 0.75, cy + 0.55, cx + 1.0, cy + 0.08);
    return;
  }

  if (type === 'email') {
    const w = 5.0;
    const h = 3.2;

    doc.roundedRect(cx - w / 2, cy - h / 2, w, h, 0.42, 0.42, 'S');
    doc.line(cx - w / 2 + 0.2, cy - h / 2 + 0.2, cx, cy + 0.2);
    doc.line(cx + w / 2 - 0.2, cy - h / 2 + 0.2, cx, cy + 0.2);
    doc.line(cx - w / 2 + 0.2, cy + h / 2 - 0.2, cx - 0.7, cy + 0.08);
    doc.line(cx + w / 2 - 0.2, cy + h / 2 - 0.2, cx + 0.7, cy + 0.08);
  }
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
    consign_price: numberValue(payload.consign_price),
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
  if (['price', 'tier1_price', 'tier2_price', 'tier3_price', 'consign_price','discount', 'total_price', 'ongkos_kirim', 'cogs', 'amount', 'line_total'].includes(column)) return formatCurrency(value);
  if (['discount_value', 'qty', 'qty_change', 'transactions'].includes(column)) return formatNumber(value);
  if (['created_at', 'updated_at', 'revoked_at', 'removed_at'].includes(column) && value) return formatDateTime(value);
  return value ?? '';
}

function exportValue(value, column) {
  if (['price', 'tier1_price', 'tier2_price', 'tier3_price', 'consign_price','discount', 'total_price', 'ongkos_kirim', 'cogs', 'amount', 'line_total', 'discount_value', 'qty', 'qty_change', 'transactions'].includes(column)) return numberValue(value);
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
  // UI-only Sales column titles.
  if (value === 'sales_product') return 'SKU / Product';

  // Shorter and cleaner visible titles.
  if (value === 'sale_date') return 'Date';
  if (value === 'order_number') return 'Order No.';
  if (value === 'customer_name') return 'Customer';
  if (value === 'total_price') return 'Net Sales';

  // Existing custom titles.
  if (value === 'last_sold') return 'Last Sold';
  if (value === 'consign_price') return 'Consign Price';

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

function mergeUniqueSorted(...lists) {
  const values = new Set();

  lists.flat().forEach((value) => {
    const text = cleanText(value);
    if (text) values.add(text);
  });

  return [...values].sort((a, b) =>
    a.localeCompare(b, 'id-ID', {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

function setMapToObject(source) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, [...value].sort()]));
}