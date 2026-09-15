# Builds .freebuff/account-test.html: preview.html with the test stub injected
# immediately before the inline app.js block, so the signed-in Account Settings
# path can be exercised without a real Supabase login.
# TEST ARTIFACT ONLY. Keep this file pure ASCII: Windows PowerShell reads .ps1
# as ANSI unless it has a BOM, so a non-ASCII literal here becomes mojibake and
# every IndexOf on it silently fails.
# Regenerate with:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/make-account-test.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$src  = Join-Path $root 'preview.html'
$stubPath = Join-Path $here 'account-test-stub.html'
$out  = Join-Path $here 'account-test.html'

$html = [System.IO.File]::ReadAllText($src)
$stub = [System.IO.File]::ReadAllText($stubPath)

# The app.js block is an attribute-less <script> whose body opens with the
# app.js banner comment, and it is NOT the last one any more: index.html has
# carried a service-worker registration <script> after it since A3, and app.js
# itself builds '<script src="...">' strings for the CDN fallback. So walk the
# bare tags back from the end and identify the block by an ASCII-only marker
# from app.js's own header comment (this file must stay pure ASCII: Windows
# PowerShell reads .ps1 as ANSI, so a non-ASCII literal becomes mojibake).
$MARKER = 'State (localStorage), rendering, events, message generator'
$open = -1
$i = $html.LastIndexOf('<script>')
while ($i -ge 0) {
  $probe = $html.Substring($i, [Math]::Min(400, $html.Length - $i))
  if ($probe.IndexOf($MARKER) -ge 0) { $open = $i; break }
  $i = $html.LastIndexOf('<script>', $i - 1)
}
if ($open -lt 0) { throw "no inline <script> block for app.js found in preview.html" }

$html = $html.Insert($open, $stub + "`r`n")

[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("account-test.html written: {0} bytes (stub injected at offset {1})" -f $html.Length, $open)
