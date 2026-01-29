import { describe, expect, it } from "vitest";
import { INITIAL_VIEW_STATE, DATA_START_DATE } from "./config";

describe("Barcelona Configuration", () => {
    it("should have the correct initial view state for Barcelona", () => {
        expect(INITIAL_VIEW_STATE.longitude).toBeCloseTo(2.1734);
        expect(INITIAL_VIEW_STATE.latitude).toBeCloseTo(41.3851);
        expect(INITIAL_VIEW_STATE.zoom).toBe(13);
    });

    it("should have a valid data start date for Bicing", () => {
        expect(DATA_START_DATE.getFullYear()).toBe(2019);
    });
});
