<#
  Windows 작업 스케줄러 등록.
  - 매일 10:00 / 14:00 / 20:00: 브런치 새 글 확인 (Claude 미사용, 토큰 0)
  - 매주 수요일 10:00: 주 1편 제작 (Claude 사용). 브런치 원고 루틴(매일 13:47)·주말 릴스/카드뉴스 루틴과 시간대를 겹치지 않게 했다.
  관리자 권한 없이 현재 사용자로 실행된다. 해제: Unregister-ScheduledTask -TaskName "bruce-youtube-*"
#>
$ErrorActionPreference = "Stop"
$Script = Join-Path $PSScriptRoot "run_pipeline.ps1"
$Shell = "powershell.exe"
$Common = "-NoProfile -ExecutionPolicy Bypass -File `"$Script`""
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$SyncTriggers = @("10:00", "14:00", "20:00") | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
Register-ScheduledTask -TaskName "bruce-youtube-sync" -Force -Settings $Settings `
  -Trigger $SyncTriggers `
  -Action (New-ScheduledTaskAction -Execute $Shell -Argument "$Common -SkipClaude")

Register-ScheduledTask -TaskName "bruce-youtube-weekly" -Force -Settings $Settings `
  -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At "10:00") `
  -Action (New-ScheduledTaskAction -Execute $Shell -Argument $Common)

Get-ScheduledTask -TaskName "bruce-youtube-*" | Format-Table TaskName, State
