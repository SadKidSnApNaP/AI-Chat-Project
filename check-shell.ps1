# check-shell.ps1 — keeps sw.js's offline allowlist honest.
#
# WHY THIS EXISTS
# sw.js caches by ALLOWLIST: only URLs it names are ever cached or served
# offline. That keeps the cache from quietly absorbing same-origin responses it
# should not touch — but it introduces a failure mode that is easy to miss:
# add a file to index.html and forget to add it to SHELL, and everything works
# ONLINE while offline boot breaks (a blank app, or a missing library). The
# network-first policy hides the mistake until the day someone is offline.
#
# This script closes that gap. It fails loudly when:
#   1. index.html or css/style.css references a same-origin asset that is not in
#      SHELL and not covered by RUNTIME_PREFIXES, or
#   2. a SHELL entry does not exist on disk (deleted or renamed file).
# It also prints a fingerprint of the current shell, so two runs can be compared
# and the VERSION bump in sw.js is a conscious decision rather than a hope.
#
# It does NOT verify that VERSION was bumped — that cannot be known statically.
# Run it before every deploy:
#   powershell -NoProfile -ExecutionPolicy Bypass -File check-shell.ps1
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
# without a BOM, so a stray em-dash is a parse error rather than a comment.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$problems = New-Object System.Collections.Generic.List[string]

function Read-Text([string]$relative) {
  $p = Join-Path $here $relative
  if (-not (Test-Path -LiteralPath $p)) { throw "missing file: $relative" }
  return [System.IO.File]::ReadAllText($p)
}

# Resolve a reference the way a browser would, relative to the referring file's
# folder. Returns $null for anything that is not a same-origin path (external
# URLs, data:, mailto:, fragments), which are none of the shell's business.
function Resolve-Ref([string]$ref, [string]$baseDir) {
  if ([string]::IsNullOrWhiteSpace($ref)) { return $null }
  $r = $ref.Trim()
  if ($r.StartsWith('#')) { return $null }
  # Not a static reference: a URL assembled inside a script string. The A2 CDN
  # fallback loader builds '<script src="' + FALLBACKS[i][1] + '">' with
  # document.write, and a naive regex reads that concatenation as a real path.
  # Anything carrying script punctuation is skipped.
  # Single-quoted so PowerShell does not eat the quotes; '' is a literal '.
  if ($r -match '[''"<>{}()+]' -or $r -match '\s') { return $null }
  if ($r.StartsWith('//')) { return $null }
  if ($r -match '^[a-zA-Z][a-zA-Z0-9+.\-]*:') { return $null }
  $joined = if ($r.StartsWith('/')) { $r } else { $baseDir + $r }
  $segments = New-Object System.Collections.Generic.List[string]
  foreach ($seg in $joined.Split('/')) {
    if ($seg -eq '' -or $seg -eq '.') { continue }
    if ($seg -eq '..') {
      if ($segments.Count -gt 0) { $segments.RemoveAt($segments.Count - 1) }
      continue
    }
    $segments.Add($seg)
  }
  return '/' + ($segments -join '/')
}

$sw    = Read-Text 'sw.js'
$index = Read-Text 'index.html'
$css   = Read-Text 'css\style.css'

# ---- what the worker vouches for -------------------------------------------
$shellStart = $sw.IndexOf('const SHELL')
if ($shellStart -lt 0) { throw 'could not find "const SHELL" in sw.js' }
$shellEnd = $sw.IndexOf('];', $shellStart)
if ($shellEnd -lt 0) { throw 'could not find the end of the SHELL list in sw.js' }
$shellBlock = $sw.Substring($shellStart, $shellEnd - $shellStart)
$shell = @([regex]::Matches($shellBlock, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })

$prefixStart = $sw.IndexOf('const RUNTIME_PREFIXES')
if ($prefixStart -lt 0) { throw 'could not find "const RUNTIME_PREFIXES" in sw.js' }
$prefixEnd = $sw.IndexOf('];', $prefixStart)
$prefixBlock = $sw.Substring($prefixStart, $prefixEnd - $prefixStart)
$prefixes = @([regex]::Matches($prefixBlock, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })

$versionMatch = [regex]::Match($sw, "const VERSION = '([^']+)'")
$version = if ($versionMatch.Success) { $versionMatch.Groups[1].Value } else { '?' }

$shellPaths = New-Object System.Collections.Generic.HashSet[string]
foreach ($entry in $shell) { [void]$shellPaths.Add((Resolve-Ref $entry '/')) }
[void]$shellPaths.Add('/')

function Test-Covered([string]$path) {
  if ($shellPaths.Contains($path)) { return $true }
  foreach ($p in $prefixes) { if ($path.StartsWith($p)) { return $true } }
  return $false
}

# ---- references from the document -----------------------------------------
$indexRefs = @([regex]::Matches($index, '(?:src|href)\s*=\s*"([^"]*)"') |
  ForEach-Object { $_.Groups[1].Value })
$cssRefs = @([regex]::Matches($css, 'url\(\s*[''"]?([^''")]+)[''"]?\s*\)') |
  ForEach-Object { $_.Groups[1].Value })

$missing = New-Object System.Collections.Generic.List[string]
foreach ($ref in $indexRefs) {
  $path = Resolve-Ref $ref '/'
  if ($null -eq $path) { continue }
  if (-not (Test-Covered $path)) { $missing.Add("index.html -> $ref  (resolves to $path)") }
}
foreach ($ref in $cssRefs) {
  $path = Resolve-Ref $ref '/css/'
  if ($null -eq $path) { continue }
  if (-not (Test-Covered $path)) { $missing.Add("css/style.css -> $ref  (resolves to $path)") }
}
if ($missing.Count -gt 0) {
  $problems.Add("referenced but NOT in sw.js SHELL (offline boot would break):")
  foreach ($m in $missing) { $problems.Add("    $m") }
}

# ---- do the listed files actually exist? ----------------------------------
$fingerprint = New-Object System.Collections.Generic.List[string]
$totalBytes = 0
foreach ($entry in $shell) {
  $path = Resolve-Ref $entry '/'
  if ($path -eq '/') { continue }   # the directory itself
  $rel = $path.TrimStart('/').Replace('/', '\')
  $full = Join-Path $here $rel
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
    $problems.Add("SHELL lists a file that does not exist: $entry")
    continue
  }
  $len = (Get-Item -LiteralPath $full).Length
  $totalBytes += $len
  $fingerprint.Add("$entry=$len")
}

# ---- report ---------------------------------------------------------------
Write-Output "sw.js VERSION      : $version"
Write-Output "SHELL entries      : $($shell.Count)  file(s): $($fingerprint.Count)  total: $totalBytes bytes"
Write-Output "runtime prefixes   : $($prefixes -join ', ')"
$hash = [System.BitConverter]::ToString(
  [System.Security.Cryptography.SHA1]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes(($fingerprint -join '|')))).Replace('-', '').Substring(0, 12)
Write-Output "shell fingerprint  : $hash"
Write-Output "(compare with the previous run; if it changed, bump VERSION in sw.js)"

if ($problems.Count -gt 0) {
  Write-Output ''
  Write-Output 'DRIFT DETECTED:'
  foreach ($p in $problems) { Write-Output "  $p" }
  Write-Output ''
  Write-Output 'Fix sw.js: add the file to SHELL (and bump VERSION), or remove the dead entry.'
  exit 1
}

Write-Output ''
Write-Output 'OK: every same-origin reference in index.html and css/style.css is covered by SHELL, and every SHELL entry exists.'
exit 0
