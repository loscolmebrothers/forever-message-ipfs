import { StateTracker } from "./state-tracker";
import { BottleContract } from "./bottle-contract";

export interface ForeverThresholds {
  likes: number;
  comments: number;
}

export class ForeverManager {
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

  async promote(bottleId: number): Promise<void> {
    if (!this.meetsThreshold(bottleId)) {
      return;
    }

    const bottle = await this.contract.getBottle(bottleId);
    if (!bottle.isForever) {
      await this.contract.markBottleAsForever(bottleId);
      console.log(`Bottle ${bottleId} marked as forever! 🎉`);
    }
  }

  private meetsThreshold(bottleId: number): boolean {
    const bottleState = this.state.get(bottleId);
    return (
      bottleState.likeCount >= this.thresholds.likes &&
      bottleState.commentCount >= this.thresholds.comments
    );
  }
}
