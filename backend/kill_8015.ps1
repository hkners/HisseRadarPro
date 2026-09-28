$p = Get-NetTCPConnection -LocalPort 8015 -State Listen -ErrorAction SilentlyContinue
if ($p) {
    Stop-Process -Id $p.OwningProcess -Force
    Write-Output "Killed process $($p.OwningProcess)"
} else {
    Write-Output "No process listening on 8015"
}
