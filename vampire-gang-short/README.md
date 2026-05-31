# vampire-gang-short

独立 InkOS 写作项目，用于创作三万字左右的西方现代暗黑奇幻短中篇。

## 1. 配置模型

编辑 `.env`，至少填写：

```env
INKOS_LLM_PROVIDER=openai
INKOS_LLM_BASE_URL=你的接口地址
INKOS_LLM_API_KEY=你的 API Key
INKOS_LLM_MODEL=你的模型名
INKOS_LLM_API_FORMAT=chat
INKOS_LLM_STREAM=false
```

如果是本地无 Key 代理，`INKOS_LLM_API_KEY` 可以留空。

## 2. 检查连通性

```powershell
cd D:\inkos_write\vampire-gang-short
node D:\inkos_write\packages\cli\dist\index.js doctor
```

看到 `API Connectivity: OK` 后再创建作品。

## 3. 创建作品

```powershell
.\scripts\create-book.ps1
```

命令完成后，记录输出里的 `book-id`。

## 4. 写下一章

```powershell
.\scripts\write-next.ps1 -BookId <book-id>
```

重复运行直到约 20 章。章节正文会在：

```text
books\<book-id>\chapters
```

## 5. 导出

```powershell
node D:\inkos_write\packages\cli\dist\index.js export <book-id> --format md --output .\exports\夜血同盟.md
node D:\inkos_write\packages\cli\dist\index.js export <book-id> --format txt --output .\exports\夜血同盟.txt
```

## 不同作品使用不同模型

这个项目可以用自己的 `.env`，不会影响 `D:\inkos_write\test-project`。后续如果要写另一部作品，建议再建一个独立项目目录，每个目录维护自己的 `.env`。

临时换模型也可以在命令前加 CLI 覆盖：

```powershell
node D:\inkos_write\packages\cli\dist\index.js --no-stream --base-url https://example.com/v1 --model your-model draft <book-id> --words 1500
```
