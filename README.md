
# AI Code Commenter


AI Code Commenter is a two-part system:
- **VS Code Extension** (`extension/extensionwithCodeLens.ts`): Adds AI-generated comments to your code directly in VS Code.
- **.NET Backend** (`backend/CommentGenerationService.cs`): Handles requests from the extension and communicates with your local LLM via Ollama.


> **Note:** This extension is tested and works with the local LLM model `mistral:instruct` via Ollama. Using other models (e.g., `codellama`) may require code changes in the backend, especially in `LlmService.cs`.

## Features

### 1. Create Project Context
- Run once at the beginning to generate a full project context and summary.
- Update only if there are major changes in the project.

### 2. Code Comments
- Uses the summary of project context to generate comments for your code.
- Users can accept or reject the generated comments.
- Comments can be generated for the entire file or for a selected code snippet.
- For best performance, select no more than 50-60 lines of code at a time.
- Depending on the model, comment generation may take time or fail; users can retry if needed.


## Setup

### Prerequisites
- Node.js 18+
- .NET 8 SDK
- VS Code
- Ollama installed and running locally


### Backend Setup (`backend/`)
```bash
cd backend
dotnet restore
dotnet run
```


### Extension Setup (`extension/`)
```bash
cd extension
npm install
npm run compile
```

### Ollama & Model Setup
Install Ollama and pull the tested model:
```bash
ollama pull mistral:instruct
ollama serve
```

> If you use a different model (e.g., `codellama`), you may need to update backend logic in `LlmService.cs`.

### Optional: Use Online Model
You can modify `backend/Services/LlmService.cs` to use an online API endpoint and key if desired.
