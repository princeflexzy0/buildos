const {ethers} = require('ethers');
require('dotenv').config();
const provider = new ethers.JsonRpcProvider('https://testrpc.xlayer.tech');
let pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk.startsWith('0x')) pk = '0x' + pk;
const wallet = new ethers.Wallet(pk, provider);
const ESCROW = '0xE6ab6b4B168af36f6bd0dAc5caC15d99aC07bAfe';
const ABI = ['function depositNative(address recipient, uint256 unlockAt) payable returns (uint256)'];
const escrow = new ethers.Contract(ESCROW, ABI, wallet);
const unlockAt = Math.floor(Date.now()/1000) + 120; // 2 min
escrow.depositNative('0x7b2a70C7c4B55cE6712151050fA6D0D3f7550cA6', unlockAt, {
  value: ethers.parseEther('0.001')
}).then(tx => {
  console.log('TX:', tx.hash);
  return tx.wait();
}).then(r => {
  const log = r.logs[0];
  const depositId = parseInt(log.topics[1], 16);
  console.log('Deposit ID:', depositId);
  console.log('Confirmed!');
}).catch(e => console.error(e.message));
