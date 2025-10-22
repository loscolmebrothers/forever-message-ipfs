import { describe, it } from "mocha";
import { expect } from "chai";
import { ForeverManager } from "../dist/forever-manager.js";
import { StateTracker } from "../dist/state-tracker.js";

describe("ForeverManager", () => {
  const createMockContract = () => ({
    getBottle: async (bottleId: number) => ({ isForever: false }),
    markBottleAsForever: async (bottleId: number) => {},
  });

  describe("promote", () => {
    it("should promote bottle when thresholds are met", async () => {
      const state = new StateTracker();
      state.load(1, "QmTest123", 100, 4);

      let markedAsForever = false;
      const mockContract = {
        getBottle: async () => ({ isForever: false }),
        markBottleAsForever: async () => {
          markedAsForever = true;
        },
      };

      const manager = new ForeverManager(state, mockContract as any, {
        likes: 100,
        comments: 4,
      });

      await manager.promote(1);

      expect(markedAsForever).to.be.true;
    });

    it("should not promote when like threshold not met", async () => {
      const state = new StateTracker();
      state.load(1, "QmTest123", 99, 4);

      let markedAsForever = false;
      const mockContract = {
        getBottle: async () => ({ isForever: false }),
        markBottleAsForever: async () => {
          markedAsForever = true;
        },
      };

      const manager = new ForeverManager(state, mockContract as any, {
        likes: 100,
        comments: 4,
      });

      await manager.promote(1);

      expect(markedAsForever).to.be.false;
    });

    it("should not promote when comment threshold not met", async () => {
      const state = new StateTracker();
      state.load(1, "QmTest123", 100, 3);

      let markedAsForever = false;
      const mockContract = {
        getBottle: async () => ({ isForever: false }),
        markBottleAsForever: async () => {
          markedAsForever = true;
        },
      };

      const manager = new ForeverManager(state, mockContract as any, {
        likes: 100,
        comments: 4,
      });

      await manager.promote(1);

      expect(markedAsForever).to.be.false;
    });

    it("should not promote if already marked as forever", async () => {
      const state = new StateTracker();
      state.load(1, "QmTest123", 100, 4);

      let markedAsForever = false;
      const mockContract = {
        getBottle: async () => ({ isForever: true }),
        markBottleAsForever: async () => {
          markedAsForever = true;
        },
      };

      const manager = new ForeverManager(state, mockContract as any, {
        likes: 100,
        comments: 4,
      });

      await manager.promote(1);

      expect(markedAsForever).to.be.false;
    });

    it("should use default thresholds when not provided", async () => {
      const state = new StateTracker();
      state.load(1, "QmTest123", 100, 4);

      let markedAsForever = false;
      const mockContract = {
        getBottle: async () => ({ isForever: false }),
        markBottleAsForever: async () => {
          markedAsForever = true;
        },
      };

      const manager = new ForeverManager(state, mockContract as any);

      await manager.promote(1);

      expect(markedAsForever).to.be.true;
    });
  });
});
