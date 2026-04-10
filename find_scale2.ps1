$iface = "Ethernet"

Write-Output "=== Trying common scale factory subnets ==="
Write-Output "Setting temporary static IPs on Ethernet to probe each subnet..."

$subnets = @(
    @{ ip = "192.168.1.2";   mask = "255.255.255.0"; targets = @("192.168.1.1", "192.168.1.100", "192.168.1.200", "192.168.1.10") },
    @{ ip = "192.168.0.2";   mask = "255.255.255.0"; targets = @("192.168.0.1", "192.168.0.100", "192.168.0.200", "192.168.0.10") },
    @{ ip = "192.168.2.2";   mask = "255.255.255.0"; targets = @("192.168.2.1", "192.168.2.100", "192.168.2.200") },
    @{ ip = "10.0.0.2";      mask = "255.255.255.0"; targets = @("10.0.0.1", "10.0.0.100", "10.0.0.200", "10.0.0.10") },
    @{ ip = "10.10.10.2";    mask = "255.255.255.0"; targets = @("10.10.10.1", "10.10.10.100", "10.10.10.200") },
    @{ ip = "172.16.0.2";    mask = "255.255.255.0"; targets = @("172.16.0.1", "172.16.0.100") },
    @{ ip = "10.1.1.2";      mask = "255.255.255.0"; targets = @("10.1.1.1", "10.1.1.100", "10.1.1.3") }
)

$foundIP = $null

foreach ($sub in $subnets) {
    Write-Output "`nProbing subnet $($sub.ip)/$($sub.mask)..."
    netsh interface ip set address $iface static $sub.ip $sub.mask | Out-Null
    Start-Sleep -Seconds 2

    foreach ($target in $sub.targets) {
        $result = ping $target -n 1 -w 1000
        if ($LASTEXITCODE -eq 0) {
            Write-Output "  >>> FOUND SCALE at $target <<<"
            $foundIP = $target

            Write-Output "  Checking common ports..."
            foreach ($port in @(4001, 8000, 9100, 3001, 23, 80, 10001, 1234, 5000, 502)) {
                try {
                    $tcp = New-Object System.Net.Sockets.TcpClient
                    $ar = $tcp.BeginConnect($target, $port, $null, $null)
                    $success = $ar.AsyncWaitHandle.WaitOne(1500)
                    if ($success) {
                        Write-Output "    Port $port - OPEN"
                        $tcp.Close()
                    }
                } catch {}
            }
            break
        }
    }
    if ($foundIP) { break }
}

Write-Output "`n=== Restoring Ethernet to DHCP ==="
netsh interface ip set address $iface dhcp | Out-Null

if ($foundIP) {
    Write-Output "`nSCALE FOUND at: $foundIP"
    Write-Output "You need to set a static IP on your Ethernet adapter in the same subnet to connect."
} else {
    Write-Output "`nScale not found on common subnets."
    Write-Output "The scale may need to be configured or may use an unusual IP."
}
