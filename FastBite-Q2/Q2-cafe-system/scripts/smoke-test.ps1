# End-to-end check through the gateway: Hamza orders a burger + fries (Rs 650),
# earns 65 points (1 per Rs 10), pays, and the order becomes PAID.
param([string]$Gateway = "http://localhost:3000")
$ErrorActionPreference = "Stop"

"--- health of all services ---"
foreach ($p in 3000..3005) { try { (Invoke-RestMethod "http://localhost:$p/health") | Format-List } catch { "port $p DOWN" } }

"--- menu ---"
Invoke-RestMethod "$Gateway/menu" | Format-Table

$before = Invoke-RestMethod "$Gateway/customers/C-1042"
"Hamza points before: $($before.loyaltyPoints)"

$body = @{ customerId = "C-1042"; items = @(@{ itemId = "M-101"; quantity = 1 }, @{ itemId = "M-102"; quantity = 1 }) } | ConvertTo-Json -Depth 5
$order = Invoke-RestMethod "$Gateway/orders" -Method Post -ContentType "application/json" -Body $body
"Order $($order.orderId) total Rs $($order.total), points earned $($order.pointsEarned)"

$after = Invoke-RestMethod "$Gateway/customers/C-1042"
"Hamza points after: $($after.loyaltyPoints)  (expected $($before.loyaltyPoints + 65))  free drink: $($after.freeDrinkUnlocked)"

$pay = Invoke-RestMethod "$Gateway/payments" -Method Post -ContentType "application/json" -Body (@{ orderId = $order.orderId; amount = $order.total } | ConvertTo-Json)
"Payment: $($pay.message) $($pay.paymentId)"
"Order status now: $((Invoke-RestMethod "$Gateway/orders/$($order.orderId)").status)"
