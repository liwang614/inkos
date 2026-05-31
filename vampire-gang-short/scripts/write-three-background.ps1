$ErrorActionPreference = "Stop"

$Project = "D:\inkos_write\vampire-gang-short"
$Cli = "D:\inkos_write\packages\cli\dist\index.js"
$LogDir = Join-Path $Project "logs"
$RunLog = Join-Path $LogDir "write-three-run.log"
$StatusLog = Join-Path $LogDir "write-three-status.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $Project

"[$(Get-Date -Format s)] background write started" | Add-Content -LiteralPath $RunLog

node $Cli --no-stream write next 夜血同盟 --count 3 --words 1500 --context "先写前三章。严格围绕 brief：西方现代暗黑奇幻、吸血鬼、狼人、魔法、欧美帮派；短段落，强情节，每章解决一个局部冲突并打开更深危机。" *>> $RunLog
$exitCode = $LASTEXITCODE

"[$(Get-Date -Format s)] background write exited with code $exitCode" | Add-Content -LiteralPath $RunLog
node $Cli status 夜血同盟 *>> $StatusLog
Get-ChildItem -Force "books\夜血同盟\chapters" |
  Select-Object Name, Length, LastWriteTime |
  Format-Table -AutoSize |
  Out-String |
  Add-Content -LiteralPath $StatusLog

exit $exitCode
