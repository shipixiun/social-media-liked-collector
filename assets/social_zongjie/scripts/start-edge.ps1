param(
  [int]$Port = 9222
)

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$profile = Join-Path $PSScriptRoot '..\.edge-profile'

if (-not (Test-Path -LiteralPath $edge)) {
  throw "未找到 Microsoft Edge: $edge"
}

$arguments = @(
  "--remote-debugging-port=$Port"
  "--user-data-dir=$profile"
  '--no-first-run'
  'https://www.douyin.com/user/self?from_tab_name=main&showTab=like'
  'https://www.xiaohongshu.com/user/profile/60abbbe10000000001003c44?tab=liked'
)

Start-Process -FilePath $edge -ArgumentList $arguments
Write-Host "Edge 已启动。首次使用请在两个页面中手动登录。调试端口: $Port"
