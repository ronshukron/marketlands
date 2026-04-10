$iface = "Ethernet"
$routerMAC = "00-d1-e6-e6-e6-e6"

Write-Output "=== Setting Ethernet to 192.168.0.2 to do a full subnet scan ==="
netsh interface ip set address $iface static 192.168.0.2 255.255.255.0 | Out-Null
Start-Sleep -Seconds 3

Write-Output "=== Scanning all 192.168.0.x addresses (excluding known devices) ==="
for ($i = 1; $i -le 254; $i++) {
    $ip = "192.168.0.$i"
    if ($ip -eq "192.168.0.2" -or $ip -eq "192.168.0.100") { continue }
    $result = ping $ip -n 1 -w 200 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Output "  Responding: $ip"
    }
}

Write-Output "`n=== ARP entries on Ethernet interface (169.254/192.168 adapter) ==="
arp -a -N 192.168.0.2

Write-Output "`n=== ARP entries on Ethernet 3 interface ==="
arp -a -N 192.168.0.100

Write-Output "`n=== Now trying other subnets ==="
$otherSubnets = @(
    @{ ip = "10.0.0.2";      mask = "255.255.255.0"; scan_prefix = "10.0.0" },
    @{ ip = "10.10.10.2";    mask = "255.255.255.0"; scan_prefix = "10.10.10" },
    @{ ip = "192.168.1.2";   mask = "255.255.255.0"; scan_prefix = "192.168.1" },
    @{ ip = "192.168.2.2";   mask = "255.255.255.0"; scan_prefix = "192.168.2" }
)

foreach ($sub in $otherSubnets) {
    Write-Output "`nProbing $($sub.scan_prefix).x ..."
    netsh interface ip set address $iface static $sub.ip $sub.mask | Out-Null
    Start-Sleep -Seconds 2
    
    for ($i = 1; $i -le 254; $i++) {
        $ip = "$($sub.scan_prefix).$i"
        if ($ip -eq $sub.ip) { continue }
        $result = ping $ip -n 1 -w 150 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Output "  FOUND: $ip"
            foreach ($port in @(4001, 8000, 9100, 3001, 23, 80, 10001, 502, 1234, 5000, 20108, 8899)) {
                try {
                    $tcp = New-Object System.Net.Sockets.TcpClient
                    $ar = $tcp.BeginConnect($ip, $port, $null, $null)
                    $ok = $ar.AsyncWaitHandle.WaitOne(1000)
                    if ($ok) { Write-Output "    Port $port OPEN"; $tcp.Close() }
                } catch {}
            }
        }
    }
}

Write-Output "`n=== Restoring Ethernet to DHCP ==="
netsh interface ip set address $iface dhcp | Out-Null
Write-Output "Done."
