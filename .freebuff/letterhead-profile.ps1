param(
  [string]$Path,
  [int]$From = 250,
  [int]$To = 310
)

# Prints per-row ink counts for the reference letterhead PNG so line weights
# and gaps can be measured without shipping the artwork into the app.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile($Path)
try {
  $W = $bmp.Width; $H = $bmp.Height
  $PY = $H / 52.7361; $OY = 3.944
  Write-Output ("image " + $W + "x" + $H + "  pxPerPtY=" + [Math]::Round($PY, 3))
  for ($y = $From; $y -le [Math]::Min($To, $H - 1); $y++) {
    $ink = 0; $xmin = 1000000; $xmax = -1; $alphaSum = 0
    for ($x = 0; $x -lt $W; $x++) {
      $a = $bmp.GetPixel($x, $y).A
      if ($a -gt 40) { $ink++; $alphaSum += $a; if ($x -lt $xmin) { $xmin = $x }; if ($x -gt $xmax) { $xmax = $x } }
    }
    $yPt = [Math]::Round($OY + $y / $PY, 2)
    if ($ink -gt 0) {
      Write-Output ("row " + $y + "  yPt " + $yPt + "  ink " + $ink + "  x " + $xmin + "-" + $xmax + "  meanAlpha " + [Math]::Round($alphaSum / $ink))
    } else {
      Write-Output ("row " + $y + "  yPt " + $yPt + "  ink 0")
    }
  }
} finally { $bmp.Dispose() }
