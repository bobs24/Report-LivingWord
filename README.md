# Sales & Stock Control v21 Simple Stable

This version simplifies the frontend into two primary runtime files: `index.html`, `assets/styles.css`, and `assets/app.js`.

## Included Features

- Google login through Supabase Auth.
- Sales order draft with edit pencil and remove X.
- Full sales order submit through Supabase RPC.
- Free Sample can use blank Order / Invoice Number.
- Non-Free Sample requires Order / Invoice Number.
- Stock management by Location + SKU.
- Stock transfer.
- Sales revoke.
- Stock movement history.
- Daily, weekly, and monthly reports.
- Cleaner SVG combo chart.
- XLSX export with numeric amount values.
- Mobile-friendly layout, scrollable tabs, bottom-sheet dropdown, and responsive tables.

## Deployment

1. Make sure GitHub Pages source is `GitHub Actions`.
2. Add repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Push to `main`.
4. GitHub Actions generates `assets/config.js` automatically.

## Important

Do not manually edit generated `assets/config.js` in GitHub Pages deployment. Use GitHub Actions secrets instead.
