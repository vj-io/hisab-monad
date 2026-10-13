import { parseEther } from 'viem';
import { deployer, handler, publicClient, sendTx, valid } from './_lib.js';

export default handler(async ({ address }) => {
  if (!valid(address)) throw Object.assign(new Error('invalid address'), { status: 400 });
  const bal = await publicClient.getBalance({ address });
  if (bal >= parseEther('0.1')) return { funded: false, balance: bal.toString() };
  const { account, wallet } = deployer();
  // keep headroom so seeding (register/seed/backdate) keeps working
  if ((await publicClient.getBalance({ address: account.address })) < parseEther('0.5')) {
    throw Object.assign(new Error('Faucet is low on MON; ask the operator to top up the deployer wallet'), { status: 503 });
  }
  const { hash } = await sendTx(() => wallet.sendTransaction({ to: address, value: parseEther('0.2') }));
  return { funded: true, hash };
});
