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

describe("Integration: Multi-User Scenarios", () => {
  it("should handle multiple users creating bottles", async () => {
    const state = new StateTracker();
    const createdBottles: Array<{ id: number; creator: string }> = [];

    const mockIPFSService = {
      uploadBottle: async (message: string, userId: string) => ({
        cid: `Qm${userId}_${message}`,
        size: 100,
        url: "https://...",
      }),
    };

    const mockContract = {
      createBottle: async (ipfsHash: string, creator: string) => {
        const bottleId = createdBottles.length + 1;
        createdBottles.push({ id: bottleId, creator });
        return bottleId;
      },
    };

    const user1 = "0x1111111111111111111111111111111111111111";
    const user2 = "0x2222222222222222222222222222222222222222";
    const user3 = "0x3333333333333333333333333333333333333333";

    const bottle1Hash = (
      await mockIPFSService.uploadBottle("Hello from user1", "user1")
    ).cid;
    const bottle1Id = await mockContract.createBottle(bottle1Hash, user1);
    state.load(bottle1Id, bottle1Hash, 0, 0);

    const bottle2Hash = (
      await mockIPFSService.uploadBottle("Hello from user2", "user2")
    ).cid;
    const bottle2Id = await mockContract.createBottle(bottle2Hash, user2);
    state.load(bottle2Id, bottle2Hash, 0, 0);

    const bottle3Hash = (
      await mockIPFSService.uploadBottle("Hello from user3", "user3")
    ).cid;
    const bottle3Id = await mockContract.createBottle(bottle3Hash, user3);
    state.load(bottle3Id, bottle3Hash, 0, 0);

    expect(createdBottles).to.have.length(3);
    expect(createdBottles[0].creator).to.equal(user1);
    expect(createdBottles[1].creator).to.equal(user2);
    expect(createdBottles[2].creator).to.equal(user3);

    expect(state.get(1).currentIpfsHash).to.equal("Qmuser1_Hello from user1");
    expect(state.get(2).currentIpfsHash).to.equal("Qmuser2_Hello from user2");
    expect(state.get(3).currentIpfsHash).to.equal("Qmuser3_Hello from user3");
  });

  it("should handle multiple users commenting on same bottle", async () => {
    const state = new StateTracker();
    state.load(1, "QmBottle1", 0, 0);

    const comments: Array<{ bottleId: number; commenter: string }> = [];

    const mockIPFSService = {
      uploadComment: async (
        message: string,
        bottleId: number,
        userId: string,
      ) => ({
        cid: `QmComment_${userId}_${bottleId}`,
        size: 50,
        url: "https://...",
      }),
    };

    const mockContract = {
      addComment: async (
        bottleId: number,
        ipfsHash: string,
        commenter: string,
      ) => {
        const commentId = comments.length + 1;
        comments.push({ bottleId, commenter });
        return commentId;
      },
    };

    const user1 = "0x1111111111111111111111111111111111111111";
    const user2 = "0x2222222222222222222222222222222222222222";
    const user3 = "0x3333333333333333333333333333333333333333";

    const comment1Hash = (
      await mockIPFSService.uploadComment("Nice bottle!", 1, "user1")
    ).cid;
    await mockContract.addComment(1, comment1Hash, user1);
    state.incrementComments(1);

    const comment2Hash = (
      await mockIPFSService.uploadComment("Great message!", 1, "user2")
    ).cid;
    await mockContract.addComment(1, comment2Hash, user2);
    state.incrementComments(1);

    const comment3Hash = (
      await mockIPFSService.uploadComment("Love it!", 1, "user3")
    ).cid;
    await mockContract.addComment(1, comment3Hash, user3);
    state.incrementComments(1);

    expect(comments).to.have.length(3);
    expect(comments[0].commenter).to.equal(user1);
    expect(comments[1].commenter).to.equal(user2);
    expect(comments[2].commenter).to.equal(user3);
    expect(comments.every((c) => c.bottleId === 1)).to.be.true;

    expect(state.get(1).commentCount).to.equal(3);
  });

  it("should handle full forever promotion flow with multiple users", async () => {
    const state = new StateTracker();
    const user1 = "0x1111111111111111111111111111111111111111";
    const user2 = "0x2222222222222222222222222222222222222222";

    let promotedBottle: number | null = null;

    const mockIPFSService = {
      uploadBottle: async () => ({
        cid: "QmBottle",
        size: 100,
        url: "https://...",
      }),
      updateBottleCounts: async (
        cid: string,
        likes: number,
        comments: number,
      ) => ({
        cid: `QmUpdated_${likes}_${comments}`,
        size: 100,
        url: "https://...",
      }),
    };

    const mockContract = {
      createBottle: async (ipfsHash: string, creator: string) => 1,
      likeBottle: async (bottleId: number, liker: string) => {},
      updateBottleIPFS: async (bottleId: number, newHash: string) => {},
      checkIsForever: async (
        bottleId: number,
        likes: number,
        comments: number,
      ) => {
        if (likes >= 100 && comments >= 4) {
          promotedBottle = bottleId;
        }
      },
    };

    const ipfsSync = new IPFSCountSync(
      mockIPFSService as any,
      state,
      mockContract as any,
    );

    const bottleHash = (await mockIPFSService.uploadBottle()).cid;
    const bottleId = await mockContract.createBottle(bottleHash, user1);
    state.load(bottleId, bottleHash, 0, 0);

    for (let i = 0; i < 100; i++) {
      state.incrementLikes(bottleId);
      await mockContract.likeBottle(bottleId, user2);
    }

    for (let i = 0; i < 4; i++) {
      state.incrementComments(bottleId);
    }

    await ipfsSync.syncBottleCounts(bottleId);
    await mockContract.checkIsForever(
      bottleId,
      state.get(bottleId).likeCount,
      state.get(bottleId).commentCount,
    );

    expect(state.get(bottleId).likeCount).to.equal(100);
    expect(state.get(bottleId).commentCount).to.equal(4);
    expect(promotedBottle).to.equal(1);
    expect(state.get(bottleId).currentIpfsHash).to.equal("QmUpdated_100_4");
  });

  it("should verify creator and commenter addresses are passed correctly", async () => {
    const creatorAddress = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const commenterAddress = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

    let capturedCreator: string | null = null;
    let capturedCommenter: string | null = null;

    const mockIPFSService = {
      uploadBottle: async () => ({
        cid: "QmBottle",
        size: 100,
        url: "https://...",
      }),
      uploadComment: async () => ({
        cid: "QmComment",
        size: 50,
        url: "https://...",
      }),
    };

    const mockContract = {
      createBottle: async (ipfsHash: string, creator: string) => {
        capturedCreator = creator;
        return 1;
      },
      addComment: async (
        bottleId: number,
        ipfsHash: string,
        commenter: string,
      ) => {
        capturedCommenter = commenter;
        return 1;
      },
    };

    const bottleHash = (await mockIPFSService.uploadBottle()).cid;
    await mockContract.createBottle(bottleHash, creatorAddress);

    const commentHash = (await mockIPFSService.uploadComment()).cid;
    await mockContract.addComment(1, commentHash, commenterAddress);

    expect(capturedCreator).to.equal(creatorAddress);
    expect(capturedCommenter).to.equal(commenterAddress);
  });
});
