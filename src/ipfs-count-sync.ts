import { IPFSService } from "./service";
import { StateTracker } from "./state-tracker";
import { BottleContract } from "./bottle-contract";

export class IPFSCountSync {
  constructor(
    private ipfsService: IPFSService,
    private state: StateTracker,
    private contract: BottleContract,
  ) {}

  async syncBottleCounts(bottleId: number): Promise<void> {
    const bottleState = this.state.get(bottleId);

    const newMetadata = await this.ipfsService.updateBottleCounts(
      bottleState.currentIpfsHash,
      bottleState.likeCount,
      bottleState.commentCount,
    );

    await this.contract.updateBottleIPFS(bottleId, newMetadata.cid);

    this.state.updateIPFSHash(bottleId, newMetadata.cid);
  }
}
