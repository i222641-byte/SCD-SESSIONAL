# FastBite – Deployment & Release Report

**Prepared for:** Bilal Ahmed (CTO) · **Role:** DevOps / Software Engineer
**Goal:** FastBite must not depend on any one person's memory or laptop.

This report is written as a runbook: a new engineer should be able to rebuild
and run the whole platform from this file alone.

---

## 1. What was wrong

| # | Problem found | Risk | Fix |
|---|---|---|---|
| 1 | Six services started by hand in six terminal windows | Closing a window / laptop stops the shop; nobody else knows the commands | **PM2** process file (`ecosystem.config.js`) starts all six with one command, restarts crashes, starts on boot |
| 2 | Config files with passwords committed to the repo | Anyone with repo access has the DB password; it stays in git history forever | Secrets moved to **`.env` (git-ignored)**; only `.env.example` (no real values) is committed; password rotated |
| 3 | Services found each other via `http://localhost:xxxx` hard-coded defaults | Breaks as soon as a service runs in a container or on another machine | All addresses come from env vars using **hostnames** (`http://menu-service:3001`); code refuses to start if not configured |
| 4 | `api-gateway` folder was nested inside `inventory-service/` | Inventory image/build would contain the gateway; gateway can't be built on its own | Moved to top-level `api-gateway/` – each service is now an independent folder |
| 5 | No build or release process | "Works on my laptop"; no record of what version is running | **GitHub Actions** builds a fresh Docker image for every service on every merge to `main` |
| 6 | `.gitignore` only ignored `node_modules` | `.env`, logs could be committed | Extended `.gitignore`, plus `.dockerignore` per service |

---

## 2. Architecture

```
 Mobile app
     │  HTTP
     ▼
 api-gateway :3000  ──►  menu-service      :3001 ─┐
 (no database)      ──►  order-service     :3002 ─┤      ┌─ fastbite_menu
                    ──►  inventory-service :3003 ─┼──►  MongoDB ─ fastbite_orders
                    ──►  customer-service  :3004 ─┤  (one server) ─ fastbite_inventory
                    ──►  payment-service   :3005 ─┘      ├─ fastbite_customers
                                                         └─ fastbite_payments
 order-service → menu, inventory, customer   ·   payment-service → order-service
```

Loyalty rule (order-service): `points = floor(total / 10)`. Example: Hamza (C-1042, 150 pts)
orders Zinger Burger Rs 450 + Fries Rs 200 = Rs 650 → **+65 pts → 215 pts → free drink unlocked (≥200)**.

---

## 3. Repository layout

```
fastbite/
├── .github/workflows/build-and-publish.yml   CI/CD – image per service
├── api-gateway/        index.js package*.json Dockerfile .dockerignore
├── menu-service/       "
├── order-service/      "
├── inventory-service/  "
├── customer-service/   "
├── payment-service/    "
├── scripts/add-hosts.ps1     maps service names → this machine (Windows)
├── scripts/smoke-test.ps1    end-to-end test (Hamza order + payment)
├── ecosystem.config.js       PM2: all six services, ports, restart policy
├── docker-compose.yml        same platform with containers + MongoDB
├── .env.example              configuration template (NO real secrets)
├── .gitignore
└── REPORT.md                 this file
```

---

## 4. Configuration and secrets

* Every service reads **only** environment variables. Missing `MONGO_URI` or a service URL
  → the service prints `Missing required environment variable …` and exits (fail fast, no silent localhost).
* `PORT` is set explicitly per service in `ecosystem.config.js` / `docker-compose.yml`
  (3000 gateway, 3001 menu, 3002 order, 3003 inventory, 3004 customer, 3005 payment).
* Real values live in `.env` on the server only. `.env` is in `.gitignore` and `.dockerignore`,
  so it is never committed and never copied into an image.
* MongoDB credentials: user `fastbite_app` with `readWrite` on the five FastBite databases only (least privilege).
* CI needs **no stored secret**: publishing uses GitHub's automatic `GITHUB_TOKEN`.
* The password that was previously committed must be considered leaked → **rotated** (new password in `.env`).
  For a full clean-up, history can be rewritten with `git filter-repo` / BFG, but rotation is what actually makes it safe.

---

## 5. Running with PM2 (Windows server)

### 5.1 One-time machine setup
1. Install **Node.js 20 LTS** and **Git for Windows**.
2. Install **MongoDB Community Server** (tick *Install as a Service* → it starts on boot) and **mongosh**.
3. Create the application user (in `mongosh`):
   ```js
   use admin
   db.createUser({ user: "fastbite_app", pwd: "<strong-password>", roles: [
     { role: "readWrite", db: "fastbite_menu" },     { role: "readWrite", db: "fastbite_orders" },
     { role: "readWrite", db: "fastbite_inventory" },{ role: "readWrite", db: "fastbite_customers" },
     { role: "readWrite", db: "fastbite_payments" } ] })
   ```
4. Turn on authentication: edit `C:\Program Files\MongoDB\Server\<ver>\bin\mongod.cfg`, add
   ```yaml
   security:
     authorization: enabled
   ```
   then `Restart-Service MongoDB`.
