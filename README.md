# AI Code Commenter

This is a combined VS Code extension + .NET backend that adds AI-generated comments to your code using Ollama local models.

## Setup

### Prerequisites
- Node.js 18+
- .NET 8 SDK
- VS Code
- Ollama installed and running locally

### Run Backend
```bash
cd backend
dotnet restore
dotnet run
```

### Run Extension
```bash
cd extension
npm install
npm run compile
```


### Ollama Setup
Install and pull the model:
```bash
ollama pull codellama
ollama serve
```

### Optional: Switch to Online Model
Modify backend `LlmService.cs` with your preferred API endpoint and key.
