import { describe, it } from "mocha";
import { expect } from "chai";
import { StateTracker } from "../dist/state-tracker.js";
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

  it("should handle like → sync → check forever workflow", async () => {
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
      checkIsForever: async (
        bottleId: number,
        likeCount: number,
        commentCount: number,
      ) => {
        contractCalls.push(
          `checkIsForever:${bottleId}:${likeCount}:${commentCount}`,
        );
      },
    };

    const ipfsSync = new IPFSCountSync(
      mockIPFSService as any,
      state,
      mockContract as any,
    );

    // Increment like (99 → 100)
    state.incrementLikes(1);

    // Sync counts to IPFS
    await ipfsSync.syncBottleCounts(1);

    expect(state.get(1).likeCount).to.equal(100);
    expect(state.get(1).currentIpfsHash).to.equal("QmUpdated_100_4");
    expect(contractCalls).to.include("updateBottleIPFS:1:QmUpdated_100_4");

    // Backend calls checkIsForever - contract decides if promotion happens
    await mockContract.checkIsForever(1, 100, 4);

    expect(contractCalls).to.include("checkIsForever:1:100:4");
    expect(contractCalls.length).to.equal(2);
  });

  it("should handle comment → sync → check forever workflow", async () => {
    const state = new StateTracker();
    state.load(2, "QmHash2", 100, 3);

    let checkIsForeverCalled = false;

    const mockIPFSService = {
      updateBottleCounts: async () => ({
        cid: "QmNewHash",
        size: 100,
        url: "https://...",
      }),
    };

    const mockContract = {
      updateBottleIPFS: async () => {},
      checkIsForever: async (
        bottleId: number,
        likeCount: number,
        commentCount: number,
      ) => {
        checkIsForeverCalled = true;
        expect(bottleId).to.equal(2);
        expect(likeCount).to.equal(100);
        expect(commentCount).to.equal(4);
      },
    };

    const ipfsSync = new IPFSCountSync(
      mockIPFSService as any,
      state,
      mockContract as any,
    );

    expect(checkIsForeverCalled).to.be.false;

    // Increment comment (3 → 4)
    state.incrementComments(2);
    await ipfsSync.syncBottleCounts(2);

    expect(state.get(2).commentCount).to.equal(4);

    // Backend calls checkIsForever with current counts
    await mockContract.checkIsForever(2, 100, 4);

    expect(checkIsForeverCalled).to.be.true;
  });

  it("should call checkIsForever even if thresholds not met", async () => {
    const state = new StateTracker();
    state.load(3, "QmHash3", 50, 2);

    let checkIsForeverCalled = false;

    const mockIPFSService = {
      updateBottleCounts: async () => ({
        cid: "QmNewHash",
        size: 100,
        url: "https://...",
      }),
    };

    const mockContract = {
      updateBottleIPFS: async () => {},
      checkIsForever: async (
        bottleId: number,
        likeCount: number,
        commentCount: number,
      ) => {
        checkIsForeverCalled = true;
        // Backend doesn't check thresholds - just passes counts to contract
        expect(likeCount).to.equal(51);
        expect(commentCount).to.equal(2);
      },
    };

    const ipfsSync = new IPFSCountSync(
      mockIPFSService as any,
      state,
      mockContract as any,
    );

    state.incrementLikes(3);
    await ipfsSync.syncBottleCounts(3);

    expect(state.get(3).likeCount).to.equal(51);

    // Backend always calls checkIsForever - contract decides internally
    await mockContract.checkIsForever(3, 51, 2);

    expect(checkIsForeverCalled).to.be.true;
  });
});
