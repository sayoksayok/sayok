import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const mantleSepolia = {
  id: 5003,
  name: 'Mantle Sepolia',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MANTLE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.mantle.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Mantle Sepolia Explorer', url: 'https://explorer.sepolia.mantle.xyz' },
  },
}

const privateKey = process.env.DEPLOYER_PRIVATE_KEY
const tokenAddress = process.env.ESCROW_ERC20_ADDRESS || process.env.NEXT_PUBLIC_ESCROW_TOKEN_ADDRESS
const rpcUrl = process.env.MANTLE_SEPOLIA_RPC_URL || mantleSepolia.rpcUrls.default.http[0]

if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY is required for Mantle Sepolia deployment.')
if (!tokenAddress) throw new Error('ESCROW_ERC20_ADDRESS or NEXT_PUBLIC_ESCROW_TOKEN_ADDRESS is required.')

const sourcePath = path.join(process.cwd(), 'contracts', 'OutcomeReferralEscrow.sol')
const source = fs.readFileSync(sourcePath, 'utf8')
const input = {
  language: 'Solidity',
  sources: {
    'OutcomeReferralEscrow.sol': { content: source },
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = output.errors?.filter((entry) => entry.severity === 'error') || []
if (errors.length > 0) {
  throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'))
}

const contract = output.contracts['OutcomeReferralEscrow.sol'].OutcomeReferralEscrow
const abi = contract.abi
const bytecode = `0x${contract.evm.bytecode.object}`
const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`)
const transport = http(rpcUrl)
const publicClient = createPublicClient({ chain: mantleSepolia, transport })
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport })
const chainId = await publicClient.getChainId()

if (chainId !== mantleSepolia.id) {
  throw new Error(`Refusing to deploy: expected Mantle Sepolia chain id 5003, received ${chainId}.`)
}

console.log(`Deploying OutcomeReferralEscrow to Mantle Sepolia from ${account.address}`)
console.log(`Settlement token: ${tokenAddress}`)

const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [tokenAddress],
})
console.log(`Deployment tx: ${hash}`)

const receipt = await publicClient.waitForTransactionReceipt({ hash })
const deployment = {
  network: 'mantle-sepolia',
  chainId: mantleSepolia.id,
  contractName: 'OutcomeReferralEscrow',
  address: receipt.contractAddress,
  settlementToken: tokenAddress,
  deployer: account.address,
  transactionHash: hash,
  explorerUrl: `${mantleSepolia.blockExplorers.default.url}/tx/${hash}`,
  deployedAt: new Date().toISOString(),
  notice: 'NOT AUDITED - testnet demo only. Do not use with real funds.',
}

const outputDir = path.join(process.cwd(), 'contracts', 'deployments')
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, 'mantle-sepolia.json'), `${JSON.stringify(deployment, null, 2)}\n`)
console.log(`Escrow deployed at ${receipt.contractAddress}`)
