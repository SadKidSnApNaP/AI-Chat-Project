# Minimal static file server for the Freebuff preview (GET only, 127.0.0.1 only).
# Serves files from this directory; "/" maps to preview.html. No caching.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8437
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.pdf'  = 'application/pdf'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.txt'  = 'text/plain; charset=utf-8'
}
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
Write-Output "preview-static listening on http://127.0.0.1:$port/ (root: $root)"
$enc = [System.Text.Encoding]::UTF8
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()
    $buf = New-Object byte[] 8192
    $read = $stream.Read($buf, 0, $buf.Length)
    $req = $enc.GetString($buf, 0, $read)
    $line = ($req -split "`r?`n")[0]
    $parts = $line -split ' '
    $method = $parts[0]
    $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { '/' }
    if ($method -ne 'GET') {
      $status = '405 Method Not Allowed'; $body = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed')
      $head = "HTTP/1.1 $status`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $hb = $enc.GetBytes($head); $stream.Write($hb, 0, $hb.Length); $stream.Write($body, 0, $body.Length)
    } else {
      $path = $rawPath -split '\?' | Select-Object -First 1
      $path = [Uri]::UnescapeDataString($path)
      if ($path -eq '/' -or $path -eq '') { $path = '/preview.html' }
      $path = ($path -replace '/', '\').TrimStart('\')
      $full = Join-Path $root $path
      $rootFull = (Get-Item $root).FullName
      $allowed = $false
      try { $allowed = ((Get-Item -LiteralPath $full -ErrorAction Stop).FullName).StartsWith($rootFull) } catch { $allowed = $false }
      if ($allowed -and (Test-Path -LiteralPath $full -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $head = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $hb = $enc.GetBytes($head); $stream.Write($hb, 0, $hb.Length); $stream.Write($bytes, 0, $bytes.Length)
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $hb = $enc.GetBytes($head); $stream.Write($hb, 0, $hb.Length); $stream.Write($body, 0, $body.Length)
      }
    }
    $stream.Flush(); $stream.Close()
  } catch { Write-Output "req error: $_" }
  finally { $client.Close() }
}
