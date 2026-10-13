import { parseEther } from 'viem';
import { deployer, handler, publicClient, valid } from './_lib.js';

export default handler(async ({ address }) => {
  if (!valid(address)) throw Object.assign(new Error('invalid address'), { status: 400 });
  const bal = await publicClient.getBalance({ address });
  if (bal >= parseEther('0.03')) return { funded: false, balance: bal.toString() };
  const { wallet } = deployer();
  const hash = await wallet.sendTransaction({ to: address, value: parseEther('0.05') });
  await publicClient.waitForTransactionReceipt({ hash });
  return { funded: true, hash };
});
