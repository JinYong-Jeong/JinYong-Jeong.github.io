type MemoryEntry = {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: [string, string][];
};
type Fetch = typeof globalThis.fetch;

/** The subset of Cache used by WebLLM 0.2.89, backed only by this worker's JS heap. */
class MemoryArtifactCache {
  private entries = new Map<string, MemoryEntry>();
  constructor(private readonly fetchNoStore: Fetch) {}

  private key(request: RequestInfo | URL) {
    return request instanceof Request ? request.url : String(request);
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const key = this.key(request);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // ArtifactCache probes with match() before reading again. An unread probe must
    // neither copy a shard nor remove it. Release its stored bytes only on consumption.
    const body = new ReadableStream<Uint8Array>(
      {
        pull: (controller) => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          controller.enqueue(new Uint8Array(entry.body));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers,
    });
  }

  async add(request: RequestInfo | URL) {
    const response = await this.fetchNoStore(request);
    if (!response.ok)
      throw new Error(`Model asset request failed: ${response.status}`);
    await this.put(request, response);
  }

  async addAll(requests: RequestInfo[]) {
    await Promise.all(requests.map((request) => this.add(request)));
  }

  async put(request: RequestInfo | URL, response: Response) {
    this.entries.set(this.key(request), {
      body: await response.arrayBuffer(),
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
  }

  async delete(request: RequestInfo | URL) {
    return this.entries.delete(this.key(request));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  clear() {
    this.entries.clear();
  }
}

export function createMemoryArtifactStorage(fetchNoStore: Fetch) {
  const scopes = new Map<string, MemoryArtifactCache>();
  return {
    async open(name: string) {
      let cache = scopes.get(name);
      if (!cache) {
        cache = new MemoryArtifactCache(fetchNoStore);
        scopes.set(name, cache);
      }
      return cache;
    },
    async keys() {
      return [...scopes.keys()];
    },
    async has(name: string) {
      return scopes.has(name);
    },
    async delete(name: string) {
      scopes.get(name)?.clear();
      return scopes.delete(name);
    },
    async match(request: RequestInfo | URL) {
      for (const cache of scopes.values()) {
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
    clear() {
      for (const cache of scopes.values()) cache.clear();
      scopes.clear();
    },
  };
}

/** Install before WebLLM evaluates. These replacements affect only the dedicated worker. */
export function installMemoryOnlyModelPolicy(
  scope: typeof globalThis = globalThis,
) {
  const nativeFetch = scope.fetch.bind(scope);
  const fetchNoStore: Fetch = (input, init) =>
    nativeFetch(input, { ...init, cache: "no-store" });
  const memory = createMemoryArtifactStorage(fetchNoStore);
  Object.defineProperty(scope, "fetch", {
    value: fetchNoStore,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(scope, "caches", {
    value: memory,
    configurable: false,
    writable: false,
  });
  // Fail closed if a future code path accidentally attempts a persistent backend.
  Object.defineProperty(scope, "indexedDB", {
    get() {
      throw new Error("Persistent model storage is disabled");
    },
    configurable: false,
  });
  return memory;
}
