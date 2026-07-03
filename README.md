# Sales & Stock Control v20

A mobile-first static web application for sales entry, stock management, stock transfer, movement tracking, sales reporting, and Excel export. The application uses GitHub Pages for hosting and Supabase for authentication, database storage, RLS, and transactional stock logic.

## Key Improvements in v20

- Free Sample category can use blank Order / Invoice Number.
- Blank Order / Invoice Number duplicates are allowed only for Free Sample.
- Non-Free Sample orders require Order / Invoice Number.
- Submitted non-Free Sample Order / Invoice Number cannot be reused.
- Draft edit pencil and X remove buttons are fixed.
- Sales Revoke button binding is fixed.
- Report chart is simplified, cleaner, and more readable.
- UI is designed to be mobile friendly across common resolutions.

## Features

- Google login through Supabase Auth.
- Sales order entry with multiple draft lines.
- Edit and remove draft lines before submission.
- All-or-nothing sales submit through PostgreSQL function.
- Automatic stock deduction on successful sales submit.
- Stock add/update by Location + SKU.
- SKU/Product smart sync and price prefill.
- Tier 1 / Tier 2 / Tier 3 pricing and WA Order auto-channel.
- Free Sample logic with blank reusable invoice.
- Stock transfer with validation.
- Sales revoke and stock return.
- Stock movement audit trail.
- Daily, weekly, and monthly report.
- Combo sales trend chart with amount bars and quantity line.
- XLSX export with numeric amount fields.

## Folder Structure

```text
index.html
assets/
  app.js
  styles.css
  config.template.js
database/
  schema.sql
docs/
  DEPLOYMENT_CHECKLIST.md
  VALIDATION_REPORT.md
.github/workflows/
  deploy-pages.yml
README.md
.gitignore
```

## Mobile-Friendly Design

v20 uses responsive CSS rules for smaller screens:

- Forms switch from two columns to one column.
- Tabs become horizontally scrollable.
- Buttons use touch-friendly height.
- Inputs use 16px font size to avoid mobile zoom.
- Dropdowns become bottom-sheet style on mobile.
- Tables use horizontal scrolling instead of layout overflow.
- Charts are scrollable on narrow screens.

## Business Rules

### Free Sample

If category is `Free Sample`, the Order / Invoice Number is automatically cleared before submit. Blank Order / Invoice Number is allowed and can be duplicated for Free Sample.

### Non-Free Sample

If category is not `Free Sample`, Order / Invoice Number is required. Once submitted, the same Order / Invoice Number cannot be reused again.

### Multi-Product Order

One submitted order can contain multiple different SKUs. Duplicate SKU inside the same draft order is blocked before submit.

### Revoke

Only active sales can be revoked. Revoke adds the sold quantity back to stock and records a stock movement.

## Deployment

1. Run `database/schema.sql` in Supabase SQL Editor.
2. Add GitHub secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Set GitHub Pages source to `GitHub Actions`.
4. Push to `main` or run the workflow manually.

The workflow creates `assets/config.js` automatically. Do not commit `assets/config.js`.

## Excel Export

Currency is displayed as `IDR` in the web table, but exported amount fields are real numeric values in Excel. This allows users to run SUM, pivot tables, charts, and formulas without cleaning text values.

## Test Plan

1. Add stock for one SKU.
2. Create sales draft with a normal category and Order / Invoice Number.
3. Submit the order.
4. Try submitting another order with the same Order / Invoice Number and confirm it is blocked.
5. Create Free Sample order with blank Order / Invoice Number and submit.
6. Repeat Free Sample with blank Order / Invoice Number and confirm it is allowed.
7. Click pencil on draft row and confirm edit works.
8. Click X on draft row and confirm delete works.
9. Revoke an active sale and confirm stock returns.
10. Load report and confirm chart renders.
11. Export XLSX and confirm amount columns are numeric.
