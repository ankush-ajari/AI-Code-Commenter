"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
function activate(context) {
    const disposable = vscode.commands.registerCommand('aiCommenter.addComments', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const code = selection.isEmpty ? document.getText() : document.getText(selection);
        const selectionStartLine = selection.start.line;
        vscode.window.showInformationMessage('Sending code to AI Commenter backend...');
        try {
            // Call backend to get AI comments
            const response = await axios_1.default.post('http://localhost:5000/api/comments', {
                code,
                language: document.languageId
            });
            const commentedCode = response.data;
            console.log("Raw backend data:", response.data);
            //const commentedCode = cleanLLMResponse(commentedCodeRaw);
            // Parse AI response into structured JSON
            // Expect JSON array: [{ line: 1, comment: "// comment here" }, ...]
            let aiComments = [];
            try {
                console.log("commentedCode type:", typeof commentedCode);
                console.log("commentedCode value:", commentedCode);
                // Case 1: commentedCode is already an object
                if (typeof commentedCode === 'object') {
                    aiComments = commentedCode;
                }
                // Case 2: commentedCode is a JSON string
                else if (typeof commentedCode === 'string') {
                    // Clean and parse it
                    const jsonString = commentedCode
                        .replace(/\\n/g, '')
                        .replace(/\\"/g, '"')
                        .replace(/^[\s"]+|[\s"]+$/g, '');
                    aiComments = JSON.parse(jsonString);
                }
                else {
                    throw new Error('Invalid comment format');
                }
            }
            catch (err) {
                vscode.window.showErrorMessage("Failed to parse AI comments JSON. Ensure backend returns structured JSON.");
                return;
            }
            // Map comments to editor decorations
            const decorations = aiComments.map(c => {
                const lineNum = selectionStartLine + c.line; // absolute line in document
                return {
                    range: new vscode.Range(lineNum, 0, lineNum, 0),
                    renderOptions: {
                        after: {
                            contentText: c.comment,
                            color: 'gray',
                            margin: '0 0 0 1rem'
                        }
                    },
                    hoverMessage: "💡 Click to accept this comment"
                };
            });
            // Create decoration type
            const aiCommentDecoration = vscode.window.createTextEditorDecorationType({
                after: { color: 'gray', margin: '0 0 0 1rem' }
            });
            editor.setDecorations(aiCommentDecoration, decorations);
            // Register command for accepting comment
            decorations.forEach((dec, index) => {
                const lineNum = selectionStartLine + aiComments[index].line;
                const acceptCommandId = `aiComments.accept.${lineNum}`;
                const disposableCmd = vscode.commands.registerTextEditorCommand(acceptCommandId, ed => {
                    ed.edit(editBuilder => {
                        editBuilder.insert(new vscode.Position(lineNum, 0), aiComments[index].comment + '\n');
                    });
                    // Remove decoration after accepting
                    const updatedDec = decorations.filter((_, i) => i !== index);
                    editor.setDecorations(aiCommentDecoration, updatedDec);
                });
                context.subscriptions.push(disposableCmd);
            });
            vscode.window.showInformationMessage("AI comments displayed inline. Click decorations or use Accept commands to insert them into code.");
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
function cleanLLMResponse(raw) {
    // Remove common code fences and language tags
    return raw
        .replace(/```[a-zA-Z]*\s*/g, '') // removes ```csharp, ```js, etc.
        .replace(/```/g, '') // removes closing ```
        .replace(/^["'\s]+|["'\s]+$/g, '') // trim stray quotes/whitespace
        .trim();
}
