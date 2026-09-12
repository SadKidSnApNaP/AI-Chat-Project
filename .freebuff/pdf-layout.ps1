param([string]$Path)

$ErrorActionPreference = 'Stop'
$latin1 = [System.Text.Encoding]::GetEncoding(28591)
$bytes = [System.IO.File]::ReadAllBytes($Path)
$s = $latin1.GetString($bytes)

Write-Output ("FILE bytes: " + $bytes.Length)

# MediaBox / page size
$mb = [regex]::Matches($s, '/MediaBox\s*\[([^\]]+)\]')
foreach ($m in $mb) { Write-Output ("MediaBox: " + $m.Groups[1].Value.Trim()) }
$rb = [regex]::Matches($s, '/Rotate\s+(\d+)')
foreach ($m in $rb) { Write-Output ("Rotate: " + $m.Groups[1].Value) }

function Inflate([byte[]]$data) {
  try {
    $ms = New-Object System.IO.MemoryStream(,$data)
    $ms.Position = 2
    $ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
    $out = New-Object System.IO.MemoryStream
    $ds.CopyTo($out)
    $ds.Dispose()
    return $latin1.GetString($out.ToArray())
  } catch { return $null }
}

# collect inflated streams
$streams = @()
$idx = 0
while ($true) {
  $start = $s.IndexOf('stream', $idx)
  if ($start -lt 0) { break }
  $eol = $s.IndexOf("`n", $start)
  if ($eol -lt 0) { break }
  $end = $s.IndexOf('endstream', $eol)
  if ($end -lt 0) { break }
  $len = $end - ($eol + 1)
  if ($len -gt 0) {
    $seg = New-Object byte[] $len
    [Array]::Copy($bytes, $eol + 1, $seg, 0, $len)
    $txt = Inflate $seg
    if ($txt) { $streams += ,$txt }
  }
  $idx = $end + 9
}
Write-Output ("Inflated streams: " + $streams.Count)

$content = $streams | Where-Object { $_ -match ' Tj| TJ|re\b|BT' }
Write-Output ("Content-ish streams: " + $content.Count)

# ── text runs: track Tm / Td position + Tf size, emit on Tj / TJ
$out = New-Object System.Collections.Generic.List[string]
$n = 0
foreach ($st in $content) {
  $n++
  $lines = $st -split "`r?`n"
  $x = 0.0; $y = 0.0; $size = 0.0; $font = ''
  foreach ($ln in $lines) {
    $t = $ln.Trim()
    if ($t -match '^/([A-Za-z0-9]+)\s+([0-9.]+)\s+Tf') { $font = $Matches[1]; $size = [double]$Matches[2]; continue }
    if ($t -match '^([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+Tm') {
      $x = [double]$Matches[5]; $y = [double]$Matches[6]; continue
    }
    if ($t -match '^([-0-9.]+)\s+([-0-9.]+)\s+Td') { $x += [double]$Matches[1]; $y += [double]$Matches[2]; continue }
    if ($t -match '^(.*)\s+Tj\s*$') {
      $str = $Matches[1]
      $out.Add(("{0,8:N2} {1,8:N2}  size {2,5:N1}  {3}  :: {4}" -f $x, $y, $size, $font, $str))
      continue
    }
    if ($t -match 'TJ') {
      $out.Add(("{0,8:N2} {1,8:N2}  size {2,5:N1}  {3}  :: [TJ] {4}" -f $x, $y, $size, $font, $t))
      continue
    }
  }
}

Write-Output "`n===== TEXT RUNS (x, y from page bottom) ====="
$out | ForEach-Object { Write-Output $_ }

# ── vector graphics: rectangles + line moves
Write-Output "`n===== RECTANGLES (x y w h) and LINES ====="
foreach ($st in $content) {
  $lines = $st -split "`r?`n"
  foreach ($ln in $lines) {
    $t = $ln.Trim()
    if ($t -match '^([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+re') {
      Write-Output ("re  x={0,8:N2} y={1,8:N2} w={2,7:N2} h={3,7:N2}" -f [double]$Matches[1], [double]$Matches[2], [double]$Matches[3], [double]$Matches[4])
    }
    elseif ($t -match '^([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+cm') {
      Write-Output ("cm  a={0} b={1} c={2} d={3} e={4} f={5}" -f $Matches[1], $Matches[2], $Matches[3], $Matches[4], $Matches[5], $Matches[6])
    }
    elseif ($t -match '^([-0-9.]+)\s+w\s*$') {
      Write-Output ("lineWidth = " + $Matches[1])
    }
  }
}

# ── images / xobjects
Write-Output "`n===== IMAGE XOBJECTS ====="
$imgs = [regex]::Matches($s, '/Subtype\s*/Image[^>]*?/Width\s+(\d+)[^>]*?/Height\s+(\d+)')
foreach ($m in $imgs) { Write-Output ("image W=" + $m.Groups[1].Value + " H=" + $m.Groups[2].Value) }
