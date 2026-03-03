param(
  [string]$WorkerHealthUrl = "https://doodworker.aav5roy.workers.dev/health"
)

$ErrorActionPreference = "Stop"

function Get-Health {
  param([string]$Url)
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $json = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 30
    $timer.Stop()
    return [pscustomobject]@{
      ok = [bool]$json.ok
      status = [int]$json.status
      worker_version = [string]$json.worker_version
      upstream_ok = [bool]$json.upstream.ok
      upstream_status = [int]$json.upstream.upstream_status
      upstream_latency_ms = [int]$json.upstream.latency_ms
      challenge_detected = [bool]$json.upstream.challenge_detected
      request_latency_ms = [int]$timer.ElapsedMilliseconds
      checked_at = [string]$json.checked_at
    }
  } catch {
    $timer.Stop()
    return [pscustomobject]@{
      ok = $false
      status = 0
      worker_version = ""
      upstream_ok = $false
      upstream_status = 0
      upstream_latency_ms = 0
      challenge_detected = $false
      request_latency_ms = [int]$timer.ElapsedMilliseconds
      checked_at = (Get-Date).ToString("o")
    }
  }
}

$report = Get-Health -Url $WorkerHealthUrl
$report | Format-List

if (-not $report.ok) {
  Write-Host "Health check failed." -ForegroundColor Red
  exit 1
}

Write-Host "Health check passed." -ForegroundColor Green
