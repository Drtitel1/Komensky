import { describe, expect, it } from "vitest";
import { cleanTutorText } from "../src/shared/czech";
describe("cleanTutorText", () => {
  it("strips tool calls and latex", () => {
    expect(cleanTutorText("se nezmění. \\mathrm{part\\_explained}()").trim()).toBe("se nezmění.");
    expect(cleanTutorText("ahoj part_explained() světe")).not.toMatch(/part_explained/);
    expect(cleanTutorText("pětkrát jedna je pět")).toBe("pětkrát jedna je pět");
  });
});
