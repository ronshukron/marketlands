$scaleIface = "Ethernet"
$otherIface = "Ethernet 3"

Write-Output "=== Temporarily disabling $otherIface to avoid routing conflicts ==="
netsh interface set interface $otherIface admin=disable
Start-Sleep -Seconds 2

$allSubnets = @(
    @{ ip = "192.168.0.2";   mask = "255.255.255.0"; prefix = "192.168.0" },
    @{ ip = "192.168.1.2";   mask = "255.255.255.0"; prefix = "192.168.1" },
    @{ ip = "192.168.2.2";   mask = "255.255.255.0"; prefix = "192.168.2" },
    @{ ip = "10.0.0.2";      mask = "255.255.255.0"; prefix = "10.0.0" },
    @{ ip = "10.10.10.2";    mask = "255.255.255.0"; prefix = "10.10.10" },
    @{ ip = "10.1.1.2";      mask = "255.255.255.0"; prefix = "10.1.1" },
    @{ ip = "172.16.0.2";    mask = "255.255.255.0"; prefix = "172.16.0" },
    @{ ip = "172.16.1.2";    mask = "255.255.255.0"; prefix = "172.16.1" }
)

$foundIP = $null

foreach ($sub in $allSubnets) {
    Write-Output "`nScanning $($sub.prefix).x ..."
    netsh interface ip set address $scaleIface static $sub.ip $sub.mask | Out-Null
    Start-Sleep -Seconds 2
    
    $ipOk = ipconfig | Select-String $sub.ip
    if (-not $ipOk) {
        Write-Output "  (IP not assigned, skipping)"
        continue
    }

    for ($i = 1; $i -le 254; $i++) {
        $target = "$($sub.prefix).$i"
        if ($target -eq $sub.ip) { continue }
        ping $target -n 1 -w 150 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Output "  >>> FOUND: $target <<<"
            $foundIP = $target
            
            Write-Output "  Scanning ports on $target ..."
            foreach ($port in @(23, 80, 443, 502, 1234, 3000, 3001, 4001, 4002, 5000, 7700, 8000, 8080, 8899, 9100, 10001, 20108)) {
                try {
                    $tcp = New-Object System.Net.Sockets.TcpClient
                    $ar = $tcp.BeginConnect($target, $port, $null, $null)
                    $ok = $ar.AsyncWaitHandle.WaitOne(1500)
                    if ($ok -and $tcp.Connected) {
                        Write-Output "    Port $port - OPEN"
                        $tcp.Close()
                    }
                } catch {}
            }
        }
    }
    if ($foundIP) { break }
}

Write-Output "`n=== Restoring network ==="
netsh interface ip set address $scaleIface dhcp | Out-Null
netsh interface set interface $otherIface admin=enable
Start-Sleep -Seconds 2

if ($foundIP) {
    Write-Output "`n*** SCALE FOUND AT: $foundIP ***"
} else {
    Write-Output "`nScale not found on any common subnet."
}
Write-Output "Network restored."
