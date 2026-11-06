# Hospital Appointment Management System - Windows deployment
# Prerequisites: Node.js 20+ installed, Nginx for Windows extracted to C:\nginx
# Run in PowerShell AS ADMINISTRATOR from the Hospital-management-system folder:
#     Set-ExecutionPolicy -Scope Process Bypass
#     .\windows\deploy.ps1

$ErrorActionPreference = "Stop"
$AppDir   = Split-Path -Parent $PSScriptRoot
$Backend  = Join-Path $AppDir "backend"
$Frontend = Join-Path $AppDir "frontend"
$Nginx    = "C:\nginx"
$WebRoot  = "$Nginx\html\hospital"
$ProcName = "22i-2641"

if (-not (Test-Path "$Nginx\nginx.exe")) { throw "Nginx not found at $Nginx. Extract nginx zip to C:\nginx first." }

Write-Host "==> 1. Installing PM2 globally"
npm install -g pm2

Write-Host "==> 2. Building React frontend"
Push-Location $Frontend
npm ci
npm run build
Pop-Location
if (Test-Path $WebRoot) { Remove-Item $WebRoot -Recurse -Force }
New-Item -ItemType Directory -Path $WebRoot | Out-Null
Copy-Item "$Frontend\dist\*" $WebRoot -Recurse

Write-Host "==> 3. Installing backend dependencies"
Push-Location $Backend
npm install --omit=dev

Write-Host "==> 4. Starting backend in PM2 as '$ProcName'"
$ErrorActionPreference = "Continue"; pm2 delete $ProcName *> $null; $ErrorActionPreference = "Stop"
pm2 start ecosystem.config.cjs
pm2 save
Pop-Location

Write-Host "==> 5. Configuring Nginx on port 80"
Copy-Item "$PSScriptRoot\nginx.conf" "$Nginx\conf\nginx.conf" -Force
Push-Location $Nginx
.\nginx.exe -t
if (Get-Process nginx -ErrorAction SilentlyContinue) { .\nginx.exe -s reload } else { Start-Process -FilePath ".\nginx.exe" -WorkingDirectory $Nginx -WindowStyle Hidden }
Pop-Location

Write-Host "==> 6. Firewall: allow port 80, block port 4001"
Remove-NetFirewallRule -DisplayName "Hospital HTTP 80" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Hospital Block 4001" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Hospital HTTP 80"    -Direction Inbound -Protocol TCP -LocalPort 80   -Action Allow | Out-Null
New-NetFirewallRule -DisplayName "Hospital Block 4001" -Direction Inbound -Protocol TCP -LocalPort 4001 -Action Block | Out-Null

Write-Host "==> 7. Registering auto-start at Windows boot (Task Scheduler)"
$StartupDir = "C:\hospital-startup"
New-Item -ItemType Directory -Path $StartupDir -Force | Out-Null
Copy-Item "$PSScriptRoot\start-hospital.cmd" "$StartupDir\start-hospital.cmd" -Force
$NpmBin = (npm prefix -g)
$User   = "$env:USERDOMAIN\$env:USERNAME"
$Cred   = Get-Credential -UserName $User -Message "Windows password for $User (task runs at boot even before login)"
$Action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c set PATH=%PATH%;$NpmBin && `"$StartupDir\start-hospital.cmd`" `"$Backend`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Unregister-ScheduledTask -TaskName "HospitalAppStartup" -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "HospitalAppStartup" -Action $Action -Trigger $Trigger -Settings $Settings `
    -User $User -Password $Cred.GetNetworkCredential().Password -RunLevel Highest | Out-Null

$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "Deployment complete. Open http://$IP/ in a browser."
Write-Host "Verify with: .\windows\verify.ps1"
