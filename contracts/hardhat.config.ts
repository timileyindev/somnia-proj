import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";
import "dotenv/config";

const somniaRpcUrl = process.env.SOMNIA_RPC_URL;
const somniaPrivateKey = process.env.SOMNIA_PRIVATE_KEY;
const somniaChainId = process.env.SOMNIA_CHAIN_ID
  ? Number(process.env.SOMNIA_CHAIN_ID)
  : undefined;

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.30",
      },
      production: {
        version: "0.8.30",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    ...(somniaRpcUrl
      ? {
          somniaTestnet: {
            type: "http",
            chainType: "l1",
            url: somniaRpcUrl,
            chainId: somniaChainId,
            accounts: somniaPrivateKey ? [somniaPrivateKey] : [],
          },
        }
      : {}),
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
});
