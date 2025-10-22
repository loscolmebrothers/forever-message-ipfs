export interface BottleState {
  likeCount: number;
  commentCount: number;
  currentIpfsHash: string;
}

export class StateTracker {
  private bottles: Map<number, BottleState> = new Map();

  load(
    bottleId: number,
    ipfsHash: string,
    likeCount: number,
    commentCount: number,
  ): void {
    this.bottles.set(bottleId, {
      likeCount,
      commentCount,
      currentIpfsHash: ipfsHash,
    });
  }

  get(bottleId: number): BottleState | null {
    return this.bottles.get(bottleId) || null;
  }

  require(bottleId: number): BottleState {
    const state = this.bottles.get(bottleId);
    if (!state) {
      throw new Error(
        `Bottle ${bottleId} not loaded. Call loadBottleState first.`,
      );
    }
    return state;
  }

  incrementLikes(bottleId: number): number {
    const state = this.require(bottleId);
    state.likeCount += 1;
    return state.likeCount;
  }

  decrementLikes(bottleId: number): number {
    const state = this.require(bottleId);
    state.likeCount = Math.max(0, state.likeCount - 1);
    return state.likeCount;
  }

  incrementComments(bottleId: number): number {
    const state = this.require(bottleId);
    state.commentCount += 1;
    return state.commentCount;
  }

  updateIpfsHash(bottleId: number, newHash: string): void {
    const state = this.require(bottleId);
    state.currentIpfsHash = newHash;
  }

  getCounts(
    bottleId: number,
  ): { likeCount: number; commentCount: number } | null {
    const state = this.bottles.get(bottleId);
    if (!state) return null;

    return {
      likeCount: state.likeCount,
      commentCount: state.commentCount,
    };
  }
}
