param(
  [string]$SiteBase = "https://freepornx.site",
  [string]$WorkerBase = "https://doodworker.aav5roy.workers.dev"
)

$ErrorActionPreference = "Stop"

function Measure-Endpoint {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Url
  )
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $res = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 30 -UseBasicParsing
    $timer.Stop()
    return [pscustomobject]@{
      check = $Name
      status = [int]$res.StatusCode
      latency_ms = [int]$timer.ElapsedMilliseconds
      ok = $true
      url = $Url
    }
  } catch {
    $timer.Stop()
    $code = 0
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $code = [int]$_.Exception.Response.StatusCode
    }
    return [pscustomobject]@{
      check = $Name
      status = $code
      latency_ms = [int]$timer.ElapsedMilliseconds
      ok = $false
      url = $Url
    }
  }
}

$checks = @(
  @{ name = "Homepage"; url = "$SiteBase/" },
  @{ name = "Stories Tab"; url = "$SiteBase/?tab=stories" },
  @{ name = "Robots"; url = "$SiteBase/robots.txt" },
  @{ name = "Sitemap Index"; url = "$SiteBase/sitemap.xml" },
  @{ name = "Worker Health"; url = "$WorkerBase/health" },
  @{ name = "Stories Feed"; url = "$WorkerBase/stories-feed?page=1&per_page=12" }
)

$results = @()
foreach ($check in $checks) {
  $results += Measure-Endpoint -Name $check.name -Url $check.url
}

Write-Host ""
Write-Host "Phase 0 baseline checks:"
$results | Format-Table -AutoSize

$failed = $results | Where-Object { -not $_.ok -or $_.status -lt 200 -or $_.status -ge 400 }
if (@($failed).Count -gt 0) {
  Write-Host ""
  Write-Host "Some checks failed. Review endpoints above." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "All baseline checks passed." -ForegroundColor Green
