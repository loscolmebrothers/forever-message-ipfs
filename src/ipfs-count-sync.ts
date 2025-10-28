import { IPFSService } from "./service";
import { StateTracker } from "./state-tracker";
import { BottleContract } from "./bottle-contract";

/**
 * Syncs comment count to IPFS when a bottle is promoted to "forever" status
 *
 * NOTE: likeCount is NOT synced to IPFS - it's managed in Supabase
 * Only commentCount is synced because:
 * - Comments are capped at 4/user (low volume, worth storing)
 * - Likes are unlimited (high volume, stored in Supabase)
 */
export class IPFSCountSync {
  constructor(
    private ipfsService: IPFSService,
    private state: StateTracker,
    private contract: BottleContract,
  ) {}

  async syncBottleCommentCount(bottleId: number): Promise<void> {
    const bottleState = this.state.get(bottleId);

    // Only sync commentCount - likeCount managed in Supabase
    const newMetadata = await this.ipfsService.updateBottleCommentCount(
      bottleState.currentIpfsHash,
      bottleState.commentCount,
    );

    await this.contract.updateBottleIPFS(bottleId, newMetadata.cid);

    this.state.updateIPFSHash(bottleId, newMetadata.cid);
  }
}
