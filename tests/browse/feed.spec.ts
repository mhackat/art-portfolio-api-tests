import { test, expect } from "../../fixtures/api-fixtures";

/**
 * The shuffled artwork feed behind /browse and the landing page.
 *
 * Public and read-only, so unlike most of the suite these tests are free —
 * they create nothing and need no account. The value is in the invariants:
 * "random" and "paginated" usually fight each other, and the endpoint's whole
 * design is the resolution of that fight. A regression there wouldn't throw,
 * it would quietly start repeating or dropping artworks as a reader scrolls.
 */

type FeedItem = {
  id: string;
  title: string;
  imageUrl: string;
  username: string;
  displayName: string;
  cursor: string;
};

type FeedPage = { items: FeedItem[]; nextCursor: string | null };

/** Walks the whole feed for one seed, guarding against a runaway loop. */
async function drain(
  request: import("@playwright/test").APIRequestContext,
  seed: string,
  limit = 10
): Promise<FeedItem[]> {
  const all: FeedItem[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 50; page++) {
    const query = new URLSearchParams({ seed, limit: String(limit) });
    if (cursor) query.set("cursor", cursor);

    const res = await request.get(`/api/browse/feed?${query.toString()}`);
    expect(res.status()).toBe(200);

    const body: FeedPage = await res.json();
    all.push(...body.items);
    if (!body.nextCursor) return all;
    cursor = body.nextCursor;
  }

  throw new Error("Feed did not terminate within 50 pages — nextCursor may never be going null.");
}

test.describe("GET /api/browse/feed", () => {
  test("is public — no authentication required", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/browse/feed?seed=public-check&limit=3");
    expect(res.status()).toBe(200);
  });

  test("requires a seed", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/browse/feed?limit=3");
    expect(res.status()).toBe(400);
  });

  test("returns artworks joined to the artist who owns them", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/browse/feed?seed=shape-check&limit=5");
    expect(res.status()).toBe(200);

    const { items }: FeedPage = await res.json();
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(item.imageUrl).toMatch(/^https?:\/\//);
      // The artist arrives with the artwork — the page never has to look them
      // up separately, which is what keeps this one query instead of N+1.
      expect(typeof item.username).toBe("string");
      expect(typeof item.displayName).toBe("string");
      expect(typeof item.cursor).toBe("string");
    }
  });

  test("paging through one seed never repeats or drops an artwork", async ({ apiRequest }) => {
    const items = await drain(apiRequest, "stability-check", 7);
    const ids = items.map((i) => i.id);

    expect(ids.length).toBeGreaterThan(0);
    // The failure this guards against is silent: ORDER BY RANDOM() re-rolls per
    // request, so pages overlap and gaps appear without any error.
    expect(new Set(ids).size, "the same artwork appeared on more than one page").toBe(ids.length);
  });

  test("the same seed gives the same relative order every time", async ({ apiRequest }) => {
    const first = (await drain(apiRequest, "determinism-check", 10)).map((i) => i.id);
    const second = (await drain(apiRequest, "determinism-check", 10)).map((i) => i.id);

    // Comparing the two lists outright would be wrong: other specs in this run
    // create and delete artworks in parallel, so the set legitimately differs
    // between the two passes. Determinism is a claim about the *ordering*, not
    // about the data holding still — so compare only the artworks present in
    // both, and require they appear in the same order relative to each other.
    const inBoth = new Set(first.filter((id) => second.includes(id)));
    expect(inBoth.size, "the two passes shared no artworks — nothing was compared").toBeGreaterThan(0);

    expect(second.filter((id) => inBoth.has(id))).toEqual(first.filter((id) => inBoth.has(id)));
  });

  test("a different seed reshuffles", async ({ apiRequest }) => {
    const a = (await drain(apiRequest, "seed-alpha", 24)).map((i) => i.id);
    const b = (await drain(apiRequest, "seed-beta", 24)).map((i) => i.id);

    const shared = a.filter((id) => b.includes(id));
    test.skip(shared.length < 4, "too few artworks on this environment to tell orders apart");

    // Two seeds could coincidentally agree on a couple of positions; requiring
    // the whole shared sequence to differ is what makes this meaningful.
    expect(
      b.filter((id) => shared.includes(id)),
      "two different seeds produced the same order — the seed may not be reaching the query"
    ).not.toEqual(a.filter((id) => shared.includes(id)));
  });

  test("page size is honoured, and capped", async ({ apiRequest }) => {
    const small = await apiRequest.get("/api/browse/feed?seed=limit-check&limit=3");
    expect(small.status()).toBe(200);
    expect((await small.json()).items.length).toBeLessThanOrEqual(3);

    // Above the documented maximum the request is rejected rather than
    // silently serving more than a caller is allowed to ask for.
    const tooBig = await apiRequest.get("/api/browse/feed?seed=limit-check&limit=500");
    expect(tooBig.status()).toBe(400);
  });

  test("a malformed cursor restarts from the beginning instead of erroring", async ({ apiRequest }) => {
    const fresh = await apiRequest.get("/api/browse/feed?seed=cursor-check&limit=5");
    const firstPage: FeedPage = await fresh.json();

    const mangled = await apiRequest.get("/api/browse/feed?seed=cursor-check&limit=5&cursor=not-a-real-cursor");
    expect(mangled.status()).toBe(200);

    // Same seed, unusable position — so it should serve page one again rather
    // than 500 on input a reader could produce by editing the URL.
    expect((await mangled.json()).items.map((i: FeedItem) => i.id)).toEqual(
      firstPage.items.map((i) => i.id)
    );
  });

  test("opens with one piece per artist before anyone's second", async ({ apiRequest }) => {
    const res = await apiRequest.get("/api/browse/feed?seed=variety-check&limit=24");
    expect(res.status()).toBe(200);

    const { items }: FeedPage = await res.json();
    const artists = items.map((i) => i.username);
    const distinct = new Set(artists);

    // Interleaving is what stops one prolific account owning the front page.
    // With fewer artists than slots the run simply wraps, so assert the weaker
    // property that holds either way: no artist repeats before every other has
    // appeared once.
    const firstAppearance = new Map<string, number>();
    artists.forEach((a, i) => {
      if (!firstAppearance.has(a)) firstAppearance.set(a, i);
    });
    const firstRepeatAt = artists.findIndex((a, i) => firstAppearance.get(a) !== i);

    if (firstRepeatAt !== -1) {
      expect(
        firstRepeatAt,
        "an artist appeared twice before every other artist had appeared once"
      ).toBeGreaterThanOrEqual(distinct.size);
    }
  });
});
