param(
  [string]$Path,
  [string]$Out
)

# Extracts the master PDF's full-width letterhead raster EXACTLY as embedded:
# no redrawing, no rescaling, no re-encoding of the artwork beyond PNG packing.
# The master carries two image XObjects at 4167x368 - a DeviceRGB letterhead
# and the DeviceGray soft mask the page paints it through.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$latin1 = [System.Text.Encoding]::GetEncoding(28591)
$bytes = [System.IO.File]::ReadAllBytes($Path)
$s = $latin1.GetString($bytes)

function Inflate([byte[]]$data) {
  # zlib container: skip the 2-byte header, let DeflateStream stop at the
  # trailing Adler32. Same trick .freebuff/pdf-layout.ps1 uses.
  $ms = New-Object System.IO.MemoryStream(,$data)
  $ms.Position = 2
  $ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
  $outStream = New-Object System.IO.MemoryStream
  $ds.CopyTo($outStream)
  $ds.Dispose()
  $result = $outStream.ToArray()
  $outStream.Dispose()
  return $result
}

function Find-Images([string]$text) {
  $found = @()
  $re = [regex]'/Subtype\s*/Image'
  foreach ($h in $re.Matches($text)) {
    $dictStart = $text.LastIndexOf('<<', $h.Index)
    if ($dictStart -lt 0) { continue }
    $dictEnd = $text.IndexOf('>>', $dictStart)
    if ($dictEnd -lt 0) { continue }
    $dict = ($text.Substring($dictStart, $dictEnd - $dictStart + 2)) -replace '\s+', ' '

    $objEnd = $text.LastIndexOf('obj', $h.Index)
    $objNum = ''
    if ($objEnd -gt 0) {
      $back = $text.Substring([Math]::Max(0, $objEnd - 24), 24)
      $om = [regex]::Match($back, '(\d+)\s+\d+\s+obj\s*$')
      if ($om.Success) { $objNum = $om.Groups[1].Value }
    }

    $streamIdx = $text.IndexOf('stream', $h.Index)
    if ($streamIdx -lt 0) { continue }
    $eol = $text.IndexOf("`n", $streamIdx)
    $endIdx = $text.IndexOf('endstream', $eol)
    $len = $endIdx - $eol - 1
    $payload = New-Object byte[] $len
    [Array]::Copy($bytes, $eol + 1, $payload, 0, $len)

    $found += [pscustomobject]@{
      Obj    = $objNum
      Dict   = $dict
      Bytes  = $payload
      Size   = $len
    }
  }
  return $found
}

$images = Find-Images $s
Write-Output ("image XObjects: " + $images.Count)

$rgbImage = $null
$grayImage = $null
foreach ($im in $images) {
  Write-Output ("  obj " + $im.Obj + "  " + $im.Size + " bytes  " + $im.Dict.Substring(0, [Math]::Min(200, $im.Dict.Length)))
  if ($im.Dict -match '/DeviceRGB') { $rgbImage = $im }
  elseif ($im.Dict -match '/DeviceGray') { $grayImage = $im }
}

if (-not $rgbImage) { throw 'no DeviceRGB letterhead image found' }

$w = [int]([regex]::Match($rgbImage.Dict, '/Width\s+(\d+)').Groups[1].Value)
$h = [int]([regex]::Match($rgbImage.Dict, '/Height\s+(\d+)').Groups[1].Value)
Write-Output ("letterhead raster: " + $w + " x " + $h + " px")

$rgb = Inflate $rgbImage.Bytes
Write-Output ("inflated RGB bytes: " + $rgb.Length + " (expected " + ($w * $h * 3) + ")")

$alpha = $null
if ($grayImage) {
  $gw = [int]([regex]::Match($grayImage.Dict, '/Width\s+(\d+)').Groups[1].Value)
  $gh = [int]([regex]::Match($grayImage.Dict, '/Height\s+(\d+)').Groups[1].Value)
  if ($gw -eq $w -and $gh -eq $h) {
    $alpha = Inflate $grayImage.Bytes
    Write-Output ("inflated SMask bytes: " + $alpha.Length + " (expected " + ($w * $h) + ")")
    if ($alpha.Length -ne ($w * $h)) { $alpha = $null }
  } else {
    Write-Output ("SMask size mismatch (" + $gw + "x" + $gh + ") - ignoring")
  }
}

$src = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class LetterheadPng {
  // RGB (8bpc, 3 bytes/px, row-major, no padding) + optional 8bpc alpha ->
  // 32bppArgb PNG. Kept in C# so 1.5M pixels never round-trip through
  // PowerShell's per-element pipeline.
  public static void Write(byte[] rgb, byte[] alpha, int w, int h, string outPath) {
    using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      var rect = new Rectangle(0, 0, w, h);
      var data = bmp.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      try {
        int stride = data.Stride;
        byte[] row = new byte[stride];
        int i = 0;
        for (int y = 0; y < h; y++) {
          for (int x = 0; x < w; x++) {
            int p = x * 4;
            row[p]     = rgb[i + 2];
            row[p + 1] = rgb[i + 1];
            row[p + 2] = rgb[i];
            row[p + 3] = (alpha == null) ? (byte)255 : alpha[i / 3];
            i += 3;
          }
          Marshal.Copy(row, 0, IntPtr.Add(data.Scan0, y * stride), stride);
        }
      } finally { bmp.UnlockBits(data); }
      bmp.Save(outPath, ImageFormat.Png);
    }
  }
}
'@
Add-Type -TypeDefinition $src -ReferencedAssemblies System.Drawing

[LetterheadPng]::Write($rgb, $alpha, $w, $h, $Out)
$fi = Get-Item $Out
Write-Output ("wrote " + $fi.FullName + " (" + $fi.Length + " bytes)")
