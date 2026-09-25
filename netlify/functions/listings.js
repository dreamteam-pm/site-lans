// Live availability feed — Netlify Function
// Reads Dreamteam's public AppFolio listings page, parses each unit card, and
// tags every unit with the lansmanagement.com community it belongs to (matched
// by street address). No credentials involved; the listings page is public.
// Cached at the CDN for 10 minutes so AppFolio is hit a few times an hour at most.

const COMMUNITIES = require("./communities.json");

const LISTINGS_URL = "https://nationalrealtyguildmgmt.appfolio.com/listings";
const CACHE_SECONDS = 600;

let memo = { at: 0, body: null };

const STREET_WORDS = [
  [/\bstreet\b/g, "st"], [/\bavenue\b/g, "ave"], [/\broad\b/g, "rd"], [/\bdrive\b/g, "dr"],
  [/\bcircle\b/g, "cir"], [/\bcourt\b/g, "ct"], [/\blane\b/g, "ln"], [/\bboulevard\b/g, "blvd"],
  [/\bnorth\b/g, "n"], [/\bsouth\b/g, "s"], [/\beast\b/g, "e"], [/\bwest\b/g, "w"],
  [/\bnorth\s*east\b/g, "ne"], [/\bnorth\s*west\b/g, "nw"], [/\bsouth\s*east\b/g, "se"], [/\bsouth\s*west\b/g, "sw"]
];

function norm(s) {
  let t = String(s || "").toLowerCase().replace(/&ndash;|&mdash;|–|—/g, "-").replace(/\./g, "").replace(/,/g, " ");
  t = t.replace(/\b([nsew])\s+([ew])\b/g, "$1$2"); // "n e" -> "ne" after dot removal
  for (const [re, rep] of STREET_WORDS) t = t.replace(re, rep);
  return t.replace(/\s+/g, " ").trim();
}

function parseStreet(part) {
  const t = norm(part).replace(/\s*(#|\bunit\b|-\s*unit\b).*$/i, "").trim();
  const m = t.match(/^(\d+)(?:\s*-\s*(\d+))?\s+(.+)$/);
  if (!m) return { lo: null, hi: null, street: t };
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  return { lo, hi, street: m[3].trim() };
}

const COMMUNITY_INDEX = COMMUNITIES.map((c) => {
  const [streetPart] = c.addr.split(",");
  const cityPart = (c.city || "").split(",")[0];
  return { slug: c.slug, name: c.name, city: norm(cityPart), ...parseStreet(streetPart) };
});

function matchCommunity(address) {
  // Tolerate AppFolio address quirks: ",," typos and unit numbers split off by a comma ("..., #2, St. Cloud")
  const parts = address.split(",").map((p) => p.trim()).filter((p) => p && !/^(#|unit\b|apt\b)/i.test(p));
  if (parts.length < 2) return null;
  const listing = parseStreet(parts[0]);
  const city = norm(parts[1]);
  for (const c of COMMUNITY_INDEX) {
    if (c.city !== city) continue;
    const streetOk = c.street === listing.street || listing.street.startsWith(c.street + " ") || c.street.startsWith(listing.street + " ");
    if (!streetOk) continue;
    if (c.lo === null) return c.slug;
    if (listing.lo !== null && listing.lo >= c.lo && listing.lo <= c.hi) return c.slug;
  }
  return null;
}

function text(re, html) {
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

function parseListings(html) {
  const cards = html.split('<div class="listing-item result js-listing-item"').slice(1);
  return cards.map((card) => {
    const address = text(/js-listing-address">([^<]+)</, card);
    const bedBath = text(/js-listing-blurb-bed-bath">\s*([^<]+)</, card);
    const bb = bedBath.match(/([\d.]+)\s*bd\s*\/\s*([\d.]+)\s*ba/i);
    const rent = text(/js-listing-blurb-rent">\s*([^<]+)</, card);
    const sqft = text(/Square Feet<\/dt>\s*<dd class="detail-box__value">([^<]+)</, card);
    const title = text(/js-listing-title">\s*<a[^>]*>([^<]+)</, card);
    const availableRaw = text(/js-listing-available">\s*([^<]+)</, card); // "NOW" or "10/1/26"
    const available = !availableRaw || /now/i.test(availableRaw) ? "now" : availableRaw;
    const photo = (card.match(/data-original="([^"]+)"/) || [])[1] || "";
    const detail = (card.match(/href="(\/listings\/detail\/[^"]+)"/) || [])[1] || "";
    const apply = (card.match(/href="(\/listings\/rental_applications\/new\?[^"]+)"/) || [])[1] || "";
    const cityMatch = address.match(/,\s*([^,]+),\s*MN/);
    return {
      address,
      city: cityMatch ? cityMatch[1].trim() : "",
      rent,
      beds: bb ? parseFloat(bb[1]) : null,
      baths: bb ? parseFloat(bb[2]) : null,
      sqft,
      title,
      available,
      photo,
      detail_url: detail ? "https://nationalrealtyguildmgmt.appfolio.com" + detail : "",
      apply_url: apply ? "https://nationalrealtyguildmgmt.appfolio.com" + apply.replace(/&amp;/g, "&") : "",
      community: matchCommunity(address)
    };
  }).filter((l) => l.address);
}

function parseCities(html) {
  const sel = html.match(/<select[^>]*filters\[cities\]\[\][^>]*>([\s\S]*?)<\/select>/);
  if (!sel) return [];
  return [...sel[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]).filter((v) => v && v !== "All Cities");
}

async function build() {
  const res = await fetch(LISTINGS_URL, { headers: { "User-Agent": "Mozilla/5.0 (lansmanagement.com availability)" } });
  if (!res.ok) throw new Error("AppFolio responded " + res.status);
  const html = await res.text();
  const listings = parseListings(html);
  const counts = {};
  for (const l of listings) if (l.community) counts[l.community] = (counts[l.community] || 0) + 1;
  return {
    updated: new Date().toISOString(),
    total: listings.length,
    cities: parseCities(html),
    counts,
    listings
  };
}

exports._parseListings = parseListings;
exports._matchCommunity = matchCommunity;

exports.handler = async () => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": `public, max-age=300, s-maxage=${CACHE_SECONDS}`
  };
  try {
    if (!memo.body || Date.now() - memo.at > CACHE_SECONDS * 1000) {
      memo = { at: Date.now(), body: JSON.stringify(await build()) };
    }
    return { statusCode: 200, headers, body: memo.body };
  } catch (err) {
    console.error("listings error:", err && err.message);
    if (memo.body) return { statusCode: 200, headers, body: memo.body }; // serve stale on error
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Availability is temporarily unavailable." }) };
  }
};
