import { describe, it } from "mocha";
import { expect } from "chai";
import { StateTracker } from "../dist/state-tracker.js";

describe("StateTracker", () => {
  describe("load", () => {
    it("should load bottle state", () => {
      const tracker = new StateTracker();

      tracker.load(1, "QmTest123", 5, 2);

      const state = tracker.get(1);
      expect(state.likeCount).to.equal(5);
      expect(state.commentCount).to.equal(2);
      expect(state.currentIpfsHash).to.equal("QmTest123");
    });
  });

  describe("get", () => {
    it("should return bottle state when loaded", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmTest123", 0, 0);

      const state = tracker.get(1);

      expect(state).to.not.be.null;
      expect(state.likeCount).to.equal(0);
    });

    it("should throw when bottle not loaded", () => {
      const tracker = new StateTracker();

      expect(() => tracker.get(999)).to.throw("Bottle 999 not loaded");
    });
  });

  describe("incrementLikes", () => {
    it("should increment like count", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmTest123", 5, 0);

      const newCount = tracker.incrementLikes(1);

      expect(newCount).to.equal(6);
      expect(tracker.get(1).likeCount).to.equal(6);
    });

    it("should throw when bottle not loaded", () => {
      const tracker = new StateTracker();

      expect(() => tracker.incrementLikes(999)).to.throw();
    });
  });

  describe("decrementLikes", () => {
    it("should decrement like count", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmTest123", 5, 0);

      const newCount = tracker.decrementLikes(1);

      expect(newCount).to.equal(4);
      expect(tracker.get(1).likeCount).to.equal(4);
    });

    it("should not go below zero", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmTest123", 0, 0);

      const newCount = tracker.decrementLikes(1);

      expect(newCount).to.equal(0);
      expect(tracker.get(1).likeCount).to.equal(0);
    });
  });

  describe("incrementComments", () => {
    it("should increment comment count", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmTest123", 0, 3);

      const newCount = tracker.incrementComments(1);

      expect(newCount).to.equal(4);
      expect(tracker.get(1).commentCount).to.equal(4);
    });
  });

  describe("updateIPFSHash", () => {
    it("should update IPFS hash", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmOldHash", 0, 0);

      tracker.updateIPFSHash(1, "QmNewHash");

      expect(tracker.get(1).currentIpfsHash).to.equal("QmNewHash");
    });
  });

  describe("state isolation", () => {
    it("should maintain complete isolation between bottles", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmHash1", 10, 5);
      tracker.load(2, "QmHash2", 20, 10);
      tracker.load(3, "QmHash3", 0, 0);

      tracker.incrementLikes(1);
      tracker.decrementLikes(2);
      tracker.incrementComments(1);
      tracker.updateIPFSHash(3, "QmNewHash3");

      expect(tracker.get(1).likeCount).to.equal(11);
      expect(tracker.get(1).commentCount).to.equal(6);
      expect(tracker.get(1).currentIpfsHash).to.equal("QmHash1");

      expect(tracker.get(2).likeCount).to.equal(19);
      expect(tracker.get(2).commentCount).to.equal(10);
      expect(tracker.get(2).currentIpfsHash).to.equal("QmHash2");

      expect(tracker.get(3).likeCount).to.equal(0);
      expect(tracker.get(3).commentCount).to.equal(0);
      expect(tracker.get(3).currentIpfsHash).to.equal("QmNewHash3");
    });

    it("should not affect other bottles when loading same bottle twice", () => {
      const tracker = new StateTracker();
      tracker.load(1, "QmHash1", 10, 5);
      tracker.load(2, "QmHash2", 20, 10);

      tracker.load(1, "QmNewHash1", 15, 8);

      expect(tracker.get(1).likeCount).to.equal(15);
      expect(tracker.get(1).commentCount).to.equal(8);
      expect(tracker.get(1).currentIpfsHash).to.equal("QmNewHash1");

      expect(tracker.get(2).likeCount).to.equal(20);
      expect(tracker.get(2).commentCount).to.equal(10);
      expect(tracker.get(2).currentIpfsHash).to.equal("QmHash2");
    });
  });
});
