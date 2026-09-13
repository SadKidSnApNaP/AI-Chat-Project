# Builds _signed-in-test.html at the project root: index.html with the
# signed-in test stub ('.freebuff/account-test-stub.html') injected immediately
# BEFORE the cloud.js script tag. Root placement keeps relative paths working.
#
# TEST ARTIFACT ONLY — delete _signed-in-test.html when finished.
#   powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/make-erp-test.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$src = Join-Path $root 'index.html'
$stubPath = Join-Path $here 'account-test-stub.html'
$out = Join-Path $root '_signed-in-test.html'

$html = [System.IO.File]::ReadAllText($src)
$stub = [System.IO.File]::ReadAllText($stubPath)

$marker = '<script src="js/cloud.js"></script>'
$at = $html.IndexOf($marker)
if ($at -lt 0) { throw "cloud.js script tag not found in index.html" }

$html = $html.Insert($at, $stub + "`r`n  ")
[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("_signed-in-test.html written: {0} bytes (stub injected at offset {1})" -f $html.Length, $at)
