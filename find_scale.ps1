Write-Output "=== Pinging broadcast to discover devices ==="
ping 169.254.255.255 -n 3 -w 500 | Out-Null

Write-Output "`n=== ARP table for Ethernet interface ==="
arp -a -N 169.254.38.178

Write-Output "`n=== Checking common scale default IPs ==="
$commonIPs = @(
    "169.254.1.1", "169.254.0.1", "169.254.100.100",
    "10.0.0.1", "10.0.0.100", "10.10.10.1",
    "192.168.1.1", "192.168.1.100", "192.168.1.200",
    "192.168.0.200", "192.168.2.1"
)
foreach ($ip in $commonIPs) {
    $result = ping $ip -n 1 -w 500
    if ($LASTEXITCODE -eq 0) {
        Write-Output "  FOUND: $ip is responding!"
    }
}

Write-Output "`n=== Scanning 169.254.x.x neighbors (quick scan) ==="
$found = @()
$subnet = "169.254"
$ranges = @(
    @(0, 1, 2, 3, 4, 5, 10, 20, 38, 50, 100, 128, 150, 200, 254)
)
foreach ($third in $ranges[0]) {
    for ($fourth = 1; $fourth -le 254; $fourth += 1) {
        $ip = "$subnet.$third.$fourth"
        if ($ip -eq "169.254.38.178") { continue }
        $ping = ping $ip -n 1 -w 100
        if ($LASTEXITCODE -eq 0) {
            Write-Output "  FOUND: $ip"
            $found += $ip
        }
    }
}

if ($found.Count -eq 0) {
    Write-Output "  No devices found in quick scan."
    Write-Output "`n=== Checking ARP table again ==="
    arp -a -N 169.254.38.178
} else {
    Write-Output "`n=== Found devices ==="
    foreach ($ip in $found) {
        Write-Output "  $ip"
    }
}
