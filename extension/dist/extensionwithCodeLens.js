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
const projectContext_1 = require("./projectContext");
const suggestionsMap = new Map();
// lightweight id generator
function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
/**
 * Try to find the current line number for a previously captured originalText.
 * We first check approxLine, then a small +/- window, then a full scan.
 */
function findCurrentLine(document, originalText, approxLine) {
    const trimmed = originalText.trim();
    const total = document.lineCount;
    let line = Math.max(0, Math.min(approxLine, total - 1));
    try {
        if (document.lineAt(line).text.trim() === trimmed)
            return line;
    }
    catch { /* ignore */ }
    const window = 8;
    for (let d = 1; d <= window; d++) {
        const up = line - d;
        const down = line + d;
        if (up >= 0 && document.lineAt(up).text.trim() === trimmed)
            return up;
        if (down < total && document.lineAt(down).text.trim() === trimmed)
            return down;
    }
    // fallback: first line that contains the trimmed text (less strict)
    if (trimmed.length > 0) {
        for (let i = 0; i < total; i++) {
            if (document.lineAt(i).text.includes(trimmed))
                return i;
        }
    }
    return line; // last resort
}
// CodeLens provider instance (we will call refresh() when suggestions change)
class SuggestionCodeLensProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChange.event;
    }
    refresh() { this._onDidChange.fire(); }
    provideCodeLenses(document) {
        const uriKey = document.uri.toString();
        const suggestions = suggestionsMap.get(uriKey) ?? [];
        const lenses = [];
        for (const s of suggestions) {
            if (s.accepted)
                continue;
            // compute current line using originalLine as approximate hint
            const currentLine = findCurrentLine(document, s.originalText, s.originalLine);
            const range = new vscode.Range(currentLine, 0, currentLine, 0);
            // 1) Show the suggested comment as a passive CodeLens (no-op or info)
            lenses.push(new vscode.CodeLens(range, {
                title: s.comment,
                command: 'aiComments.showComment',
                arguments: [document.uri, s.id]
            }));
            // 2) Accept action
            lenses.push(new vscode.CodeLens(range, {
                title: '✅ Accept',
                command: 'aiComments.acceptComment',
                arguments: [document.uri, s.id]
            }));
            // 3) Reject action
            lenses.push(new vscode.CodeLens(range, {
                title: '❌ Reject',
                command: 'aiComments.rejectComment',
                arguments: [document.uri, s.id]
            }));
        }
        return lenses;
    }
}
function activate(context) {
    const codeLensProvider = new SuggestionCodeLensProvider();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider));
    // show passive comment (optional)
    context.subscriptions.push(vscode.commands.registerCommand('aiComments.showComment', async (uri, id) => {
        const arr = suggestionsMap.get(uri.toString()) ?? [];
        const s = arr.find(x => x.id === id);
        if (s) {
            // simple info popup — developer can use Accept/Reject actions instead
            vscode.window.showInformationMessage(s.comment);
        }
    }));
    // Accept command: inserts the comment above the matched line and marks suggestion accepted
    context.subscriptions.push(vscode.commands.registerCommand('aiComments.acceptComment', async (uri, id) => {
        const key = uri.toString();
        const suggestions = suggestionsMap.get(key);
        if (!suggestions) {
            vscode.window.showErrorMessage('No suggestions for this file.');
            return;
        }
        const s = suggestions.find(x => x.id === id);
        if (!s) {
            vscode.window.showErrorMessage('Suggestion not found.');
            return;
        }
        if (s.accepted) {
            vscode.window.showInformationMessage('This suggestion has already been accepted.');
            return;
        }
        // open document
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        // locate current line for insertion
        const targetLine = findCurrentLine(doc, s.originalText, s.originalLine);
        // avoid duplicate insertion — search a small neighborhood for exact comment text
        const searchStart = Math.max(0, targetLine - 1);
        const searchEnd = Math.min(doc.lineCount - 1, targetLine + 1);
        const normalizedComment = s.comment.trim();
        for (let ln = searchStart; ln <= searchEnd; ln++) {
            if (doc.lineAt(ln).text.includes(normalizedComment)) {
                // mark accepted, refresh lenses and return
                s.accepted = true;
                suggestionsMap.set(key, suggestions);
                codeLensProvider.refresh();
                vscode.window.showInformationMessage('Comment already exists in file; marked accepted.');
                return;
            }
        }
        // compute indentation of the target line
        const indentMatch = doc.lineAt(targetLine).text.match(/^\s*/);
        const indent = indentMatch ? indentMatch[0] : '';
        // ensure comment text starts with // (simple safeguard)
        let insertText = normalizedComment;
        if (!/^[\/#]/.test(insertText)) {
            // fallback: use '//' as generic single-line comment
            insertText = '// ' + insertText;
        }
        await editor.edit(editBuilder => {
            // insert above the target line so it appears as "above" the code
            editBuilder.insert(new vscode.Position(targetLine, 0), indent + insertText + '\n');
        });
        // mark accepted and refresh CodeLens
        s.accepted = true;
        suggestionsMap.set(key, suggestions);
        codeLensProvider.refresh();
        vscode.window.showInformationMessage(`✅ Accepted comment inserted at line ${targetLine + 1}`);
    }));
    // Reject command: remove the suggestion immediately and refresh CodeLens
    context.subscriptions.push(vscode.commands.registerCommand('aiComments.rejectComment', async (uri, id) => {
        const key = uri.toString();
        const suggestions = suggestionsMap.get(key);
        if (!suggestions) {
            vscode.window.showErrorMessage('No suggestions for this file.');
            return;
        }
        const idx = suggestions.findIndex(x => x.id === id);
        if (idx === -1) {
            vscode.window.showErrorMessage('Suggestion not found.');
            return;
        }
        suggestions.splice(idx, 1); // remove the suggestion
        suggestionsMap.set(key, suggestions);
        codeLensProvider.refresh();
        vscode.window.showInformationMessage('Suggestion rejected.');
    }));
    // ---------------- original command that calls backend and parses (kept intact) ----------------
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
        // frontend: determine project path
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("No workspace folder found. Cannot provide project context.");
            return;
        }
        // Use the first workspace folder as project path
        const projectPath = workspaceFolders[0].uri.fsPath;
        try {
            // Call backend to get AI comments
            const response = await axios_1.default.post('http://localhost:5000/api/comments', {
                code,
                language: document.languageId,
                projectPath // send project path to backend
            });
            const commentedCode = response.data;
            console.log("Raw backend data:", response.data);
            let aiComments = [];
            try {
                console.log("commentedCode type:", typeof commentedCode);
                console.log("commentedCode value:", commentedCode);
                if (typeof commentedCode === 'object') {
                    aiComments = commentedCode;
                }
                else if (typeof commentedCode === 'string') {
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
            // build Suggestion[] and attach to document
            const suggestions = [];
            for (const c of aiComments) {
                const absLine = selectionStartLine + c.line;
                const safeLine = Math.max(0, Math.min(absLine, document.lineCount - 1));
                const originalText = document.lineAt(safeLine).text;
                suggestions.push({
                    id: makeId(),
                    relLine: c.line,
                    originalLine: safeLine,
                    originalText: originalText,
                    comment: c.comment.trim(),
                    accepted: false
                });
            }
            suggestionsMap.set(document.uri.toString(), suggestions);
            // trigger CodeLens refresh so the new suggestions appear
            codeLensProvider.refresh();
            vscode.window.showInformationMessage("✅ AI comments generated. Use the CodeLens above lines to Accept/Reject.");
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });
    context.subscriptions.push(disposable);
    // ---------------------------------------------------------------------------------------------
    // Register new project context command
    (0, projectContext_1.registerUpdateProjectContextCommand)(context);
}
function deactivate() { }
// kept for compatibility (unused by the provider logic)
function cleanLLMResponse(raw) {
    return raw
        .replace(/```[a-zA-Z]*\s*/g, '')
        .replace(/```/g, '')
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .trim();
}
