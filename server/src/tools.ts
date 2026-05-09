import { getFile, listFiles, READ_TEXT_CAP } from "./sessions.js";

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "brave_search",
      description:
        "Search the web via Brave Search. Use for current events, recent news, or factual lookups. Returns title/url/snippet for top results.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          count: { type: "number", description: "Results to return (1–20).", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch a URL and return its raw text content (capped at 10KB). Use to read pages from search results.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Fully-qualified http(s) URL." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Current weather for a place name (city, address). Geocodes via Google then fetches Google Weather API.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Place name, e.g. 'Washington DC'." },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description:
        "Recent news matching a query (GDELT 2.0, global). Returns title/url/source/seendate.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "News search query." },
          count: { type: "number", description: "Max articles (default 10).", default: 10 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_places",
      description:
        "Search Google Places (New). Returns place IDs + names so the model can embed <gmp-place-details place=ID> via Places UI Kit.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text search, e.g. 'sushi near Union Station DC'." },
          count: { type: "number", description: "Max results (default 5).", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_streetview_url",
      description:
        "Build a Google Street View Static image URL for a location. Returns a URL the model can drop into <img src>.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Address, place name, or 'lat,lng'." },
          size: { type: "string", description: "Image size 'WxH'.", default: "640x400" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quote",
      description:
        "Current market quote (stock/crypto/forex) via Massive.com. Returns price, change, volume.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker, e.g. 'AAPL', 'BTC-USD'." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_aggregates",
      description:
        "OHLC bars for a symbol via Massive.com. Use to render candlestick / line charts.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker, e.g. 'AAPL'." },
          range: { type: "string", description: "Time range: '1d','5d','1mo','3mo','6mo','1y'.", default: "1mo" },
          interval: { type: "string", description: "Bar size: '1m','5m','1h','1d'.", default: "1d" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files the user uploaded for this conversation. Returns name, mime type, and size. Call this whenever uploaded context might be relevant.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read an uploaded file's text contents. Use the exact filename from list_files. Output is UTF-8, capped at 100 KB per call.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact filename from list_files." },
        },
        required: ["name"],
      },
    },
  },
];

export interface ToolContext {
  sessionId?: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string>;

function arg(args: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (args[k] !== undefined && args[k] !== null && args[k] !== "") return args[k];
  }
  return undefined;
}

const MAX_BODY = 10_000;

