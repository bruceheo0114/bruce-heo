<#
  bruce-youtube 주간 파이프라인 (Windows)

  1. 저장소 최신화
  2. 브런치 새 글 → source/brunch Markdown → 새 Episode (PACKAGE_PENDING)
  3. 이번 주에 아직 만든 패키지가 없을 때만 가장 오래된 Episode 1편을 Claude Code로 제작
  4. 검사(finalize) 통과 + 변경 범위 확인 뒤 commit/push
  Higgsfield는 이 스크립트에서 절대 실행되지 않는다 (--disallowedTools mcp__higgsfield).

  사용: powershell -ExecutionPolicy Bypass -File bruce-youtube\scripts\run_pipeline.ps1 [-NoPush] [-SkipClaude] [-Model sonnet]
#>
param(
  [switch]$NoPush,
  [switch]$SkipClaude,
  [string]$Model = "sonnet",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot
$LogDir = Join-Path $RepoRoot "bruce-youtube\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Today = Get-Date -Format "yyyy-MM-dd"
$Log = Join-Path $LogDir "$Today-pipeline.log"

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Path $Log -Value $line -Encoding utf8
  Write-Host $line
}

try {
  Write-Log "start"
  git pull --rebase --quiet origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "git pull 실패" }

  node src/cli/youtube.js sync
  if ($LASTEXITCODE -ne 0) {
    # brunch.co.kr 접속이 막히면 GitHub Actions가 저장한 content/*/source.json으로 대신 확인한다.
    Write-Log "RSS 확인 실패, 로컬 source.json으로 재시도"
    node src/cli/youtube.js sync --local
    if ($LASTEXITCODE -ne 0) { throw "sync 실패" }
  }

  $episode = (node src/cli/youtube.js pending --weekly | Select-Object -First 1)
  if (-not $episode -or $SkipClaude) {
    Write-Log "이번 실행에서 제작할 Episode 없음 (주 1편 상한 또는 새 글 없음)"
  } else {
    Write-Log "제작 시작: $episode"
    $prompt = @"
bruce-youtube/prompts/youtube_producer.md 를 읽고 그대로 따른다. EPISODE=$episode
작업 폴더는 bruce-youtube/episodes/$episode 이다. 이 Episode만 만든다.
명령은 저장소 루트에서 node src/cli/youtube.js ... 로 실행한다.
"@
    $usageFile = Join-Path $LogDir "$Today-$episode-claude.json"
    claude -p $prompt `
      --model $Model `
      --output-format json `
      --permission-mode acceptEdits `
      --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "WebSearch" "WebFetch" "Bash(node src/cli/youtube.js:*)" `
      --disallowedTools "mcp__higgsfield" "mcp__ElevenLabs" `
      | Out-File -FilePath $usageFile -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "claude 실행 실패 ($usageFile 참고)" }

    try {
      $usage = Get-Content $usageFile -Raw | ConvertFrom-Json
      Write-Log ("Claude 사용량: 비용환산 `${0} · turns {1} · in {2} · cache_read {3} · out {4}" -f `
        $usage.total_cost_usd, $usage.num_turns, $usage.usage.input_tokens, `
        $usage.usage.cache_read_input_tokens, $usage.usage.output_tokens)
    } catch { Write-Log "사용량 JSON 해석 실패" }

    $status = (Get-Content "bruce-youtube\episodes\$episode\status.json" -Raw | ConvertFrom-Json).status
    if ($status -eq "PACKAGE_PENDING") {
      node src/cli/youtube.js finalize $episode
      if ($LASTEXITCODE -ne 0) { throw "$episode 패키지 검사 실패 — 커밋하지 않음" }
    }
    node src/cli/youtube.js guard $episode
    if ($LASTEXITCODE -ne 0) { throw "$episode 밖의 Episode 파일이 바뀜 — 커밋하지 않음" }
  }

  git add bruce-youtube
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    $message = if ($episode -and -not $SkipClaude) { "content: YouTube package $episode" } else { "chore: sync Brunch sources for YouTube" }
    git commit --quiet -m $message
    if (-not $NoPush) {
      git pull --rebase --quiet origin $Branch
      git push --quiet origin $Branch
      if ($LASTEXITCODE -ne 0) { throw "git push 실패" }
    }
    Write-Log "commit: $message"
  } else {
    Write-Log "변경 없음"
  }
  Write-Log "done"
} catch {
  Write-Log "ERROR $($_.Exception.Message)"
  exit 1
}
