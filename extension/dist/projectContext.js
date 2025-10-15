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
exports.registerUpdateProjectContextCommand = registerUpdateProjectContextCommand;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
/**
 * Command to update project context.
 */
function registerUpdateProjectContextCommand(context) {
    const disposable = vscode.commands.registerCommand('aiCommenter.updateProjectContext', async () => {
        const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!projectPath) {
            vscode.window.showErrorMessage("No workspace folder found to build project context.");
            return;
        }
        vscode.window.showInformationMessage('Updating project context...');
        try {
            const response = await axios_1.default.post('http://localhost:5000/api/project-context/update', {
                projectPath
            });
            if (response.status === 200) {
                vscode.window.showInformationMessage('✅ Project context updated successfully');
            }
            else {
                vscode.window.showErrorMessage('Failed to update project context');
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error updating project context: ${err}`);
        }
    });
    context.subscriptions.push(disposable);
}
