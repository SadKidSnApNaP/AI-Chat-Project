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

# The app.js block is the LAST attribute-less <script> in the bundle (the CDN
# tags all carry src=, and cloud.js/calculations.js come before it).
$open = $html.LastIndexOf('<script>')
if ($open -lt 0) { throw "no inline <script> tag found in preview.html" }

$probe = $html.Substring($open, [Math]::Min(400, $html.Length - $open))
if ($probe.IndexOf('app.js') -lt 0) { throw "the last inline <script> is not the app.js block" }

$html = $html.Insert($open, $stub + "`r`n")

[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("account-test.html written: {0} bytes (stub injected at offset {1})" -f $html.Length, $open)
