import { ethers } from "ethers";
import { IPFSService } from "./service";
import { StateTracker } from "./state";
import type { IPFSBottle } from "@loscolmebrothers/forever-message-types";

export interface BottleManagerConfig {
  contractAddress: string;
  contractABI: ethers.InterfaceAbi;
  provider: ethers.Provider;
  signer: ethers.Signer;
  ipfsService: IPFSService;
  likesThreshold?: number;
  commentsThreshold?: number;
}

/**
 * Manages bottle interactions including likes, comments, and metadata updates
 * This handles the coordination between the smart contract and IPFS
 */
export class BottleManager {
  private contract: ethers.Contract;
  private ipfsService: IPFSService;
  private likesThreshold: number;
  private commentsThreshold: number;
  private state: StateTracker;

  constructor(config: BottleManagerConfig) {
    this.contract = new ethers.Contract(
      config.contractAddress,
      config.contractABI,
      config.signer,
    );
    this.ipfsService = config.ipfsService;
    this.likesThreshold = config.likesThreshold ?? 100;
    this.commentsThreshold = config.commentsThreshold ?? 4;
    this.state = new StateTracker();
  }

  /**
   * Initialize bottle tracking by loading current state from IPFS
   */
  async loadBottleState(bottleId: number, ipfsHash: string): Promise<void> {
    const bottleData = await this.ipfsService.getItem<IPFSBottle>(ipfsHash);

    this.state.load(
      bottleId,
      ipfsHash,
      bottleData.likeCount ?? 0,
      bottleData.commentCount ?? 0,
    );
  }

  /**
   * Handle a like request: emit event, update counts, and update IPFS if needed
   */
  async likeBottle(bottleId: number, likerAddress: string): Promise<void> {
    // 1. Call contract to emit the like event
    const tx = await this.contract.likeBottle(bottleId, likerAddress);
    await tx.wait();

    // 2. Increment like count
    this.state.incrementLikes(bottleId);

    // 3. Update IPFS metadata with new count
    await this.updateBottleIPFS(bottleId);

    // 4. Check if bottle should become forever
    await this.checkAndMarkForever(bottleId);
  }

  /**
   * Handle an unlike request
   */
  async unlikeBottle(bottleId: number, unlikerAddress: string): Promise<void> {
    // 1. Call contract to emit the unlike event
    const tx = await this.contract.unlikeBottle(bottleId, unlikerAddress);
    await tx.wait();

    // 2. Decrement like count (doesn't go below 0)
    this.state.decrementLikes(bottleId);

    // 3. Update IPFS metadata
    await this.updateBottleIPFS(bottleId);
  }

  /**
   * Handle adding a comment
   */
  async addComment(
    bottleId: number,
    commentMessage: string,
    userId: string,
  ): Promise<number> {
    // 1. Upload comment to IPFS
    const commentResult = await this.ipfsService.uploadComment(
      commentMessage,
      bottleId,
      userId,
    );

    // 2. Add comment to contract
    const tx = await this.contract.addComment(bottleId, commentResult.cid);
    const receipt = await tx.wait();

    // Extract comment ID from event (assuming CommentAdded event)
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "CommentAdded",
    );
    const commentId = event ? Number(event.args[0]) : 0;

    // 3. Increment comment count
    this.state.incrementComments(bottleId);

    // 4. Update bottle IPFS metadata
    await this.updateBottleIPFS(bottleId);

    // 5. Check if bottle should become forever
    await this.checkAndMarkForever(bottleId);

    return commentId;
  }

  /**
   * Update the bottle's IPFS metadata and update the contract with new hash
   */
  private async updateBottleIPFS(bottleId: number): Promise<void> {
    const bottleState = this.state.require(bottleId);

    // Update metadata in IPFS (creates a new version)
    const newMetadata = await this.ipfsService.updateBottleCounts(
      bottleState.currentIpfsHash,
      bottleState.likeCount,
      bottleState.commentCount,
    );

    // Update the contract with the new IPFS hash
    const tx = await this.contract.updateBottleIPFS(bottleId, newMetadata.cid);
    await tx.wait();

    // Update our local state with the new hash
    this.state.updateIpfsHash(bottleId, newMetadata.cid);
  }

  /**
   * Check if bottle meets forever criteria and mark it if so
   */
  private async checkAndMarkForever(bottleId: number): Promise<void> {
    const bottleState = this.state.require(bottleId);

    if (
      bottleState.likeCount >= this.likesThreshold &&
      bottleState.commentCount >= this.commentsThreshold
    ) {
      // Check if already marked (to avoid redundant calls)
      const bottle = await this.contract.getBottle(bottleId);
      if (!bottle.isForever) {
        const tx = await this.contract.markBottleAsForever(bottleId);
        await tx.wait();
        console.log(`Bottle ${bottleId} marked as forever! 🎉`);
      }
    }
  }

  /**
   * Get current counts for a bottle
   */
  getBottleCounts(bottleId: number): {
    likeCount: number;
    commentCount: number;
  } | null {
    return this.state.getCounts(bottleId);
  }

  /**
   * Create a new bottle
   */
  async createBottle(message: string, userId: string): Promise<number> {
    // 1. Upload to IPFS
    const uploadResult = await this.ipfsService.uploadBottle(message, userId);

    // 2. Create bottle on contract
    const tx = await this.contract.createBottle(uploadResult.cid);
    const receipt = await tx.wait();

    // Extract bottle ID from event
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "BottleCreated",
    );
    const bottleId = event ? Number(event.args[0]) : 0;

    // 3. Initialize state tracking
    this.state.load(bottleId, uploadResult.cid, 0, 0);

    return bottleId;
  }
}
