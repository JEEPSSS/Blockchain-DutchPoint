import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  paths: {
    sources: "./contracts",
    tests: {
      mocha: "./test",
      solidity: "./test/solidity"
    },
    cache: "./cache",
    artifacts: "./artifacts"
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 500
          },
          viaIR: true
        }
      }
    }
  },
  networks: {
    // Used by `npm run node`. Mining a block every 2 seconds keeps block.timestamp moving on
    // the local chain, so the UI's countdown and time-based clearing track real time.
    node: {
      type: "edr-simulated",
      chainType: "l1",
      mining: {
        auto: true,
        interval: 2000
      }
    },
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1"
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545"
    },
    // Optional public testnet. Secrets are read from the Hardhat keystore or environment
    // variables only when this network is used: npm run keystore -- set SEPOLIA_RPC_URL
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")]
    }
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY")
    }
  },
  test: {
    mocha: {
      timeout: 60_000
    },
    solidity: {
      fuzz: {
        runs: 1000
      },
      invariant: {
        runs: 256,
        depth: 50,
        failOnRevert: true
      }
    }
  }
});

