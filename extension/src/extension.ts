import * as vscode from 'vscode';
import axios from 'axios';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('aiCommenter.addComments', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showInformationMessage('No active editor found.'); return; }
        const document = editor.document;
        const fullText = editor.document.getText();
        //const code = document.getText();

        const selection = editor.selection;

        // Insert AI-modified snippet back into full text
        const start = editor.document.offsetAt(selection.start);
        const end = editor.document.offsetAt(selection.end);

        const code = selection.isEmpty ? editor.document.getText() // fallback to full file
                    : editor.document.getText(selection);

        const original = code; // Save original code for diff view

        vscode.window.showInformationMessage('Sending code to AI Commenter backend...');
        try {
            const response = await axios.post('http://localhost:5000/api/comments', { code, language: document.languageId });
            const commentedCodeRaw = response.data.commentedCode;
            const commentedCode = cleanLLMResponse(commentedCodeRaw);

            const modifiedFullText =
                fullText.slice(0, start) +
                commentedCode +
                fullText.slice(end);

            //const edit = new vscode.WorkspaceEdit();
            //const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(code.length));
            //edit.replace(document.uri, fullRange, newCode);
            //await vscode.workspace.applyEdit(edit);

            //const leftDoc = await vscode.workspace.openTextDocument({ content: original });
            // const rightDoc = await vscode.workspace.openTextDocument({ content: commentedCode });


            //const originalUri = vscode.Uri.file(editor.document.fileName);
            const originalUri = editor.document.uri;
            const modifiedUri = vscode.Uri.parse(`untitled:${editor.document.fileName}-AIComments`);

            const modifiedDoc = await vscode.workspace.openTextDocument(modifiedUri);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(modifiedDoc.positionAt(0), modifiedDoc.positionAt(modifiedDoc.getText().length));
            edit.replace(modifiedUri, fullRange, modifiedFullText);
            await vscode.workspace.applyEdit(edit);

            await vscode.commands.executeCommand(
                    'vscode.diff',
                    originalUri,  // left pane = real file
                    modifiedUri,  // right pane = AI-commented version
                    'AI Comments Diff'
                    );

            vscode.window.showTextDocument(modifiedUri).then(editor => {
            editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
            editor.selection = selection;});

            // Get the text from the right-hand editor (AI diff, including user-accepted/rejected changes)
            const modifiedEditor = vscode.window.visibleTextEditors.find(
                    e => e.document.uri.toString() === modifiedUri.toString()
                        );

            if (!modifiedEditor) {
                vscode.window.showErrorMessage("Could not find AI diff editor.");
                return;
            }

            const finalContent = modifiedEditor.document.getText();

            const userChoice = await vscode.window.showInformationMessage(
            "AI comments generated. What do you want to do?",
            "Accept Changes",
            "Insert to Editor",
            "Cancel"
                );

            if (userChoice === "Accept Changes") {
                const workspaceEdit = new vscode.WorkspaceEdit();
                const currentDoc = editor.document;
                if (!selection.isEmpty) {
                    workspaceEdit.replace(originalUri, selection, modifiedFullText.slice(start, start + commentedCode.length));
                } else {
                    const fullRange = new vscode.Range(
                    currentDoc.positionAt(0),
                    currentDoc.positionAt(editor.document.getText().length)
                );
            workspaceEdit.replace(originalUri, fullRange, modifiedFullText);
            }
            await vscode.workspace.applyEdit(workspaceEdit);
            //await currentDoc.save();
            vscode.window.showInformationMessage("AI comments accepted and applied!");
        }

        if (userChoice === "Insert to Editor") {
            //const position = editor.selection.active;

            const originalDoc = await vscode.workspace.openTextDocument(originalUri);
            const originalEditor = await vscode.window.showTextDocument(originalDoc, editor.viewColumn);

            // Convert to Positions in originalDoc
            const startPos = originalDoc.positionAt(start);
            const endPos = originalDoc.positionAt(end);
            //const snippetRange = new vscode.Range(startPos, endPos);

            const snippetRange = new vscode.Range(originalEditor.document.positionAt(0),
            originalEditor.document.lineAt(originalEditor.document.lineCount - 1).range.end)

            /*const insertPosition = selection.isEmpty
                                     ? originalEditor.selection.active  // No selection → insert at cursor
                                     : selection.end;            // Selection → insert *after* selection

            */    
            originalEditor.edit(editBuilder => {
                editBuilder.replace(snippetRange, finalContent);
            });
            vscode.window.showInformationMessage("AI commented code inserted below cursor!");
        }

           // vscode.window.showInformationMessage('AI Comments added successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });
    context.subscriptions.push(disposable);
}
export function deactivate() {}

function cleanLLMResponse(raw: string): string {
    // Remove common code fences and language tags
    return raw
        .replace(/```[a-zA-Z]*\s*/g, '')  // removes ```csharp, ```js, ``` etc.
        .replace(/```/g, '')               // removes closing ```
        .replace(/^["'\s]+|["'\s]+$/g, '') // trim stray quotes/whitespace
        .trim();
}