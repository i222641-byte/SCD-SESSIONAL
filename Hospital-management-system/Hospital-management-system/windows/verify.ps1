# Part 5 - Testing and verification (run in PowerShell)
param([string]$IP)
if (-not $IP) {
  $IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
}
$Base = "http://$IP"
function Pass($m){ Write-Host "  [PASS] $m" -ForegroundColor Green }
function Fail($m){ Write-Host "  [FAIL] $m" -ForegroundColor Red }
Write-Host "Testing $Base"

Write-Host "1. Frontend on port 80"
try { $h = Invoke-WebRequest "$Base/" -UseBasicParsing; if ($h.Content -match 'id="root"') { Pass "index.html served" } else { Fail "unexpected page" } } catch { Fail $_ }

Write-Host "2. Doctors list via Nginx"
try { $d = Invoke-RestMethod "$Base/api/doctors"; Pass "$($d.Count) doctors: $($d.name -join ', ')" } catch { Fail $_ }

Write-Host "3. Health via Nginx"
try { $s = Invoke-RestMethod "$Base/health"; if ($s.status -eq "ok") { Pass "/health ok" } } catch { Fail $_ }

Write-Host "4. Submit appointment and confirm it is in the schedule"
$body = @{ patientName="Verify Test"; doctorId=2; date="2026-12-01"; time="11:30"; reason="Deployment test" } | ConvertTo-Json
try {
  $new = Invoke-RestMethod "$Base/api/appointments" -Method Post -ContentType "application/json" -Body $body
  $list = Invoke-RestMethod "$Base/api/appointments?patient=verify"
  if ($list.id -contains $new.id) { Pass "appointment #$($new.id) listed" } else { Fail "not listed" }
} catch { Fail $_ }

Write-Host "5. Backend port 4001 must NOT be reachable via server IP"
try { Invoke-WebRequest "http://${IP}:4001/api/doctors" -UseBasicParsing -TimeoutSec 3 | Out-Null; Fail "4001 is reachable" } catch { Pass "4001 refused on $IP" }

Write-Host "6. PM2 process 22i-2641"
pm2 describe 22i-2641 | Select-String "status|restarts|script path"

Write-Host "7. Boot task"
$t = Get-ScheduledTask -TaskName "HospitalAppStartup" -ErrorAction SilentlyContinue
if ($t) { Pass "HospitalAppStartup task registered (trigger: AtStartup)" } else { Fail "boot task missing" }
