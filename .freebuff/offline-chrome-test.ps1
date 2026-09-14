# A3 verification: does the app BOOT with the network dead? (test artifact)
#
# Why a second browser: the preview webview does not let the service worker
# control subframes (an offline iframe yields a blank frame), so the app has to
# be the TOP-LEVEL document to be tested honestly. This uses a throwaway Chrome
# profile -- separate from the user's browser and from the preview -- so the run
# needs no network-off switch and touches nothing shared.
#
#   -Phase prime : load the app online in a fresh profile, let the worker
#                  install + precache, then close the browser.
#   -Phase dump  : load the SAME URL with the static server DOWN and dump the
#                  resulting DOM, then report the boot markers.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
# unless it has a BOM, so a stray em-dash is a parse error, not a comment.
#
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/offline-chrome-test.ps1 -Phase prime
param(
  [Parameter(Mandatory = $true)][ValidateSet('prime', 'dump')][string]$Phase,
  [int]$PrimeSeconds = 25
)
$ErrorActionPreference = 'Stop'

$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$root    = Split-Path -Parent $here
$chrome  = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profile = Join-Path $here 'chrome-offline-profile'
$dump    = Join-Path $here 'offline-dump.html'
$url     = 'http://127.0.0.1:8437/index.html'

if (-not (Test-Path $chrome)) { throw "chrome not found at $chrome" }

# The profile path contains a space ("AI-Chat Project"), and Start-Process joins
# its argument list with spaces WITHOUT quoting -- so this one value must carry
# its own embedded quotes or Chrome receives half a path and silently starts
# with a different profile (which is exactly how a stray F:\AI-Chat folder got
# created once). Same trap for any future argument containing a space.
$flags = @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking',
  "--user-data-dir=`"$profile`""
)

if ($Phase -eq 'prime') {
  if (Test-Path $profile) { Remove-Item -Recurse -Force $profile }
  New-Item -ItemType Directory -Path $profile | Out-Null
  Write-Output "phase=prime  profile=$profile"
  $startedAt = Get-Date
  $p = Start-Process -FilePath $chrome -ArgumentList ($flags + $url) -PassThru -WindowStyle Hidden
  Write-Output ("chrome pid={0} - loading the app online for {1}s so the worker installs and precaches" -f $p.Id, $PrimeSeconds)
  Start-Sleep -Seconds $PrimeSeconds
  try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { }
  # Chrome spawns helpers; only take down the ones from THIS run's profile.
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains('chrome-offline-profile') } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch { } }
  Start-Sleep -Seconds 2

  # Evidence that the worker actually wrote a cache into this profile.
  $swDir = Join-Path $profile 'Default\Service Worker'
  if (Test-Path $swDir) {
    $files = Get-ChildItem -Recurse -File $swDir -ErrorAction SilentlyContinue
    Write-Output ("service-worker profile dir: {0} files, {1} bytes" -f $files.Count, ($files | Measure-Object Length -Sum).Sum)
    $cacheDir = Join-Path $swDir 'CacheStorage'
    if (Test-Path $cacheDir) {
      $cf = Get-ChildItem -Recurse -File $cacheDir -ErrorAction SilentlyContinue
      Write-Output ("  CacheStorage: {0} files, {1} bytes" -f $cf.Count, ($cf | Measure-Object Length -Sum).Sum)
    } else { Write-Output '  CacheStorage: MISSING (worker never cached anything)' }
    $reg = Join-Path $profile 'Default\Service Worker\Database'
    if (Test-Path $reg) { Write-Output '  worker registration DB present' }
  } else { Write-Output "service-worker profile dir MISSING at $swDir" }
  exit 0
}

# ---- dump phase (expect the static server to be DOWN) ----
Write-Output 'phase=dump  (server must be DOWN)'
$listening = @(netstat -ano | Select-String 'LISTENING' | Select-String ':8437\s')
if ($listening.Count -gt 0) {
  Write-Output 'WARNING: something is still LISTENING on 8437 - this is NOT an offline run:'
  $listening | ForEach-Object { Write-Output ('  ' + $_.Line.Trim()) }
} else {
  Write-Output 'confirmed: nothing listening on 8437 (static server is down)'
}

# Chrome writes progress chatter to stderr (e.g. "Created TensorFlow Lite
# XNNPACK delegate"). Under $ErrorActionPreference='Stop' PowerShell promotes
# that to a terminating error, so relax it for this one call.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$dom = (& $chrome @flags '--dump-dom' $url 2>$null | Out-String)
$ErrorActionPreference = $prevEap
Set-Content -Path $dump -Value $dom -Encoding UTF8

function Count-Of([string]$pattern) { ([regex]::Matches($dom, $pattern)).Count }

$rows = [ordered]@{
  'dump bytes'                     = $dom.Length
  'title'                          = ([regex]::Match($dom, '<title>(.*?)</title>')).Groups[1].Value
  'nav sections'                   = Count-Of 'class="nav-section"'
  'tool cards'                     = Count-Of 'class="tool-card"'
  'data-icon spans'                = Count-Of 'data-icon='
  '  hydrated with SVG (JS ran)'   = Count-Of 'data-icon="[a-z-]+"[^>]*>[^<]*<svg'
  'manifest link'                  = Count-Of 'rel="manifest"'
  'apple touch icon'               = Count-Of 'apple-touch-icon'
  'brand mark svg'                 = Count-Of 'class="brand-mark"'
}
foreach ($k in $rows.Keys) { Write-Output ("{0,-32} {1}" -f $k, $rows[$k]) }
Write-Output "dump written: $dump"
