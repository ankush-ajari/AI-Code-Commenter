import * as vscode from 'vscode';
import axios from 'axios';

/**
 * Command to update project context.
 */
export function registerUpdateProjectContextCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('aiCommenter.updateProjectContext', async () => {
        const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!projectPath) {
            vscode.window.showErrorMessage("No workspace folder found to build project context.");
            return;
        }

        vscode.window.showInformationMessage('Updating project context...');
        try {
            const response = await axios.post('http://localhost:5000/api/project-context/update', {
                projectPath
            });

            if (response.status === 200) {
                vscode.window.showInformationMessage('✅ Project context updated successfully');
            } else {
                vscode.window.showErrorMessage('Failed to update project context');
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Error updating project context: ${err}`);
        }
    });

    context.subscriptions.push(disposable);
}
