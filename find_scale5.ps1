$iface = "Ethernet"

$subnets = @(
    @{ localIP = "192.168.0.2";   mask = "255.255.255.0"; prefix = "192.168.0" },
    @{ localIP = "192.168.1.2";   mask = "255.255.255.0"; prefix = "192.168.1" },
    @{ localIP = "192.168.2.2";   mask = "255.255.255.0"; prefix = "192.168.2" },
    @{ localIP = "10.0.0.2";      mask = "255.255.255.0"; prefix = "10.0.0" },
    @{ localIP = "10.10.100.2";   mask = "255.255.255.0"; prefix = "10.10.100" },
    @{ localIP = "10.10.10.2";    mask = "255.255.255.0"; prefix = "10.10.10" },
    @{ localIP = "10.1.1.2";      mask = "255.255.255.0"; prefix = "10.1.1" },
    @{ localIP = "172.16.0.2";    mask = "255.255.255.0"; prefix = "172.16.0" }
)

$ports = @(4001, 8000, 9100, 80, 23, 502, 10001, 3001, 20108)
$foundScale = $null

foreach ($sub in $subnets) {
    Write-Output "--- Trying $($sub.prefix).x (binding to $($sub.localIP)) ---"
    netsh interface ip set address $iface static $sub.localIP $sub.mask | Out-Null
    Start-Sleep -Milliseconds 2500

    for ($i = 1; $i -le 254; $i++) {
        $target = "$($sub.prefix).$i"
        if ($target -eq $sub.localIP) { continue }

        foreach ($port in $ports) {
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $localEP = New-Object System.Net.IPEndPoint ([System.Net.IPAddress]::Parse($sub.localIP), 0)
                $tcp.Client.Bind($localEP)
                $ar = $tcp.BeginConnect($target, $port, $null, $null)
                $ok = $ar.AsyncWaitHandle.WaitOne(120)
                if ($ok -and $tcp.Connected) {
                    Write-Output "  >>> FOUND $target on port $port <<<"

                    if ($port -eq 4001 -or $port -eq 8000 -or $port -eq 9100 -or $port -eq 3001 -or $port -eq 10001 -or $port -eq 23) {
                        try {
                            $stream = $tcp.GetStream()
                            $stream.WriteTimeout = 1500
                            $stream.ReadTimeout = 1500
                            $cmd = [System.Text.Encoding]::ASCII.GetBytes("W`r`n")
                            $stream.Write($cmd, 0, $cmd.Length)
                            Start-Sleep -Milliseconds 500
                            $buf = New-Object byte[] 128
                            $n = $stream.Read($buf, 0, 128)
                            if ($n -gt 0) {
                                $resp = [System.Text.Encoding]::ASCII.GetString($buf, 0, $n).Trim()
                                Write-Output "    Scale responded to W command: '$resp'"
                                $foundScale = @{ ip = $target; port = $port; response = $resp; localIP = $sub.localIP; mask = $sub.mask }
                            }
                        } catch {
                            Write-Output "    (port open but no W response)"
                        }
                    }

                    if ($port -eq 80) {
                        Write-Output "    (web interface found - scale config page)"
                    }

                    $tcp.Close()
                    if ($foundScale) { break }
                }
            } catch {} finally {
                try { $tcp.Close() } catch {}
            }
        }
        if ($foundScale) { break }
    }
    if ($foundScale) { break }
}

Write-Output "`n=== Restoring Ethernet to DHCP ==="
netsh interface ip set address $iface dhcp | Out-Null

if ($foundScale) {
    Write-Output "`n************************************"
    Write-Output "SCALE FOUND!"
    Write-Output "  IP:       $($foundScale.ip)"
    Write-Output "  Port:     $($foundScale.port)"
    Write-Output "  Response: $($foundScale.response)"
    Write-Output ""
    Write-Output "To connect permanently, set your Ethernet adapter to:"
    Write-Output "  Static IP:    $($foundScale.localIP)"
    Write-Output "  Subnet Mask:  $($foundScale.mask)"
    Write-Output "************************************"
} else {
    Write-Output "`nScale not found on any tested subnet."
}