5. `npm install -g pm2`
6. As Administrator: `.\scripts\add-hosts.ps1` (maps `mongodb`, `menu-service`, … to this machine).

### 5.2 Deploy / update
```powershell
git clone https://github.com/<owner>/fastbite.git ; cd fastbite      # or: git pull
copy .env.example .env      # then edit .env – set MONGO_HOST=mongodb:27017 and the real password
foreach ($s in "api-gateway","menu-service","order-service","inventory-service","customer-service","payment-service") { Push-Location $s; npm ci --omit=dev; Pop-Location }
pm2 start ecosystem.config.js        # first time   (later: pm2 reload ecosystem.config.js)
pm2 save
```

### 5.3 Start on boot
```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

### 5.4 Day-to-day
| Task | Command |
|---|---|
| Status of all services | `pm2 list` |
| Logs | `pm2 logs order-service` (files in `logs/`) |
| Restart one | `pm2 restart payment-service` |
| Live CPU/memory | `pm2 monit` |
| Stop everything | `pm2 stop all` |

---

## 6. Running with Docker (alternative / production images)
```powershell
copy .env.example .env      # set MONGO_PASSWORD; keep hostnames as service names
docker compose up -d --build
docker compose ps
```
Only port 3000 (gateway) is published. Services resolve each other via Docker DNS
(`menu-service`, `mongodb`, …). MongoDB data persists in the `mongo-data` volume.

To run the images CI published instead of building locally:
`docker pull ghcr.io/<owner>/fastbite-menu-service:latest` (one per service).

---

## 7. CI/CD – automatic package for every service

File: `.github/workflows/build-and-publish.yml`

| Trigger | What happens |
|---|---|
| Pull request to `main` | All six services: `npm ci`, syntax check, Docker build. **Not** published – catches breakage before merge |
| Push / merge to `main` | Same, then each image is **pushed to ghcr.io** |
| Manual (`workflow_dispatch`) | Rebuild on demand |

* Matrix job = six parallel builds, one per service; `fail-fast: false` so one failure doesn't hide others.
* Tags: `sha-<short commit>` (traceable, rollback-able) and `latest`.
* Images: `ghcr.io/<owner>/fastbite-<service>` – visible under the repo's **Packages**.
* Permissions limited to `contents: read`, `packages: write`.
* Build cache per service (GitHub Actions cache) keeps builds fast.

Rollback: deploy a previous `sha-xxxxxxx` tag.

---

## 8. What Git and Docker must NOT contain (and how it's enforced)

| Must not | Enforced by |
|---|---|
| Passwords / `.env` files in git | `.gitignore`, `.env.example` only |
| `node_modules` in git or images | `.gitignore`, `.dockerignore`, `npm ci` inside the image |
| Secrets baked into images (`ENV PASSWORD=…`, copied `.env`) | `.dockerignore`; secrets only injected at run time |
| Running containers as root | `USER node` in every Dockerfile |
| Dev dependencies / random versions in images | `npm ci --omit=dev` from `package-lock.json`; pinned `node:20-alpine` |
| Database inside a service image | MongoDB is its own container / server with a volume |
| Publishing untested PRs | Push step only runs on `main` |
| Long-lived personal tokens in CI | Built-in `GITHUB_TOKEN` only |
| Exposing internal ports | Only gateway port 3000 published |
| Direct commits of broken code to `main` | Branch protection: require PR + passing workflow (Settings → Branches) |

---

## 9. Verification (done before hand-over)

| Check | How | Expected |
|---|---|---|
| All 6 processes up on correct ports | `pm2 list`, `curl http://localhost:300X/health` | `online`, `status: ok` |
| No localhost in code | `Select-String -Path */index.js -Pattern localhost` | no matches |
| No secrets in repo | `git grep -i password` | only `.env.example` placeholder |
| Fail fast | start a service without `.env` | "Missing required environment variable" |
| Crash recovery | `pm2 describe menu-service` → kill PID → `pm2 list` | new PID, restarts +1 |
| Business flow | `.\scripts\smoke-test.ps1` | order Rs 650, +65 pts, payment successful, status PAID |
| CI | merge to main → Actions tab | 6 green jobs, 6 packages in ghcr.io |

---

## 10. Commit history (meaningful, one change per commit)

1. `chore: import FastBite starter code`
2. `refactor: move api-gateway out of inventory-service into its own folder`
3. `security: remove committed config with credentials, ignore .env files`
4. `feat(config): read Mongo URI and service URLs from env, remove localhost defaults`
5. `docs: add .env.example configuration template`
6. `feat(pm2): add ecosystem file to run all six services with restart policy`
7. `feat(docker): add Dockerfile and .dockerignore for every service`
8. `feat(docker): add docker-compose with MongoDB and private network`
9. `ci: build and publish an image per service to GHCR on merge to main`
10. `chore(scripts): add hosts mapping and end-to-end smoke test`
11. `docs: add deployment and operations report`

## 11. Known limitations / next steps
* One MongoDB server is a single point of failure → replica set / managed Atlas.
* One shared app DB user → one user per service for stricter isolation.
* Add unit tests to the CI job; add a deploy job (e.g. SSH + `docker compose pull && up -d`).
