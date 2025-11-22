export interface BottleState {
  likeCount: number;
  currentIpfsHash: string;
}

export class StateTracker {
  private bottles: Map<number, BottleState> = new Map();

  load(
    bottleId: number,
    ipfsHash: string,
    likeCount: number,
  ): void {
    this.bottles.set(bottleId, {
      likeCount,
      currentIpfsHash: ipfsHash,
    });
  }

  get(bottleId: number): BottleState {
    const state = this.bottles.get(bottleId);
    if (!state) {
      throw new Error(`Bottle ${bottleId} not loaded. Call load() first.`);
    }
    return state;
  }

  incrementLikes(bottleId: number): number {
    const state = this.get(bottleId);
    state.likeCount += 1;
    return state.likeCount;
  }

  decrementLikes(bottleId: number): number {
    const state = this.get(bottleId);
    state.likeCount = Math.max(0, state.likeCount - 1);
    return state.likeCount;
  }

  updateIPFSHash(bottleId: number, newHash: string): void {
    const state = this.get(bottleId);
    state.currentIpfsHash = newHash;
  }
}
