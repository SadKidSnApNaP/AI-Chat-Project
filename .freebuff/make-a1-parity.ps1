# Builds _a1-parity.html at the project root: index.html with the EXISTING
# signed-in stub (.freebuff/account-test-stub.html) injected immediately before
# js/app.js, plus .freebuff/a1-driver.js injected before </body>.
#
# It must live at the project root so the app's relative paths (css/style.css,
# js/*.js) resolve against the same static server that serves index.html.
#
# TEST ARTIFACT ONLY — regenerate when index.html changes, and delete it when
# the parity work is done. Keep this file pure ASCII (Windows PowerShell reads
# .ps1 as ANSI without a BOM).
#
# -Out <name>  output file name at the project root (default _a1-parity.html).
#              A UNIQUE NAME PER RUN is what guarantees a genuinely fresh load:
#              the preview layer ignores a navigation that differs only in its
#              query string, so re-using one name can silently keep the old
#              document (and its in-memory tool drafts) alive.
param([string]$Out = '_a1-parity.html')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$src  = Join-Path $root 'index.html'
$stubPath   = Join-Path $here 'account-test-stub.html'
$prepPath   = Join-Path $here 'a1-prep-stub.html'
$driverPath = Join-Path $here 'a1-driver.js'
$out  = Join-Path $root $Out

$html   = [System.IO.File]::ReadAllText($src)
$stub   = [System.IO.File]::ReadAllText($stubPath)
$prep   = [System.IO.File]::ReadAllText($prepPath)
$driver = [System.IO.File]::ReadAllText($driverPath)

# Order matters: the session stub first (SESSION_EMAIL is captured once at
# module evaluation, so seeding a session afterwards does nothing), then the
# deterministic-state stub, then app.js.
$marker = '<script src="js/app.js">'
$at = $html.IndexOf($marker)
if ($at -lt 0) { throw "could not find '$marker' in index.html" }
$html = $html.Insert($at, $prep + "`r`n  " + $stub + "`r`n  ")

# The driver only DEFINES __a1run/__a1collect, so it may load after app.js.
$close = $html.LastIndexOf('</body>')
if ($close -lt 0) { throw 'could not find </body> in index.html' }
$html = $html.Insert($close, '<script>' + $driver + '</script>' + "`r`n")

[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("{0} written: {1} bytes (stub at {2})" -f $Out, $html.Length, $at)
