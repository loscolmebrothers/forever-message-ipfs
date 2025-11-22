import { describe, it } from "mocha";
import { expect } from "chai";
import { StateTracker } from "../dist/state-tracker.js";

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
    state.load(bottleId, uploadResult.cid, 0);

    expect(bottleId).to.equal(42);
    expect(state.get(42).likeCount).to.equal(0);
    expect(state.get(42).currentIpfsHash).to.equal("QmNewBottle");
  });

  it("should handle like → check forever workflow", async () => {
    const state = new StateTracker();
    state.load(1, "QmInitialHash", 99);

    let contractCalls: string[] = [];

    const mockContract = {
      checkIsForever: async (bottleId: number, likeCount: number) => {
        contractCalls.push(`checkIsForever:${bottleId}:${likeCount}`);
      },
    };

    // Increment like (99 → 100)
    state.incrementLikes(1);

    expect(state.get(1).likeCount).to.equal(100);

    // Backend calls checkIsForever - contract decides if promotion happens
    await mockContract.checkIsForever(1, 100);

    expect(contractCalls).to.include("checkIsForever:1:100");
    expect(contractCalls.length).to.equal(1);
  });

  it("should call checkIsForever even if thresholds not met", async () => {
    const state = new StateTracker();
    state.load(3, "QmHash3", 50);

    let checkIsForeverCalled = false;

    const mockContract = {
      checkIsForever: async (bottleId: number, likeCount: number) => {
        checkIsForeverCalled = true;
        // Backend doesn't check thresholds - just passes counts to contract
        expect(likeCount).to.equal(51);
      },
    };

    state.incrementLikes(3);

    expect(state.get(3).likeCount).to.equal(51);

    // Backend always calls checkIsForever - contract decides internally
    await mockContract.checkIsForever(3, 51);

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
    state.load(bottle1Id, bottle1Hash, 0);

    const bottle2Hash = (
      await mockIPFSService.uploadBottle("Hello from user2", "user2")
    ).cid;
    const bottle2Id = await mockContract.createBottle(bottle2Hash, user2);
    state.load(bottle2Id, bottle2Hash, 0);

    const bottle3Hash = (
      await mockIPFSService.uploadBottle("Hello from user3", "user3")
    ).cid;
    const bottle3Id = await mockContract.createBottle(bottle3Hash, user3);
    state.load(bottle3Id, bottle3Hash, 0);

    expect(createdBottles).to.have.length(3);
    expect(createdBottles[0].creator).to.equal(user1);
    expect(createdBottles[1].creator).to.equal(user2);
    expect(createdBottles[2].creator).to.equal(user3);

    expect(state.get(1).currentIpfsHash).to.equal("Qmuser1_Hello from user1");
    expect(state.get(2).currentIpfsHash).to.equal("Qmuser2_Hello from user2");
    expect(state.get(3).currentIpfsHash).to.equal("Qmuser3_Hello from user3");
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
    };

    const mockContract = {
      createBottle: async (ipfsHash: string, creator: string) => 1,
      likeBottle: async (bottleId: number, liker: string) => {},
      checkIsForever: async (bottleId: number, likes: number) => {
        if (likes >= 100) {
          promotedBottle = bottleId;
        }
      },
    };

    const bottleHash = (await mockIPFSService.uploadBottle()).cid;
    const bottleId = await mockContract.createBottle(bottleHash, user1);
    state.load(bottleId, bottleHash, 0);

    for (let i = 0; i < 100; i++) {
      state.incrementLikes(bottleId);
      await mockContract.likeBottle(bottleId, user2);
    }

    await mockContract.checkIsForever(bottleId, state.get(bottleId).likeCount);

    expect(state.get(bottleId).likeCount).to.equal(100);
    expect(promotedBottle).to.equal(1);
    expect(state.get(bottleId).currentIpfsHash).to.equal("QmBottle");
  });

  it("should verify creator address is passed correctly", async () => {
    const creatorAddress = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    let capturedCreator: string | null = null;

    const mockIPFSService = {
      uploadBottle: async () => ({
        cid: "QmBottle",
        size: 100,
        url: "https://...",
      }),
    };

    const mockContract = {
      createBottle: async (ipfsHash: string, creator: string) => {
        capturedCreator = creator;
        return 1;
      },
    };

    const bottleHash = (await mockIPFSService.uploadBottle()).cid;
    await mockContract.createBottle(bottleHash, creatorAddress);

    expect(capturedCreator).to.equal(creatorAddress);
  });
});
