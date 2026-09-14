# Builds the PWA icon set into icons/ (A3).
#
# The mark is the app's OWN logo — the inline SVG in index.html's sidebar:
# a document with a folded corner and a tick. Without this the app had no icon
# asset at all (only inline SVG, which a manifest cannot use), so a manifest
# would have had nothing installable to point at.
#
# The glyph is drawn as stroked polylines in the SVG's own 24x24 coordinate
# space (stroke-width 2, round caps/joins), then scaled — so the icons match
# the on-screen mark rather than approximating it.
#
# Sizes: 192 + 512 for the manifest, 512 full-bleed for `maskable`
# (Android crops maskable icons to a shape, so the glyph sits inside the 80%
# safe zone), and a 180 apple-touch-icon for iOS home screens.
#
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File build-icons.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'icons'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Brand palette — the glass canvas the app actually renders on.
$bgTop    = [System.Drawing.Color]::FromArgb(255, 26, 28, 56)   # indigo, lifted
$bgBottom = [System.Drawing.Color]::FromArgb(255, 11, 13, 23)   # #0b0d17 canvas
$ink      = [System.Drawing.Color]::White

# The brand mark in its 24x24 grid, as FLAT x,y pairs.
# Deliberately not an array of point-pairs: PowerShell flattens nested arrays,
# so `@( ,@(x,y), ... )` silently yields a mix of scalars and arrays and the
# cast below then fails with "cannot convert Object[] to Single". Flat is safe.
$pagePath = @(5.0, 4.5,  14.5, 4.5,  20.0, 10.0,  20.0, 19.5,  5.0, 19.5,  5.0, 4.5)
$foldPath = @(14.5, 4.5,  14.5, 10.0,  20.0, 10.0)
$tickPath = @(9.0, 14.5,  11.2, 16.7,  15.2, 12.3)

function New-Mark {
  param(
    [int]$Size,
    [string]$File,
    [bool]$Maskable = $false,
    [double]$GlyphScale = 1.0
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  # Background: rounded square normally, full bleed when maskable.
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $bgTop, $bgBottom, 90.0)
  if ($Maskable) {
    $g.FillRectangle($grad, $rect)
  } else {
    $r = [int]([Math]::Round($Size * 0.22))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($grad, $path)
  }

  # Map the SVG's 24x24 space onto the icon, centred on the glyph.
  $k = ($Size / 24.0) * $GlyphScale
  $g.TranslateTransform($Size / 2.0, $Size / 2.0)
  $g.ScaleTransform($k, $k)
  $g.TranslateTransform(-12.5, -12.0)

  $pen = New-Object System.Drawing.Pen($ink, 2.0)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  function Convert-Points([double[]]$flat) {
    $pts = New-Object 'System.Drawing.PointF[]' ([int]($flat.Count / 2))
    for ($i = 0; $i -lt $flat.Count; $i += 2) {
      $pts[$i / 2] = New-Object System.Drawing.PointF([float]$flat[$i], [float]$flat[$i + 1])
    }
    return , $pts
  }

  $g.DrawLines($pen, (Convert-Points $pagePath))
  $g.DrawLines($pen, (Convert-Points $foldPath))
  $g.DrawLines($pen, (Convert-Points $tickPath))

  $target = Join-Path $outDir $File
  $bmp.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)

  $pen.Dispose(); $g.Dispose(); $bmp.Dispose()
  Write-Output ("{0,-28} {1}x{1}  {2} bytes" -f $File, $Size, (Get-Item $target).Length)
}

New-Mark -Size 192 -File 'icon-192.png'
New-Mark -Size 512 -File 'icon-512.png'
New-Mark -Size 512 -File 'maskable-512.png' -Maskable $true -GlyphScale 0.78
New-Mark -Size 180 -File 'apple-touch-icon.png' -Maskable $true
Write-Output ("icons written to {0}" -f $outDir)
