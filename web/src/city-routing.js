const CITY_ALIASES = new Map([
  ["pune", "pune"],
  ["bengaluru", "bangalore"], ["bangalore", "bangalore"],
  ["gurugram", "gurgaon"], ["gurgaon", "gurgaon"],
]);

const CITY_NAMES = Object.freeze({ pune: "Pune", bangalore: "Bengaluru", gurgaon: "Gurugram" });

export function normalizeCityId(value) {
  const key = String(value ?? "").trim().toLocaleLowerCase("en-IN");
  return CITY_ALIASES.get(key) || null;
}

export function cityIdFromSearch(search, fallback = "pune") {
  const params = new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  return normalizeCityId(params.get("city")) || normalizeCityId(fallback) || "pune";
}

export function cityNameForId(value) {
  const id = normalizeCityId(value);
  return id ? CITY_NAMES[id] : null;
}

export function cityUrl(value, cityId, base = "https://flat-finder.local") {
  const id = normalizeCityId(cityId);
  const url = new URL(value, base);
  if (id) url.searchParams.set("city", id);
  return `${url.pathname}${url.search}${url.hash}`;
}

export const withCityParam = cityUrl;
