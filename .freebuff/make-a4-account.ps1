# Builds _a4-<scenario>.html at the project root: index.html with the A4 test
# stub (.freebuff/a4-account-stub.html) injected immediately before js/app.js,
# preceded by that scenario's config.
#
# It must live at the project root so the app's relative paths (css/style.css,
# js/*.js, vendor/*.js) resolve against the same static server that serves
# index.html.
#
# A UNIQUE FILE NAME per scenario is what guarantees a genuinely fresh load:
# the preview layer ignores a navigation that differs only in its query string,
# so re-using one name can silently keep the previous document (and the
# previous run's in-memory state) alive.
#
# Scenarios
#   a  account row: premium + some usage        local cache: EMPTY (cleared browser)
#   b  account row: free + ALL uses spent       local cache: EMPTY (cleared browser)
#   c  account row: free + {qr:2}               local cache: {qr:1,boq:4}  (ours is higher)
#   d  account row: NONE (never synced)         local cache: plan 'premium' (stale grant)
#   e  network DEAD (every REST call rejects)   local cache: premium + {qr:3} (offline boot)
#   f  account row: NONE (never synced)         local cache: EMPTY (brand-new account -
#                                               the row must still be created)
#
# A5 scenarios (saved ERP records + tool Library pointers):
#   g  erp_records: 2 cloud rows               local: EMPTY -> adopted
#   h  erp_records: EMPTY                      local: 2 records -> pushed
#   i  tool_library_ids: {retainer: doc-9}     local: {} -> adopted
#   j  erp_records + tool_library_ids ABSENT from the schema (section 7 not
#      run) while every other table works -> the rest of the sync must survive
#
# A6 scenarios (per-record merge + tombstones + the per-key pointer merge):
#   k  cloud holds record 1 (NEWER) and the local store holds 1 (older) plus a
#      record 2 the cloud has never seen -> BOTH survive: 1 is adopted, 2 is
#      kept AND published. (A5 replaced the whole set, losing 2.)
#   l  the cloud holds a TOMBSTONE for record 1 while this device still has it
#      -> the deletion sticks, and the local tombstone records it
#   m  a deletion made HERE, with the cloud holding both records -> published
#      as a tombstone ROW (deleted_at), never as an absent row, and no sweep
#   n  the tombstone column is ABSENT (section 8 not run) -> A5's set-wide rule
#      and its sweep, with no `deleted_at` key anywhere on the wire
#   o  the per-key pointer merge: the cloud map has {retainer, qr}, this device
#      has {qr} plus a REMOVAL clock for retainer newer than the row -> retainer
#      stays removed, qr takes the cloud's id, one push carries {qr}
#
# TEST ARTIFACT ONLY - regenerate when index.html changes, and delete the
# generated pages when the work is done. Keep this file pure ASCII (Windows
# PowerShell reads .ps1 as ANSI without a BOM).
# -Tag appends to the file name, which is the ONLY way to get a genuinely
# fresh SEED: the stub wipes and seeds on the first load of a given pathname,
# so re-visiting an existing scenario page keeps whatever the previous run left
# in localStorage. Use a tag to re-run a scenario from a clean start.
param([string]$Scenario = 'a', [string]$Tag = '')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$src = Join-Path $root 'index.html'
$stubPath = Join-Path $here 'a4-account-stub.html'
$sc = $Scenario.ToLower()
if ('a','b','c','d','e','f','g','h','i','j','k','l','m','n','o' -notcontains $sc) { throw "unknown scenario '$Scenario' (use a-j plus k-o for A6)" }
# Epoch ms for an ISO instant, so the scenarios' clocks are compared the same
# way the app parses them (never hand-computed).
function Ms([string]$iso) { return ([datetimeoffset]::Parse($iso)).ToUnixTimeMilliseconds() }
$AT = '2026-09-15T08:00:00.000Z'
$AT700 = '2026-09-15T07:00:00.000Z'
$AT730 = '2026-09-15T07:30:00.000Z'
$AT900 = '2026-09-15T09:00:00.000Z'
$out = Join-Path $root ("_a4-$sc$Tag.html")

