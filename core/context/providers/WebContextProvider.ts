import * as cheerio from "cheerio";

import { BaseContextProvider } from "..";
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  FetchFunction,
} from "../..";

const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (compatible; OGContinue/1.0; +https://github.com/Krzysiek-Mistrz/OGContinue)";

function extractRealUrl(href: string): string {
  try {
    const parsed = new URL(href, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

export const fetchSearchResults = async (
  query: string,
  n: number,
  fetchFn: FetchFunction,
): Promise<ContextItem[]> => {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("q", query);

  const resp = await fetchFn(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
    },
  });

  if (!resp.ok) {
    throw new Error(`Web search failed with status ${resp.status}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  const results: ContextItem[] = [];
  $(".result").each((_, el) => {
    if (results.length >= n) {
      return false;
    }

    const titleEl = $(el).find(".result__a").first();
    const title = titleEl.text().trim();
    const resultUrl = extractRealUrl(titleEl.attr("href") ?? "");
    const snippet = $(el).find(".result__snippet").text().trim();

    if (!title || !resultUrl) {
      return;
    }

    results.push({
      name: title,
      description: resultUrl,
      content: `${title}\n${resultUrl}\n${snippet}`,
    });
  });

  if (results.length === 0) {
    throw new Error("Web search returned no parseable results");
  }

  return results;
};

export default class WebContextProvider extends BaseContextProvider {
  private static DEFAULT_N = 6;

  static description: ContextProviderDescription = {
    title: "web",
    displayTitle: "Web",
    description: "Search the web",
    type: "normal",
    renderInlineAs: "",
  };

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    return await fetchSearchResults(
      extras.fullInput,
      this.options.n ?? WebContextProvider.DEFAULT_N,
      extras.fetch,
    );
  }
}
