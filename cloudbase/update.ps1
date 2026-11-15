param([switch]$IncludeBackend)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$environmentId = 'fresh-salamander-d5e3n8i7cbe7352'
$tcb = Get-Command 'tcb.cmd' -ErrorAction SilentlyContinue
if (-not $tcb) { throw '请先安装腾讯云 CloudBase CLI，并运行 tcb login。' }

function Run-Checked($executable, [string[]]$arguments) {
  & $executable @arguments
  if ($LASTEXITCODE -ne 0) { throw "执行失败：$executable" }
}

Push-Location $projectDir
try {
  Run-Checked 'npm.cmd' @('run', 'build:cloudbase')
  if ($IncludeBackend) {
    $functionDir = Join-Path $PSScriptRoot 'functions\soundtrace-api'
    Run-Checked 'npm.cmd' @('ci', '--omit=dev', '--prefix', $functionDir)

    $body = ('{"FunctionName":"soundtrace-api","Namespace":"' + $environmentId + '"}').Replace('"', '\"')
    $raw = & $tcb.Source api scf GetFunction --api-version 2018-04-16 --body $body --json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $raw.IndexOf('{') -lt 0) { throw '无法读取云函数配置，请先运行 tcb login。' }
    $detail = $raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
    $keys = @($detail.data.Environment.Variables | Where-Object { $_.Key -eq 'SOUNDTRACE_STORE_KEY' })
    if ($keys.Count -ne 1 -or -not $keys[0].Value) { throw '云函数缺少现有存储密钥，已停止更新。' }
    $extraVariables = @($detail.data.Environment.Variables | Where-Object { $_.Key -notin @('SOUNDTRACE_STORE_KEY', 'SOUNDTRACE_CLOUDBASE_ENV') })
    if ($extraVariables.Count -gt 0) { throw '云函数包含额外环境变量；为避免覆盖，请手动核对后端部署配置。' }

    $previousKey = [Environment]::GetEnvironmentVariable('SOUNDTRACE_STORE_KEY', 'Process')
    $env:SOUNDTRACE_STORE_KEY = $keys[0].Value
    Push-Location $PSScriptRoot
    try {
      $output = & $tcb.Source fn deploy soundtrace-api --dir functions\soundtrace-api --force --install-dependency false -e $environmentId --json 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw ('云函数更新失败：' + $output.Replace($env:SOUNDTRACE_STORE_KEY, '[redacted]')) }
      $output = & $tcb.Source config update fn soundtrace-api --config-file cloudbaserc.configure.json -e $environmentId --yes --json 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw ('云函数配置更新失败：' + $output.Replace($env:SOUNDTRACE_STORE_KEY, '[redacted]')) }
    } finally {
      [Environment]::SetEnvironmentVariable('SOUNDTRACE_STORE_KEY', $previousKey, 'Process')
      Pop-Location
    }
  }
  Run-Checked $tcb.Source @('hosting', 'deploy', (Join-Path $PSScriptRoot 'dist'), '-e', $environmentId, '--verify', '--json')
} finally {
  Pop-Location
}
