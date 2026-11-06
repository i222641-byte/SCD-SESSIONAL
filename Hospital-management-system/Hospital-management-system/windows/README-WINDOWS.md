# Hospital Appointment System – Windows Deployment

## Architecture
```
Browser ──► http://<server-ip>:80 ──► Nginx (C:\nginx)
                                        ├── /            → React build  (C:\nginx\html\hospital)
                                        ├── /api/*       → 127.0.0.1:4001 (Express, PM2 "22i-2641")
                                        └── /health      → 127.0.0.1:4001
Port 4001 is bound to 127.0.0.1 and blocked in Windows Firewall → not reachable from browsers.
```

## Prerequisites
1. Node.js 20 LTS – https://nodejs.org (tick "Add to PATH")
2. Nginx for Windows – download the zip from https://nginx.org/en/download.html and extract so that `C:\nginx\nginx.exe` exists
3. Port 80 free: stop IIS if installed → `iisreset /stop` or `Stop-Service W3SVC`

## Automatic deployment (PowerShell as Administrator)
```powershell
cd C:\HospitalApp            # folder containing backend\ frontend\ windows\
Set-ExecutionPolicy -Scope Process Bypass
.\windows\deploy.ps1
.\windows\verify.ps1
```

## Manual steps (same thing, one command at a time)
```powershell
# 1. Frontend
cd C:\HospitalApp\frontend
npm ci
npm run build
mkdir C:\nginx\html\hospital -Force
Copy-Item .\dist\* C:\nginx\html\hospital -Recurse -Force

# 2. Backend in PM2 as 22i-2641
npm install -g pm2
cd C:\HospitalApp\backend
npm install
pm2 start ecosystem.config.cjs
pm2 save
pm2 list

# 3. Nginx
Copy-Item C:\HospitalApp\windows\nginx.conf C:\nginx\conf\nginx.conf -Force
cd C:\nginx
.\nginx.exe -t
start nginx            # later changes: .\nginx.exe -s reload

# 4. Firewall
New-NetFirewallRule -DisplayName "Hospital HTTP 80"    -Direction Inbound -Protocol TCP -LocalPort 80   -Action Allow
New-NetFirewallRule -DisplayName "Hospital Block 4001" -Direction Inbound -Protocol TCP -LocalPort 4001 -Action Block

# 5. Auto-start on boot (Task Scheduler, runs before anyone logs in)
mkdir C:\hospital-startup -Force
Copy-Item C:\HospitalApp\windows\start-hospital.cmd C:\hospital-startup\
schtasks /Create /TN HospitalAppStartup /SC ONSTARTUP /RL HIGHEST /RU %USERNAME% /RP * ^
  /TR "cmd /c set PATH=%PATH%;%APPDATA%\npm && C:\hospital-startup\start-hospital.cmd C:\HospitalApp\backend"
```
(The `schtasks` line is for **cmd**; in PowerShell use the deploy script's step 7.)

Simpler alternative for step 5 (starts at user **login**, not boot):
```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

## Verification checklist
| Requirement | Command / action |
|---|---|
| Frontend via IP on port 80 | open `http://<server-ip>/` |
| Doctors displayed | `curl http://<server-ip>/api/doctors` |
| New appointment appears | submit form → shows in *Appointment requests* table |
| API through same entry point | browser DevTools → Network → requests go to `<ip>/api/...` (port 80) |
| Backend port not exposed | `curl http://<server-ip>:4001/api/doctors` → fails |
| Process 22i-2641 | `pm2 list` / `pm2 describe 22i-2641` |
| Crash recovery | `pm2 describe 22i-2641` (note PID) → `taskkill /F /PID <pid>` → `pm2 list` shows new PID, restarts +1 |
| Boot auto-start | `Restart-Computer` → don't run anything → open `http://<server-ip>/`, `pm2 list` |