export const HANDLERS: Record<string, ToolHandler> = {
  brave_search: async (args) => {
    const query = String(arg(args, "query", "q", "parameter", "search") ?? "");
    const count = Math.min(20, Math.max(1, Number(arg(args, "count", "limit") ?? 5)));
    if (!query) return "Error: missing 'query' argument";
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return "Error: BRAVE_SEARCH_API_KEY not configured";
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      { headers: { "X-Subscription-Token": key, Accept: "application/json" } },
    );
    if (!res.ok) return `Error: Brave returned ${res.status} ${res.statusText}`;
    const data: any = await res.json();
    const items = (data.web?.results ?? []).slice(0, count).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
    return JSON.stringify(items);
  },

  web_fetch: async (args) => {
    const url = String(arg(args, "url") ?? "");
    if (!url) return "Error: missing 'url' argument";
    if (!/^https?:\/\//i.test(url)) return "Error: URL must be http(s)";
    try {
      const res = await fetch(url, {
        headers: { Accept: "text/html, text/plain, application/json, */*" },
        redirect: "follow",
      });
      if (!res.ok) return `Error: ${res.status} ${res.statusText}`;
      const text = await res.text();
      return text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "\n\n[truncated]" : text;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },

  get_weather: async (args) => {
    const location = String(arg(args, "location", "place", "query", "city") ?? "");
    if (!location) return "Error: missing 'location' argument";
    const key = process.env.GOOGLE_API_KEY;
    if (!key) return "Error: GOOGLE_API_KEY not configured";

    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${key}`,
    );
    if (!geoRes.ok) return `Error: geocoding ${geoRes.status}`;
    const geo: any = await geoRes.json();
    if (!geo.results?.length) return `Error: location not found: ${location}`;
    const { lat, lng } = geo.results[0].geometry.location;
    const formatted = geo.results[0].formatted_address;

    const wRes = await fetch(
      `https://weather.googleapis.com/v1/currentConditions:lookup?key=${key}&location.latitude=${lat}&location.longitude=${lng}`,
    );
    if (!wRes.ok) return `Error: weather ${wRes.status}`;
    const w = await wRes.json();
    return JSON.stringify({ location: formatted, lat, lng, weather: w });
  },

  get_news: async (args) => {
    const query = String(arg(args, "query", "q") ?? "");
    const count = Math.min(50, Math.max(1, Number(arg(args, "count", "limit") ?? 10)));
    if (!query) return "Error: missing 'query' argument";
    const url =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
      `&mode=ArtList&format=json&maxrecords=${count}&sort=DateDesc`;
    const res = await fetch(url);
    if (!res.ok) return `Error: GDELT ${res.status}`;
    const data: any = await res.json().catch(() => ({}));
    const articles = (data.articles ?? []).slice(0, count).map((a: any) => ({
      title: a.title,
      url: a.url,
      source: a.domain,
      seendate: a.seendate,
      country: a.sourcecountry,
    }));
    return JSON.stringify(articles);
  },

  get_places: async (args) => {
    const query = String(arg(args, "query", "q", "textQuery") ?? "");
    const count = Math.min(20, Math.max(1, Number(arg(args, "count", "limit") ?? 5)));
    if (!query) return "Error: missing 'query' argument";
    const key = process.env.GOOGLE_API_KEY;
    if (!key) return "Error: GOOGLE_API_KEY not configured";
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: count }),
    });
    if (!res.ok) return `Error: Places ${res.status} ${await res.text().catch(() => "")}`;
    const data: any = await res.json();
    const places = (data.places ?? []).slice(0, count).map((p: any) => ({
      id: p.id,
      name: p.displayName?.text,
      address: p.formattedAddress,
      types: p.types,
      rating: p.rating,
      ratings_count: p.userRatingCount,
    }));
    return JSON.stringify(places);
  },

  get_streetview_url: async (args) => {
    const location = String(arg(args, "location") ?? "");
    const size = String(arg(args, "size") ?? "640x400");
    if (!location) return "Error: missing 'location' argument";
    const key = process.env.GOOGLE_API_KEY;
    if (!key) return "Error: GOOGLE_API_KEY not configured";
    const url =
      `https://maps.googleapis.com/maps/api/streetview?size=${encodeURIComponent(size)}` +
      `&location=${encodeURIComponent(location)}&key=${key}`;
    return JSON.stringify({ url, location });
  },

  get_quote: async (args) => {
    const symbol = String(arg(args, "symbol", "ticker") ?? "").toUpperCase();
    if (!symbol) return "Error: missing 'symbol' argument";
    const key = process.env.MASSIVE_API_KEY;
    if (!key) return "Error: MASSIVE_API_KEY not configured";
    const url = `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?adjusted=true&apiKey=${key}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.text();
    if (!res.ok) return `Error: Massive ${res.status}: ${body.slice(0, 200)}`;
    return body.slice(0, MAX_BODY);
  },

  get_aggregates: async (args) => {
    const symbol = String(arg(args, "symbol", "ticker") ?? "").toUpperCase();
    const range = String(arg(args, "range") ?? "1mo");
    const interval = String(arg(args, "interval") ?? "1d");
    if (!symbol) return "Error: missing 'symbol' argument";
    const key = process.env.MASSIVE_API_KEY;
    if (!key) return "Error: MASSIVE_API_KEY not configured";

    const intervalMap: Record<string, [number, string]> = {
      "1m": [1, "minute"], "5m": [5, "minute"], "15m": [15, "minute"], "30m": [30, "minute"],
      "1h": [1, "hour"], "1d": [1, "day"], "1w": [1, "week"], "1mo": [1, "month"],
    };
    const rangeDays: Record<string, number> = {
      "1d": 2, "5d": 7, "1mo": 35, "3mo": 95, "6mo": 185, "1y": 370, "2y": 740, "5y": 1830,
    };
    const [mult, timespan] = intervalMap[interval] ?? [1, "day"];
    const days = rangeDays[range] ?? 35;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const url =
      `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
      `/range/${mult}/${timespan}/${fmt(from)}/${fmt(to)}` +
      `?adjusted=true&sort=asc&limit=5000&apiKey=${key}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.text();
    if (!res.ok) return `Error: Massive ${res.status}: ${body.slice(0, 200)}`;
    return body.slice(0, MAX_BODY);
  },

  list_files: async (_args, ctx) => {
    if (!ctx.sessionId) return JSON.stringify([]);
    const files = listFiles(ctx.sessionId);
    return JSON.stringify(files);
  },

  read_file: async (args, ctx) => {
    if (!ctx.sessionId) return "Error: no session";
    const name = String(arg(args, "name", "filename", "file") ?? "");
    if (!name) return "Error: missing 'name' argument";
    const file = getFile(ctx.sessionId, name);
    if (!file) {
      const available = listFiles(ctx.sessionId)
        .map((f) => f.name)
        .join(", ");
      return `Error: file not found: ${name}. Available: ${available || "(none)"}`;
    }
    if (file.text.length <= READ_TEXT_CAP) return file.text;
    return file.text.slice(0, READ_TEXT_CAP) + `\n\n[truncated — file is ${file.size} bytes; first ${READ_TEXT_CAP} chars shown]`;
  },
};
