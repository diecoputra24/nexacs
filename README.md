# NexaACS --- Broadband CPE/ONT Management Platform

Modular monolith implementation of **NexaACS** (TR-069 CWMP + TR-369 USP) built according to [NexACS-Product-Plan-Technical-Blueprint.md](NexACS-Product-Plan-Technical-Blueprint.md).

## Architecture

### Backend Binaries (Go)
- `cmd/api` -> `nexaacs-api`: REST API (`/api/v1`), RBAC auth, dashboard aggregation, WebSocket hub (`/ws/v1/events`).
- `cmd/cwmp` -> `nexaacs-cwmp`: TR-069 HTTP/SOAP CWMP server (`/cwmp`), session lifecycle manager, Connection Request dispatcher.
- `cmd/usp` -> `nexaacs-usp`: TR-369 USP Controller & MTP abstraction foundation.
- `cmd/worker` -> `nexaacs-worker`: PostgreSQL-backed task queue worker, summon orchestration, retry/timeout handling, firmware rollout, retention cleanup.

### Frontend (`nexaacs-web/`)
- React + TypeScript + Vite + Material UI + Apache ECharts + TanStack Query + Zustand.
- Includes an integrated **Stateful Dev/Simulator Engine** so the full UI (Overview, Devices, Device Detail, Summon, Faults, Firmware, Security, Settings, Audit Logs, CWMP Inform Simulation) runs immediately in local development without requiring PostgreSQL/Redis, while targeting `/api/v1` and `/ws/v1/events` when connected to the Go backend.

## Local Development (Frontend + Simulator)
```bash
cd nexaacs-web
npm install
npm run dev
```

## Production Build & Ubuntu Deployment (Without Docker)
See `deployments/systemd/`, `deployments/nginx/nexaacs.conf`, and `scripts/deploy.sh`.
1. Apply PostgreSQL migrations in `migrations/`.
2. Build Go binaries (`make build`) and frontend static bundle (`make frontend-build`).
3. Deploy to `/opt/nexaacs/` and manage services via `systemd`.
