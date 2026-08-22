import * as vscode from "vscode";

export type QuickEditShowParams = {
  initialPrompt?: string;
  /**
   * Used for Quick Actions where the user has not highlighted code.
   * Instead the range comes from the document symbol.
   */
  range?: vscode.Range;
};
