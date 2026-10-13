import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { deployStack } from "./monadStack";

const EXPLORER = "https://testnet.monadexplorer.com";

async function main() {
  const s = await deployStack(true);
  const addr = async (c: { getAddress(): Promise<string> }) => c.getAddress();
  const net = await ethers.provider.getNetwork();
  const deployBlock = await ethers.provider.getBlockNumber();

  const artefact = {
    chainId: Number(net.chainId),
    rpcUrl: (network.config as { url?: string }).url ?? "",
    explorer: EXPLORER,
    deployBlock,
    feeWallet: s.deployer.address,
    demoMode: true,
    contracts: {
      roles: await addr(s.roles),
      registry: await addr(s.registry),
      token: await addr(s.token),
      engine: await addr(s.engine),
      pool: await addr(s.pool),
      credit: await addr(s.credit),
      ausd: await addr(s.ausd),
      remittance: await addr(s.remittance),
      ebrc: await addr(s.ebrc),
      payoutLedger: await addr(s.payoutLedger),
    },
  };
  const json = JSON.stringify(artefact, null, 2) + "\n";

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, network.name === "monadTestnet" ? "monad-testnet.json" : `${network.name}-monad.json`);
  fs.writeFileSync(file, json);
  console.log("wrote", path.relative(process.cwd(), file));

  if (network.name === "monadTestnet") {
    const web = path.join(__dirname, "..", "..", "apps", "web", "src", "monad", "deployments.json");
    fs.mkdirSync(path.dirname(web), { recursive: true });
    fs.writeFileSync(web, json);
    console.log("wrote", path.relative(process.cwd(), web));
  }
  console.log(artefact.contracts);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
