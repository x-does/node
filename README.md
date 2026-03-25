# x-does / node

Proof-of-concept Node app for `node.xdoes.space`.

## Why this exists

The previous machine direction was clear from the backup cron jobs:
- CEO chooses the highest-leverage bottleneck
- CTO ships the technical slice
- CFO pushes monetization
- CMO drives traffic and distribution

This repo is the new anchor for that direction.

The initial app is a lean deployment target for Hostinger that can become:
- a control surface for the operator loops
- a public-facing build / automation studio page
- a lead capture endpoint
- a status surface for revenue experiments

## Features in this first POC

- landing page at `/`
- health check at `/health`
- app status at `/api/status`
- lead capture at `POST /api/leads`
- lead inspection at `GET /api/leads/list`
- zero external dependencies
- file-based persistence in `data/leads.json`

## Run locally

```bash
npm start
```

Then open:
- `http://localhost:3000/`
- `http://localhost:3000/health`
- `http://localhost:3000/api/status`

## Deploy target

Primary intended target:
- `node.xdoes.space`

This app is designed to be simple enough for Hostinger Node deployment or Hostinger MCP-driven JS deployment.

## Next steps

1. add Hostinger MCP deployment metadata/status into the UI
2. add a queue for build requests and monetization experiments
3. let CEO/CTO/CFO/CMO cron loops publish progress here
4. add email notifications for new leads
5. connect analytics and affiliate/revenue signals
