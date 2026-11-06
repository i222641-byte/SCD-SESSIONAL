# Run as Administrator. Maps FastBite service names to this machine so that
# services find each other by NAME (http://menu-service:3001), not "localhost".
# If a service later moves to another server, change only its IP here (or in .env).
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$names = "mongodb","api-gateway","menu-service","order-service","inventory-service","customer-service","payment-service"
$current = Get-Content $hosts -ErrorAction SilentlyContinue
foreach ($n in $names) {
  if (-not ($current -match "\s$n(\s|$)")) {
    Add-Content -Path $hosts -Value "127.0.0.1`t$n"
    Write-Host "added $n"
  } else { Write-Host "exists $n" }
}
ipconfig /flushdns | Out-Null
