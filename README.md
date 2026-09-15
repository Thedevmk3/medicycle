# Medicycle

A responsive medical-equipment marketplace prototype for acquiring retired devices, assessing refurbishment potential and recovering usable parts.

## Run locally

No build step or package installation is required. From the repository root:

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173.

## Included

- Searchable sample inventory with category, condition and price filters
- Saved equipment and detailed listing dialogs
- Seller assessment form with validation and local photo previews
- Acquisition pipeline and sample offer acceptance
- Original 3D-style device renders and an exploded component explorer
- Responsive layouts, keyboard-accessible controls and optional WebMCP tools

## Prototype boundaries

Inventory, prices and acquisition records are demonstration data. Saved items and submitted assessments are held only in memory and reset on reload. Photo previews stay in the browser; no uploads, messages, payments or pickups are sent or arranged. Authentication and a shared database are not connected.

Device images are AI-generated conceptual illustrations, not manufacturer-specific CAD or service instructions. Sample refurbishment labels do not certify actual equipment.

## Next phase

Connect Supabase authentication, database records, role-based access and image storage. Define seller and assessor permissions before accepting real submissions. Add inspected-unit documentation, real equipment photography, quote management and collection scheduling as production workflows.

## Files

- `dist/index.html`: application views
- `dist/style.css`: responsive design
- `dist/app.js`: sample data and interactions
- `dist/assets/`: generated device artwork
- `.openai/hosting.json`: private Sites deployment configuration

The static `dist` directory can also be hosted by any static website provider.
