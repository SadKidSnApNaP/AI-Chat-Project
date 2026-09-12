# Builds a self-contained copy of the calculation test page (for preview verification only).
$ErrorActionPreference = 'Stop'
$c = Get-Content -Raw -Encoding UTF8 -Path 'js/calculations.js'
$t = Get-Content -Raw -Encoding UTF8 -Path 'test/calculations.test.html'
$tag = '<script src="../js/calculations.js"></script>'
if (-not $t.Contains($tag)) { throw 'test script tag not found' }
if ($c -match '</script>') { throw 'calculations.js contains </script>' }
$t = $t.Replace($tag, "<script>`n" + $c + "  </script>")
Set-Content -Path 'test-inline.html' -Value $t -Encoding UTF8 -NoNewline
Write-Output ("test-inline.html written: " + (Get-Item 'test-inline.html').Length + " bytes")
