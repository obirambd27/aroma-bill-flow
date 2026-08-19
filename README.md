# Bloom Billing

Build a web application called "Fragrance Billing" — a billing and inventory management app for a perfume retail business.

CORE CONCEPT:

This app lets the business owner create sales bills quickly, with products, prices, and stock levels pulled from their Zoho Books account. When a bill is finalized, stock is automatically deducted. All bill history, customer data, and sales reports live inside this app's own database — Zoho Books is only used as the source for product/stock data and receives lightweight stock adjustments (never full invoices).

TECH REQUIREMENTS:

- Use Supabase as the backend (database + auth + edge functions)

- Single-user app — one owner account, no multi-user roles needed for now

- Fully responsive design (desktop, tablet, mobile)

- Must be installable as a PWA (Progressive Web App) — works like a native app on both desktop and mobile after "Add to Home Screen" / install

- Clean, minimal, professional UI — this is a real business tool used daily, not a demo app

NOTE ON EXTERNAL API:

This app will eventually connect to the Zoho Books API for product sync, customer sync, and stock adjustments. I do NOT have my Zoho API credentials yet. For now, build all screens and local functionality using placeholder/mock data where Zoho data would normally appear, and leave clearly marked spots (e.g. Settings page fields, sync buttons) for me to wire up the real Zoho connection later via Supabase Edge Functions. Do not block core app functionality (billing, history, dashboard) on Zoho being connected — the app must work standalone with local data until I add the API keys.

Do not start building yet — wait for the next part of this brief which will cover design direction and branding.

DESIGN DIRECTION for Fragrance Billing:

Overall feel: minimal, clean, premium — this is a perfume brand, so the UI should feel a little elevated, not generic SaaS-template look.

COLOR PALETTE:

- Base: white / very light neutral gray background (#FAFAFA or similar)

- Text: near-black for primary text, medium gray for secondary/muted text

- One accent color used sparingly for buttons, active states, highlights — use a deep, elegant tone (e.g. a muted gold, deep plum, or emerald — pick one that feels premium/perfume-brand appropriate) rather than a generic blue

- Success (paid/synced) = green, Warning (low stock/pending sync) = amber, Error (failed sync/void) = red — used only as small status indicators, not large blocks of color

TYPOGRAPHY:

- Clean sans-serif font (e.g. Inter, or a similar modern grotesk)

- Large, bold, legible numbers wherever totals/prices appear — the billing screen especially needs numbers that are easy to read at a glance

- Clear visual hierarchy: page titles, section headers, and body text should be clearly differentiated by size/weight, not just color

LAYOUT:

- Sidebar navigation on desktop (collapsible), bottom tab navigation on mobile

- Navigation items: Dashboard, New Bill, Products, Customers, Bill History, Settings

- Card-based layout for dashboard stats and list views — generous padding, soft rounded corners (not sharp, not overly rounded), subtle shadows instead of heavy borders

- Avoid visual clutter: no unnecessary icons, no gradient backgrounds, no busy patterns

- Consistent spacing system (e.g. 8px base spacing scale) throughout

COMPONENTS:

- Buttons: solid accent color for primary actions (e.g. "Finalize Bill"), outline/ghost style for secondary actions (e.g. "Save as Draft", "Cancel")

- Tables: clean row dividers, hover state on rows, no heavy borders

- Forms: clearly labeled fields, generous input height for easy tapping on mobile

- Empty states (e.g. no bills yet, no products synced) should have a friendly icon + short message + call-to-action button, not just a blank screen

This design system should be applied consistently across every screen built in the following parts of this brief.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://aroma-bill-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4e85688d-03ba-4f8b-8441-c9cb0a2ffef5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
