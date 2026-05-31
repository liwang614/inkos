$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

node D:\inkos_write\packages\cli\dist\index.js --no-stream book create `
  --title "夜血同盟" `
  --genre other `
  --platform tomato `
  --target-chapters 20 `
  --chapter-words 1500 `
  --brief .\briefs\vampire-gang-werewolf.md `
  --lang zh
