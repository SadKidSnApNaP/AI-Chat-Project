# Builds preview.html — a single self-contained copy of the CalcMall app.
# Inlines css/style.css and both JS files into index.html. The html2pdf.js
# CDN script tag is kept as-is (PDF export needs internet on first load).
$ErrorActionPreference = 'Stop'

$css   = Get-Content -Raw -Encoding UTF8 -Path 'css/style.css'
$idx   = Get-Content -Raw -Encoding UTF8 -Path 'index.html'
$cloud = Get-Content -Raw -Encoding UTF8 -Path 'js/cloud.js'
$calc  = Get-Content -Raw -Encoding UTF8 -Path 'js/calculations.js'
$app   = Get-Content -Raw -Encoding UTF8 -Path 'js/app.js'

$linkTag  = '<link rel="stylesheet" href="css/style.css">'
$cloudTag = '<script src="js/cloud.js"></script>'
$calcTag  = '<script src="js/calculations.js"></script>'
$appTag   = '<script src="js/app.js"></script>'

if (-not $idx.Contains($linkTag))  { throw 'stylesheet link tag not found in index.html' }
if (-not $idx.Contains($cloudTag)) { throw 'cloud.js script tag not found in index.html' }
if (-not $idx.Contains($calcTag))  { throw 'calculations.js script tag not found in index.html' }
if (-not $idx.Contains($appTag))   { throw 'app.js script tag not found in index.html' }
if ($cloud -match '</script>')     { throw 'cloud.js contains </script>' }
if ($calc -match '</script>')      { throw 'calculations.js contains </script>' }
if ($app  -match '</script>')      { throw 'app.js contains </script>' }

$out = $idx.Replace($linkTag, "<style>`n" + $css + "  </style>")
$out = $out.Replace($cloudTag, "<script>`n" + $cloud + "  </script>")
$out = $out.Replace($calcTag, "<script>`n" + $calc + "  </script>")
$out = $out.Replace($appTag,  "<script>`n" + $app + "  </script>")

# Sanity: no local asset references may remain
if ($out -match 'src="js/|href="css/') { throw 'unresolved local asset reference remains' }

Set-Content -Path 'preview.html' -Value $out -Encoding UTF8 -NoNewline
Write-Output ("preview.html written: " + (Get-Item 'preview.html').Length + " bytes")
