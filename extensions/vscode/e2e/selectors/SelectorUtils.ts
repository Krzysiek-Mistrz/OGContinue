import { By, WebElement, WebView } from "vscode-extension-tester";

export class SelectorUtils {
  /**
   * Finds a web element by its data-testid attribute within a WebView.
   * @param view - The WebView to search within.
   * @param testId - The data-testid value to search for.
   * @returns A promise that resolves to the WebElement found.
   */
  /**
   * Chat.tsx renders one ContinueInputBox - and so one of every testid inside
   * it, including model-select-button - per history entry (for re-editing a
   * past message) plus one for the live main input. Past entries keep theirs
   * in the DOM at zero height/opacity rather than removing it, so a plain
   * first-match query can return an element that is never the one on screen.
   * Prefer whichever match is actually displayed; fall back to the first
   * match so a caller intentionally querying a not-yet-visible element (e.g.
   * one about to animate in) still gets a result to wait on.
   */
  public static async getElementByDataTestId(
    view: WebView,
    testId: string,
  ): Promise<WebElement> {
    const matches = await view.findWebElements(
      By.css(`[data-testid='${testId}']`),
    );
    for (const match of matches) {
      if (await match.isDisplayed()) {
        return match;
      }
    }
    return view.findWebElement(By.css(`[data-testid='${testId}']`));
  }

  /**
   * Finds a web element by its aria-label attribute within a WebView.
   * @param view - The WebView to search within.
   * @param ariaLabel - The aria-label value to search for.
   * @returns A promise that resolves to the WebElement found.
   */
  public static getElementByAriaLabel(
    view: WebView,
    ariaLabel: string,
  ): Promise<WebElement> {
    return view.findWebElement(By.css(`[aria-label='${ariaLabel}']`));
  }
}
