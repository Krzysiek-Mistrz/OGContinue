import { ConfigHandler } from "core/config/ConfigHandler";
import { applyCodeBlock } from "core/edit/lazy/applyCodeBlock";
import {
  inferResolvedUriFromRelativePath,
  resolveWorkspacePath,
} from "core/util/ideUtils";
import { getUriPathBasename } from "core/util/uri";
import * as vscode from "vscode";

import { VerticalDiffManager } from "../diff/vertical/manager";
import { VsCodeIde } from "../VsCodeIde";
import { VsCodeWebviewProtocol } from "../webviewProtocol";

export interface ApplyToFileOptions {
  streamId: string;
  filepath?: string;
  text: string;
  toolCallId?: string;
}

/**
 * Handles applying text/code to files including diff generation and streaming
 */
export class ApplyManager {
  constructor(
    private readonly ide: VsCodeIde,
    private readonly webviewProtocol: VsCodeWebviewProtocol,
    private readonly verticalDiffManager: VerticalDiffManager,
    private readonly configHandler: ConfigHandler,
  ) {}

  async applyToFile({
    streamId,
    filepath,
    text,
    toolCallId,
  }: ApplyToFileOptions) {
    await this.webviewProtocol.request("updateApplyState", {
      streamId,
      status: "streaming",
      fileContent: text,
      toolCallId,
    });

    if (filepath) {
      await this.ensureFileOpen(filepath);
    }

    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor) {
      vscode.window.showErrorMessage("No active editor to apply edits to");
      return;
    }

    const hasExistingDocument = !!activeTextEditor.document.getText().trim();

    if (hasExistingDocument) {
      await this.handleExistingDocument(
        activeTextEditor,
        text,
        streamId,
        toolCallId,
      );
    } else {
      await this.handleEmptyDocument(
        activeTextEditor,
        text,
        streamId,
        toolCallId,
      );
    }
  }

  // Used to only open a file it had just created, leaving an existing one to land wherever was focused
  private async ensureFileOpen(filepath: string): Promise<void> {
    const resolved = await resolveWorkspacePath(filepath, this.ide);
    if (resolved) {
      await this.ide.openFile(resolved);
      return;
    }

    // Genuinely not in the workspace yet create it
    const newFileUri = await inferResolvedUriFromRelativePath(
      filepath,
      this.ide,
    );
    await this.ide.writeFile(newFileUri, "");
    await this.ide.openFile(newFileUri);
    await this.ide.openFile(filepath);
  }

  private async handleEmptyDocument(
    editor: vscode.TextEditor,
    text: string,
    streamId: string,
    toolCallId?: string,
  ) {
    await editor.edit((builder) =>
      builder.insert(new vscode.Position(0, 0), text),
    );

    await this.webviewProtocol.request("updateApplyState", {
      streamId,
      status: "closed",
      numDiffs: 0,
      fileContent: text,
      toolCallId,
    });
  }

  private async handleExistingDocument(
    editor: vscode.TextEditor,
    text: string,
    streamId: string,
    toolCallId?: string,
  ) {
    const { config } = await this.configHandler.loadConfig();
    if (!config) {
      vscode.window.showErrorMessage("Config not loaded");
      return;
    }

    const llm =
      config.selectedModelByRole.apply ?? config.selectedModelByRole.chat;
    if (!llm) {
      vscode.window.showErrorMessage(
        `No model with roles "apply" or "chat" found in config.`,
      );
      return;
    }

    const { isInstantApply, diffLinesGenerator } = await applyCodeBlock(
      editor.document.getText(),
      text,
      getUriPathBasename(editor.document.uri.toString()),
      llm,
    );

    if (isInstantApply) {
      await this.verticalDiffManager.streamDiffLines(
        diffLinesGenerator,
        isInstantApply,
        streamId,
        toolCallId,
      );
    } else {
      await this.handleNonInstantDiff(
        editor,
        text,
        llm,
        streamId,
        this.verticalDiffManager,
        toolCallId,
      );
    }
  }

  /**
   * Creates a prompt for applying code edits
   */
  private getApplyPrompt(text: string): string {
    return `The following code was suggested as an edit:\n\`\`\`\n${text}\n\`\`\`\nPlease apply it to the previous code.`;
  }

  private async handleNonInstantDiff(
    editor: vscode.TextEditor,
    text: string,
    llm: any,
    streamId: string,
    verticalDiffManager: VerticalDiffManager,
    toolCallId?: string,
  ) {
    const { config } = await this.configHandler.loadConfig();
    if (!config) {
      vscode.window.showErrorMessage("Config not loaded");
      return;
    }

    const prompt = this.getApplyPrompt(text);
    const fullEditorRange = new vscode.Range(
      0,
      0,
      editor.document.lineCount - 1,
      editor.document.lineAt(editor.document.lineCount - 1).text.length,
    );
    const rangeToApplyTo = editor.selection.isEmpty
      ? fullEditorRange
      : editor.selection;

    await verticalDiffManager.streamEdit({
      input: prompt,
      llm,
      streamId,
      range: rangeToApplyTo,
      newCode: text,
      toolCallId,
      rulesToInclude: undefined, // No rules for apply
    });
  }
}
