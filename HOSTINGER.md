# Hostinger Node App Deploy Notes

This repo is prepared to run as a Hostinger Node.js app on `node.xdoes.space`.

## Runtime assumptions
- Node.js app deployment (Hostinger)
- Start command: `npm start`
- Host: `0.0.0.0`
- Port: provided by Hostinger via `PORT`

## Required settings
Set these environment variables in Hostinger:

- `PORT` → provided by Hostinger or leave managed by platform
- `HOST=0.0.0.0`
- `APP_NAME=node.xdoes.space`

Optional:
- `LEADS_FILE` → custom writable storage path if you want lead data somewhere else

## App entrypoint
- `src/index.js`

## Package scripts
- `npm start`
- `npm run dev`

## Health checks
- `/health`
- `/api/status`

## Post-deploy verification
Run these after the app is live:

```bash
curl https://node.xdoes.space/health
curl https://node.xdoes.space/api/status
curl -X POST https://node.xdoes.space/api/leads \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sav","email":"savusavuuu@gmail.com","idea":"Hostinger deploy verification"}'
```

## Important note about persistence
This proof of concept stores leads in a local JSON file. That is fine for a first deploy, but long-term we should move leads to:
- SQLite / Postgres / MySQL
- or a remote API/storage service

## Recommended next iteration
1. Deploy this version
2. Confirm `node.xdoes.space` is healthy
3. Move lead storage to durable DB
4. Add cron/agent publishing endpoints
5. Connect Hostinger MCP deployment metadata
