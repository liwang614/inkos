$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true)]
  [string]$BookId,

  [int]$Words = 1500
)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

node D:\inkos_write\packages\cli\dist\index.js --no-stream draft $BookId `
  --words $Words `
  --context "按三万字短中篇推进。保持西方现代暗黑奇幻、吸血鬼、狼人、魔法、欧美帮派混合设定；每章解决一个局部冲突并打开更深危机；短段落，强情节，少解释。"
