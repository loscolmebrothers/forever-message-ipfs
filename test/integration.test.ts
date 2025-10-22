import { describe, it } from "mocha";
import { expect } from "chai";
import { StateTracker } from "../dist/state-tracker.js";
import { ForeverManager } from "../dist/forever-manager.js";
import { IPFSCountSync } from "../dist/ipfs-count-sync.js";

describe("Integration: Full Bottle Workflow", () => {
  it("should handle bottle creation workflow", async () => {
    const state = new StateTracker();

    const mockIPFSService = {
      uploadBottle: async (message: string, userId: string) => {
        expect(message).to.equal("Hello World");
        expect(userId).to.equal("user123");
        return { cid: "QmNewBottle", size: 100, url: "https://..." };
      },
    };

    const mockContract = {
      createBottle: async (ipfsHash: string) => {
        expect(ipfsHash).to.equal("QmNewBottle");
        return 42;
      },
    };

    const uploadResult = await mockIPFSService.uploadBottle(
      "Hello World",
      "user123",
    );
    const bottleId = await mockContract.createBottle(uploadResult.cid);
    state.load(bottleId, uploadResult.cid, 0, 0);

    expect(bottleId).to.equal(42);
    expect(state.get(42).likeCount).to.equal(0);
    expect(state.get(42).commentCount).to.equal(0);
    expect(state.get(42).currentIpfsHash).to.equal("QmNewBottle");
  });

  it("should handle like → sync → promote workflow", async () => {
    const state = new StateTracker();
    state.load(1, "QmInitialHash", 99, 4);

    let contractCalls: string[] = [];
    let currentIpfsHash = "QmInitialHash";

    const mockIPFSService = {
      updateBottleCounts: async (
        originalCid: string,
        likeCount: number,
        commentCount: number,
      ) => {
        expect(originalCid).to.equal(currentIpfsHash);
        currentIpfsHash = `QmUpdated_${likeCount}_${commentCount}`;
        return { cid: currentIpfsHash, size: 100, url: "https://..." };
      },
    };

    const mockContract = {
      updateBottleIPFS: async (bottleId: number, newCid: string) => {
        contractCalls.push(`updateBottleIPFS:${bottleId}:${newCid}`);
      },
      getBottle: async (bottleId: number) => {
        return { isForever: false };
      },
      markBottleAsForever: async (bottleId: number) => {
        contractCalls.push(`markAsForever:${bottleId}`);
      },
    };

    const ipfsSync = new IPFSCountSync(
      mockIPFSService as any,
      state,
      mockContract as any,
    );

    const foreverManager = new ForeverManager(state, mockContract as any, {
      likes: 100,
      comments: 4,
    });

    state.incrementLikes(1);

    await ipfsSync.syncBottleCounts(1);

    expect(state.get(1).likeCount).to.equal(100);
    expect(state.get(1).currentIpfsHash).to.equal("QmUpdated_100_4");
    expect(contractCalls).to.include("updateBottleIPFS:1:QmUpdated_100_4");

    await foreverManager.promote(1);

    expect(contractCalls).to.include("markAsForever:1");
    expect(contractCalls.length).to.equal(2);
  });

  it("should handle comment → sync → promote workflow", async () => {
    const state = new StateTracker();
    state.load(2, "QmHash2", 100, 3);

    let markedAsForever = false;

    const mockIPFSService = {
      updateBottleCounts: async () => ({
        cid: "QmNewHash",
        size: 100,
        url: "https://...",
      }),
    };

    const mockContract = {
      updateBottleIPFS: async () => {},
      getBottle: async () => ({ isForever: false }),
      markBottleAsForever: async () => {
        markedAsForever = true;
      },
    };

    const ipfsSync = new IPFSCountSync(
      mockIPFSService as any,
      state,
      mockContract as any,
    );

    const foreverManager = new ForeverManager(state, mockContract as any, {
      likes: 100,
      comments: 4,
    });

    expect(markedAsForever).to.be.false;

    state.incrementComments(2);
    await ipfsSync.syncBottleCounts(2);
    await foreverManager.promote(2);

    expect(state.get(2).commentCount).to.equal(4);
    expect(markedAsForever).to.be.true;
  });

  it("should not promote if thresholds not met after sync", async () => {
    const state = new StateTracker();
    state.load(3, "QmHash3", 50, 2);

    let markedAsForever = false;

    const mockIPFSService = {
      updateBottleCounts: async () => ({
        cid: "QmNewHash",
        size: 100,
        url: "https://...",
      }),
    };

    const mockContract = {
      updateBottleIPFS: async () => {},
      getBottle: async () => ({ isForever: false }),
      markBottleAsForever: async () => {
        markedAsForever = true;
      },
    };

    const ipfsSync = new IPFSCountSync(
      mockIPFSService as any,
      state,
      mockContract as any,
    );

    const foreverManager = new ForeverManager(state, mockContract as any, {
      likes: 100,
      comments: 4,
    });

    state.incrementLikes(3);
    await ipfsSync.syncBottleCounts(3);
    await foreverManager.promote(3);

    expect(state.get(3).likeCount).to.equal(51);
    expect(markedAsForever).to.be.false;
  });
});