# Every metered tool id, so scenario b can spend all of them.
$tools = @('scope-guard','qr','boq','pricing','invoice','duty','variation',
           'breakeven','fx','gpa','retainer','delay','erp')

$row = ''
$local = ''
switch ($sc) {
  'a' {
    $row = '{"plan":"premium","usage":{"qr":2,"scope-guard":1},"updated_at":"2026-09-15T08:00:00.000Z"}'
    $local = '{}'
  }
  'b' {
    $spent = ($tools | ForEach-Object { '"' + $_ + '":1' }) -join ','
    $row = '{"plan":"free","usage":{' + $spent + '},"updated_at":"2026-09-15T08:00:00.000Z"}'
    $local = '{}'
  }
  'c' {
    $row = '{"plan":"free","usage":{"qr":2},"updated_at":"2026-09-15T08:00:00.000Z"}'
    $local = '{"nexora_free_usage":"{\"qr\":1,\"boq\":4}"}'
  }
  'd' {
    $row = 'null'
    $local = '{"nexora_plan":"premium"}'
  }
  'e' {
    $row = '{"plan":"premium","usage":{"qr":2},"updated_at":"2026-09-15T08:00:00.000Z"}'
    $local = '{"nexora_plan":"premium","nexora_free_usage":"{\"qr\":3}"}'
  }
  'f' {
    $row = 'null'
    $local = '{}'
  }
  'g' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{}'
    $tables = ',"tables":{"erp_records":[' +
      '{"id":"ACME-WH-01","client":"Example Client Name","project":"Warehouse Rewire","line_count":2,"saved_at":1789000000000,"updated_at":"2026-09-15T08:00:00.000Z","data":{"savedAt":"2026-09-14T10:00:00.000Z","state":{"client":"Example Client Name","project":"Warehouse Rewire","lines":[{"sku":"1","qty":"2"},{"sku":"3","qty":"1"}]}}},' +
      '{"id":"2","client":"Second Client","project":"Panel upgrade","line_count":1,"saved_at":1788000000000,"updated_at":"2026-09-14T08:00:00.000Z","data":{"savedAt":"2026-09-13T09:00:00.000Z","state":{"client":"Second Client","project":"Panel upgrade","lines":[{"sku":"7","qty":"4"}]}}}]}'
  }
  'h' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{"calcmall_erp_records_v1":"{\"1\":{\"savedAt\":\"2026-09-15T07:00:00.000Z\",\"state\":{\"client\":\"Local Only Ltd\",\"project\":\"Local project\",\"lines\":[{\"sku\":\"1\",\"qty\":\"5\"}]}},\"7\":{\"savedAt\":\"2026-09-15T07:30:00.000Z\",\"state\":{\"client\":\"Second Local\",\"project\":\"Second project\",\"lines\":[]}}}"}'
    $tables = ',"tables":{"erp_records":[]}'
  }
  'i' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{}'
    $tables = ',"tables":{"tool_library_ids":[{"data":{"retainer":"doc-9"},"updated_at":"2026-09-15T08:00:00.000Z"}]}'
  }
  'j' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{"calcmall_erp_records_v1":"{\"9\":{\"savedAt\":\"2026-09-15T07:00:00.000Z\",\"state\":{\"client\":\"Kept Locally\",\"lines\":[]}}}"}'
    $tables = ''
    $missing = ',"missingTables":["erp_records","tool_library_ids"]'
  }
  'k' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{"calcmall_erp_records_v1":"{\"1\":{\"savedAt\":\"' + $AT700 + '\",\"state\":{\"client\":\"Old Copy Ltd\",\"project\":\"Same project\",\"lines\":[]}},\"2\":{\"savedAt\":\"' + $AT730 + '\",\"state\":{\"client\":\"Local Only Ltd\",\"project\":\"Local project\",\"lines\":[]}}}"}'
    $tables = ',"tables":{"erp_records":[' +
      '{"id":"1","client":"Cloud Copy Ltd","project":"Edited elsewhere","line_count":1,"saved_at":' + (Ms $AT900) + ',"updated_at":"2026-09-15T09:05:00.000Z","data":{"savedAt":"' + $AT900 + '","state":{"client":"Cloud Copy Ltd","project":"Edited elsewhere","lines":[{"sku":"1","qty":"1"}]}},"deleted_at":null}]}'
  }
  'l' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{"calcmall_erp_records_v1":"{\"1\":{\"savedAt\":\"' + $AT700 + '\",\"state\":{\"client\":\"Deleted Elsewhere\",\"lines\":[]}},\"2\":{\"savedAt\":\"' + $AT730 + '\",\"state\":{\"client\":\"Still Here Ltd\",\"lines\":[]}}}"}'
    $tables = ',"tables":{"erp_records":[' +
      '{"id":"1","client":"","project":"","line_count":0,"saved_at":null,"data":null,"deleted_at":"' + $AT900 + '","updated_at":"2026-09-15T09:00:01.000Z"}]}'
  }
  'm' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{"calcmall_erp_records_v1":"{\"2\":{\"savedAt\":\"' + $AT730 + '\",\"state\":{\"client\":\"Still Here Ltd\",\"lines\":[]}}}","calcmall_erp_deleted_v1":"{\"1\":' + (Ms $AT) + '}"}'
    $tables = ',"tables":{"erp_records":[' +
      '{"id":"1","client":"Removed Here","project":"Gone","line_count":0,"saved_at":' + (Ms $AT700) + ',"updated_at":"' + $AT700 + '","data":{"savedAt":"' + $AT700 + '","state":{"client":"Removed Here","lines":[]}},"deleted_at":null},' +
      '{"id":"2","client":"Still Here Ltd","project":"Kept","line_count":0,"saved_at":' + (Ms $AT730) + ',"updated_at":"' + $AT730 + '","data":{"savedAt":"' + $AT730 + '","state":{"client":"Still Here Ltd","lines":[]}},"deleted_at":null}]}'
  }
  'n' {
    $row = '{"plan":"free","usage":{}}'
    $local = '{"calcmall_erp_records_v1":"{\"2\":{\"savedAt\":\"' + $AT730 + '\",\"state\":{\"client\":\"Local Only Ltd\",\"lines\":[]}}}"}'
    $tables = ',"tables":{"erp_records":[' +
      '{"id":"1","client":"Cloud Copy Ltd","line_count":0,"saved_at":' + (Ms $AT900) + ',"updated_at":"2026-09-15T09:05:00.000Z","data":{"savedAt":"' + $AT900 + '","state":{"client":"Cloud Copy Ltd","lines":[]}}}]}'
    $noTomb = ',"noTombstone":true'
  }
  'o' {
    $row = '{"plan":"free","usage":{}}'
    # qr was written BEFORE the cloud row; retainer was REMOVED after it.
    $local = '{"calcmall_tool_library_v1":"{\"qr\":\"doc-1\"}","calcmall_tool_library_at_v1":"{\"qr\":' + ((Ms '2026-09-15T07:59:00Z')) + ',\"retainer\":' + ((Ms '2026-09-15T08:01:00Z')) + '}"}'
    $tables = ',"tables":{"tool_library_ids":[{"data":{"retainer":"doc-9","qr":"doc-4"},"updated_at":"' + $AT + '"}]}'
  }
}
if (-not $tables) { $tables = '' }
if (-not $missing) { $missing = '' }
if (-not $noTomb) { $noTomb = '' }
$offline = if ($sc -eq 'e') { ',"offline":true' } else { '' }
$cfg = '<script>window.__a4 = {"scenario":"' + $sc + '","row":' + $row + ',"local":' + $local + $offline + $tables + $missing + $noTomb + '};</script>'

$html = [System.IO.File]::ReadAllText($src)
$stub = [System.IO.File]::ReadAllText($stubPath)

# The session is captured once at module evaluation, so the stub MUST land
# before js/app.js - not merely before the boot code runs.
$marker = '<script src="js/app.js">'
$at = $html.IndexOf($marker)
if ($at -lt 0) { throw "could not find '$marker' in index.html" }
$html = $html.Insert($at, $cfg + "`r`n  " + $stub + "`r`n  ")

[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("_a4-{0}{1}.html written: {2} bytes (stub at {3})" -f $sc, $Tag, $html.Length, $at)
