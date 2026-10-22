# QEYRO FI app

The web app for QEYRO FI: a threat monitor, Security Hooks management, post-quantum preparation tools, a recovery center, developer tools and documentation.

Built with Vite, React, TypeScript and viem. There is no backend: everything is read from the chain through your wallet or RPC.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build in dist/
```

## Honest by design

- No contract addresses ship with the app. Until you add them in **Settings → Contract addresses**, every on-chain panel shows **Not deployed** instead of data.
- Threat levels, events and statuses come from real contract reads. Nothing is generated or randomised.
- A transaction is reported successful only after a mined receipt with success status. Before sending, the app simulates it and shows the calldata.
- Post-quantum (ML-DSA-44) keys are generated in your browser. They are never transmitted. The only export is a passphrase-encrypted file you choose to download.

## Routes

| Route | Page |
| --- | --- |
| `/` | Landing page with deployment status and live monitor |
| `/docs` | Documentation |
| `/app` | Dashboard |
| `/app/protect` | Asset protection and post-quantum tools |
| `/app/hooks` | Security Hooks management |
| `/app/monitor` | Threat monitor |
| `/app/build` | Developer tools |
| `/app/recovery` | Recovery center |
| `/app/settings` | Network, RPC, addresses, notifications |

## Project layout

```
src/
  abi/          contract ABIs (generated from qeyro-fi-contracts)
  components/   layout chrome, UI primitives, transaction dialog
  lib/          chain, wallet, settings, hook catalogue, ML-DSA helpers
  pages/        landing, docs, and /app pages
  styles/       global CSS tokens
```

Refresh the ABIs after changing contracts: run `npm run export-abi` in `qeyro-fi-contracts` and copy its output to `src/abi/generated.ts`.

## Logo

Put your logo at `public/logo.png` (square, at least 400x400). Without it the app shows an SVG mark.

## Deploy

See `docs/DEPLOY.md`. A `vercel.json` with single-page-app rewrites is included.

## License

MIT. See `LICENSE`.
