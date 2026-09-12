param([string]$Path)

$ErrorActionPreference = 'Stop'
$latin1 = [System.Text.Encoding]::GetEncoding(28591)
$bytes = [System.IO.File]::ReadAllBytes($Path)
$s = $latin1.GetString($bytes)

Write-Output ("FILE bytes: " + $bytes.Length)

# Every occurrence of an image XObject dictionary.
$re = [regex]'/Subtype\s*/Image'
$hits = $re.Matches($s)
Write-Output ("image XObject dict hits: " + $hits.Count)

foreach ($h in $hits) {
  # Walk back to the start of the enclosing object ("N G obj").
  $objStart = $s.LastIndexOf('obj', $h.Index)
  $dictStart = $s.LastIndexOf('<<', $h.Index)
  $dict = ''
  if ($dictStart -ge 0) {
    $dictEnd = $s.IndexOf('>>', $dictStart)
    if ($dictEnd -gt $dictStart) { $dict = $s.Substring($dictStart, $dictEnd - $dictStart + 2) }
  }
  $dict = $dict -replace '\s+', ' '
  Write-Output "----"
  Write-Output ("objEnd: " + $objStart)
  Write-Output ("dict: " + $dict.Substring(0, [Math]::Min(420, $dict.Length)))

  # Locate the stream payload that follows this dictionary.
  $streamIdx = $s.IndexOf('stream', $h.Index)
  if ($streamIdx -lt 0) { Write-Output 'stream: NOT FOUND'; continue }
  $eol = $s.IndexOf("`n", $streamIdx)
  $endIdx = $s.IndexOf('endstream', $eol)
  Write-Output ("stream bytes: " + ($endIdx - $eol - 1))

  $lenM = [regex]::Match($dict, '/Length\s+(\d+)')
  if ($lenM.Success) { Write-Output ("declared /Length: " + $lenM.Groups[1].Value) }

  $head = $bytes[($eol + 1)..([Math]::Min($eol + 16, $bytes.Length - 1))]
  $hex = ($head | ForEach-Object { $_.ToString('x2') }) -join ' '
  Write-Output ("first bytes: " + $hex)
}

# Page resources that reference XObjects by name, so we can tell which image
# the page actually paints and where.
$cm = [regex]::Matches($s, '/Im\d+\s+Do|/(\w+)\s+Do')
Write-Output ("---- Do operators: " + $cm.Count)
