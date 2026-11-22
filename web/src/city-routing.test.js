import { describe, expect, it } from "vitest";
import { cityIdFromSearch, cityNameForId, cityUrl, normalizeCityId } from "./city-routing.js";

describe("city routing", () => {
  it.each([
    ["pune", "pune"], ["Bengaluru", "bangalore"], ["bangalore", "bangalore"],
    ["Gurugram", "gurgaon"], ["gurgaon", "gurgaon"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeCityId(input)).toBe(expected);
  });

  it("reads supported city names and ids from the query string", () => {
    expect(cityIdFromSearch("?city=Pune")).toBe("pune");
    expect(cityIdFromSearch("?embed=1&city=Bengaluru")).toBe("bangalore");
    expect(cityIdFromSearch("?city=Gurugram")).toBe("gurgaon");
  });

  it("uses a supported fallback for missing or unsupported cities", () => {
    expect(cityIdFromSearch("?city=Kolkata")).toBe("pune");
    expect(cityIdFromSearch("", "Gurugram")).toBe("gurgaon");
  });

  it("adds the canonical city id while preserving embed parameters and hashes", () => {
    expect(cityUrl("/research.html?embed=1#map", "Bengaluru"))
      .toBe("/research.html?embed=1&city=bangalore#map");
  });

  it("returns display names for the supported map datasets", () => {
    expect(cityNameForId("bangalore")).toBe("Bengaluru");
    expect(cityNameForId("gurugram")).toBe("Gurugram");
    expect(cityNameForId("unknown")).toBeNull();
  });
});
