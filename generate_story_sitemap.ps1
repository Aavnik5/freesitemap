$ErrorActionPreference = "Stop"

$baseWorker = "https://doodworker.aav5roy.workers.dev"
$maxPages = 12
$stories = @()
$today = (Get-Date).ToString("yyyy-MM-dd")

for ($page = 1; $page -le $maxPages; $page++) {
  $endpoint = "$baseWorker/kahani-feed?page=$page&per_page=24"
  try {
    $res = Invoke-RestMethod -Uri $endpoint -Method Get -TimeoutSec 30
  } catch {
    break
  }

  if (-not $res.result -or -not $res.result.stories) { break }
  $stories += $res.result.stories
  if (-not $res.result.has_next) { break }
}

$dedupe = @{}
foreach ($story in $stories) {
  if (-not $story.url) { continue }
  if (-not $dedupe.ContainsKey($story.url)) {
    $dedupe[$story.url] = $story
  }
}

$lines = @()
$lines += '<?xml version="1.0" encoding="UTF-8"?>'
$lines += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'

foreach ($url in $dedupe.Keys) {
  $story = $dedupe[$url]
  $viewerUrl = "https://freepornx.site/story-viewer.html?url=" + [System.Uri]::EscapeDataString([string]$story.url)
  $lastmod = $today
  if ($story.date) {
    try { $lastmod = ([datetime]$story.date).ToString("yyyy-MM-dd") } catch {}
  }

  $lines += "  <url>"
  $lines += "    <loc>$viewerUrl</loc>"
  $lines += "    <lastmod>$lastmod</lastmod>"
  $lines += "    <changefreq>weekly</changefreq>"
  $lines += "    <priority>0.7</priority>"
  $lines += "  </url>"
}

$lines += "</urlset>"
Set-Content -Path "sitemap_stories.xml" -Value $lines -Encoding UTF8

foreach ($mapPath in @("sitemap.xml", "sitemap_index.xml")) {
  if (-not (Test-Path $mapPath)) { continue }
  $raw = Get-Content -Path $mapPath -Raw
  $updated = [regex]::Replace($raw, "<lastmod>[^<]+</lastmod>", "<lastmod>$today</lastmod>")
  Set-Content -Path $mapPath -Value $updated -Encoding UTF8
}

Write-Output "Generated sitemap_stories.xml with $($dedupe.Count) URLs and refreshed sitemap lastmod to $today"
