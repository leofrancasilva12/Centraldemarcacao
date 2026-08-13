import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadTemplates, persistTemplates, loadPreference, savePreference, getLastStorageError } from "../js/storage.js";

beforeEach(() => {
  localStorage.clear();
});

describe("storage", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(loadTemplates("k")).toEqual([]);
  });

  it("round-trips a template list", () => {
    const list = [{ id: "1", name: "Modelo A" }];
    expect(persistTemplates("k", list)).toBe(true);
    expect(loadTemplates("k")).toEqual(list);
  });

  it("ignores corrupted JSON and falls back to an empty list", () => {
    localStorage.setItem("k", "{not json");
    expect(loadTemplates("k")).toEqual([]);
  });

  it("round-trips a single preference value", () => {
    expect(savePreference("theme", "light")).toBe(true);
    expect(loadPreference("theme")).toBe("light");
  });

  it("returns null for a missing preference", () => {
    expect(loadPreference("missing")).toBeNull();
  });

  it("reports a quota reason when the browser storage is full", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new Error("quota");
      err.name = "QuotaExceededError";
      throw err;
    });
    expect(persistTemplates("k", [{ id: "1" }])).toBe(false);
    expect(getLastStorageError()).toBe("quota");
    spy.mockRestore();
  });

  it("reports an unavailable reason for other storage failures", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(savePreference("k", "v")).toBe(false);
    expect(getLastStorageError()).toBe("unavailable");
    spy.mockRestore();
  });
});
