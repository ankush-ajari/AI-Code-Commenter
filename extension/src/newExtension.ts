import * as vscode from 'vscode';
import axios from 'axios';

interface AIComment {
    line: number;       // relative line number in selection (0-based)
    comment: string;    // the inline comment
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('aiCommenter.addComments', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showInformationMessage('No active editor found.'); return; }

        const document = editor.document;
        const selection = editor.selection;

        const code = selection.isEmpty ? document.getText() : document.getText(selection);
        const selectionStartLine = selection.start.line;

        vscode.window.showInformationMessage('Sending code to AI Commenter backend...');

        try {
            // Call backend to get AI comments
            const response = await axios.post('http://localhost:5000/api/comments', {
                code,
                language: document.languageId
            });

            const commentedCode = response.data;

            console.log("Raw backend data:", response.data);

            //const commentedCode = cleanLLMResponse(commentedCodeRaw);

            // Parse AI response into structured JSON
            // Expect JSON array: [{ line: 1, comment: "// comment here" }, ...]
            let aiComments: AIComment[] = [];
            try {

                console.log("commentedCode type:", typeof commentedCode);
                console.log("commentedCode value:", commentedCode);
                // Case 1: commentedCode is already an object
                if (typeof commentedCode === 'object') {
                    aiComments = commentedCode as AIComment[];
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

            } catch (err) {
                vscode.window.showErrorMessage("Failed to parse AI comments JSON. Ensure backend returns structured JSON.");
                return;
            }

            // Map comments to editor decorations
            const decorations: vscode.DecorationOptions[] = aiComments.map(c => {
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

            vscode.window.showInformationMessage(
                "AI comments displayed inline. Click decorations or use Accept commands to insert them into code."
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }

function cleanLLMResponse(raw: string): string {
    // Remove common code fences and language tags
    return raw
        .replace(/```[a-zA-Z]*\s*/g, '')  // removes ```csharp, ```js, etc.
        .replace(/```/g, '')               // removes closing ```
        .replace(/^["'\s]+|["'\s]+$/g, '') // trim stray quotes/whitespace
        .trim();
}
