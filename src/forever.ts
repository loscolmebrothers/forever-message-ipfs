import { StateTracker } from "./state";
import { BottleContract } from "./bottle-contract";

export interface ForeverThresholds {
  likes: number;
  comments: number;
}

export class ForeverChecker {
  private thresholds: ForeverThresholds;

  constructor(
    private state: StateTracker,
    private contract: BottleContract,
    thresholds?: Partial<ForeverThresholds>,
  ) {
    this.thresholds = {
      likes: thresholds?.likes ?? 100,
      comments: thresholds?.comments ?? 4,
    };
  }

  async checkAndMark(bottleId: number): Promise<void> {
    const bottleState = this.state.require(bottleId);

    if (
      bottleState.likeCount >= this.thresholds.likes &&
      bottleState.commentCount >= this.thresholds.comments
    ) {
      const bottle = await this.contract.getBottle(bottleId);
      if (!bottle.isForever) {
        await this.contract.markBottleAsForever(bottleId);
        console.log(`Bottle ${bottleId} marked as forever! 🎉`);
      }
    }
  }
}
