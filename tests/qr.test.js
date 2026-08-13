import { describe, it, expect } from "vitest";
import { QR } from "../js/qr.js";

describe("QR.encode", () => {
  it("encodes short text into a square modules matrix", () => {
    const r = QR.encode("https://example.com", "M");
    expect(r).not.toBeNull();
    expect(r.modules.length).toBe(r.size);
    r.modules.forEach(row => expect(row.length).toBe(r.size));
  });

  it("picks a higher version (bigger matrix) for longer content", () => {
    const short = QR.encode("hi", "M");
    const long = QR.encode("x".repeat(80), "M");
    expect(long).not.toBeNull();
    expect(long.size).toBeGreaterThan(short.size);
  });

  it("returns null when content exceeds the largest supported version", () => {
    expect(QR.encode("x".repeat(5000), "H")).toBeNull();
  });

  it("defaults to error-correction level M when none is given", () => {
    const withDefault = QR.encode("central de marcação", undefined);
    const explicitM = QR.encode("central de marcação", "M");
    expect(withDefault.size).toBe(explicitM.size);
  });

  it("marks the three finder patterns as dark modules", () => {
    const r = QR.encode("laser", "M");
    expect(r.modules[0][0]).toBe(1);
    expect(r.modules[0][r.size-1]).toBe(1);
    expect(r.modules[r.size-1][0]).toBe(1);
  });
});
