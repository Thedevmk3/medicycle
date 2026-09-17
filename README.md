# Medicycle

A responsive medical-equipment marketplace prototype for acquiring retired devices, assessing refurbishment potential and recovering usable parts.

## Run locally

No build step or package installation is required. From the repository root:

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173.

## Included

- Seller-first homepage with eligibility guidance and a staged acquisition journey
- Short seller enquiries with multiple device types, photo previews and inventory attachments
- Seller request tracking, technical follow-up, document attachments and sample quote acceptance
- Separate staff demo with status history, inspection notes, collection details and final disposition
- Internal acquisition, transport, parts and labour estimates with expected contribution calculation
- Enquiry-led category catalogue with search, saved devices and recorded demo buying enquiries
- Four distinct exploded illustrations: patient monitor, infusion pump, centrifuge and defibrillator
- Responsive layouts and validated optional WebMCP catalogue/enquiry actions

## Prototype boundaries

Inventory, prices and acquisition records are demonstration data. Saved items and submitted assessments are held only in memory and reset on reload. Photos and inventory/document attachments stay in memory in the browser tab and can be downloaded during that session; no server uploads, messages, payments or pickups are sent or arranged. The staff view is explicitly a public demo, not a protected admin area. Authentication and a shared database are not connected.

Device images are AI-generated conceptual illustrations, not manufacturer-specific CAD or service instructions. Device categories do not represent live stock or certified equipment. Medicycle remains a working name; this prototype is not affiliated with the Australian reference business.

## Next phase

Connect Supabase authentication, database records, role-based access and image storage. Define seller and assessor permissions before accepting real submissions. Add inspected-unit documentation, real equipment photography, quote management and collection scheduling as production workflows.

## Files

- `dist/index.html`: application views
- `dist/style.css`: responsive design
- `dist/app.js`: sample data and interactions
- `dist/assets/`: generated device artwork
- `.openai/hosting.json`: private Sites deployment configuration

The static `dist` directory can also be hosted by any static website provider.

## Vercel deployment

Import this repository with the Root Directory set to the repository root.
The included `vercel.json` selects the Other framework preset, skips the build
step and serves `dist`. Deploy the latest `main` commit. No environment variables
or install step are required for this prototype.
