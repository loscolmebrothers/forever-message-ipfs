import { ethers } from "ethers";

export interface BottleContractConfig {
  contractAddress: string;
  contractABI: ethers.InterfaceAbi;
  signer: ethers.Signer;
}

export class BottleContract {
  private contract: ethers.Contract;

  constructor(config: BottleContractConfig) {
    this.contract = new ethers.Contract(
      config.contractAddress,
      config.contractABI,
      config.signer,
    );
  }

  async createBottle(
    ipfsHash: string,
    creatorAddress: string,
  ): Promise<number> {
    const tx = await this.contract.createBottle(ipfsHash, creatorAddress);
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "BottleCreated",
    );
    return event ? Number(event.args[0]) : 0;
  }

  async likeBottle(bottleId: number, likerAddress: string): Promise<void> {
    const tx = await this.contract.likeBottle(bottleId, likerAddress);
    await tx.wait();
  }

  async unlikeBottle(bottleId: number, unlikerAddress: string): Promise<void> {
    const tx = await this.contract.unlikeBottle(bottleId, unlikerAddress);
    await tx.wait();
  }

  async updateBottleIPFS(bottleId: number, newIPFSHash: string): Promise<void> {
    const tx = await this.contract.updateBottleIPFS(bottleId, newIPFSHash);
    await tx.wait();
  }

  async checkIsForever(
    bottleId: number,
    likeCount: number,
  ): Promise<void> {
    const tx = await this.contract.checkIsForever(
      bottleId,
      likeCount,
    );
    await tx.wait();
  }

  async getBottle(bottleId: number): Promise<any> {
    return await this.contract.getBottle(bottleId);
  }
}
