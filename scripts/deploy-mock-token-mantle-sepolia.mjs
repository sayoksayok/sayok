import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
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
const rpcUrl = process.env.MANTLE_SEPOLIA_RPC_URL || mantleSepolia.rpcUrls.default.http[0]
const tokenName = process.env.MOCK_TOKEN_NAME || 'SayOK Demo USDC'
const tokenSymbol = process.env.MOCK_TOKEN_SYMBOL || 'sUSDC'
const tokenDecimals = Number(process.env.MOCK_TOKEN_DECIMALS || 6)
const initialRecipient = process.env.MOCK_TOKEN_RECIPIENT || ''
const initialSupply = process.env.MOCK_TOKEN_INITIAL_SUPPLY || '10000'

if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY is required for Mantle Sepolia deployment.')
if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
  throw new Error('MOCK_TOKEN_DECIMALS must be an integer between 0 and 18.')
}

const sourcePath = path.join(process.cwd(), 'contracts', 'MockEscrowToken.sol')
const source = fs.readFileSync(sourcePath, 'utf8')
const input = {
  language: 'Solidity',
  sources: {
    'MockEscrowToken.sol': { content: source },
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

const contract = output.contracts['MockEscrowToken.sol'].MockEscrowToken
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

const recipient = initialRecipient || account.address
const initialSupplyUnits = parseUnits(initialSupply, tokenDecimals)

console.log(`Deploying MockEscrowToken to Mantle Sepolia from ${account.address}`)
console.log(`Initial recipient: ${recipient}`)
console.log(`Initial supply: ${initialSupply} ${tokenSymbol}`)

const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [tokenName, tokenSymbol, tokenDecimals, recipient, initialSupplyUnits],
})
console.log(`Deployment tx: ${hash}`)

const receipt = await publicClient.waitForTransactionReceipt({ hash })
const deployment = {
  network: 'mantle-sepolia',
  chainId: mantleSepolia.id,
  contractName: 'MockEscrowToken',
  address: receipt.contractAddress,
  name: tokenName,
  symbol: tokenSymbol,
  decimals: tokenDecimals,
  initialRecipient: recipient,
  initialSupply,
  deployer: account.address,
  transactionHash: hash,
  explorerUrl: `${mantleSepolia.blockExplorers.default.url}/tx/${hash}`,
  deployedAt: new Date().toISOString(),
  notice: 'NOT AUDITED - testnet demo only. Do not use with real funds.',
}

const outputDir = path.join(process.cwd(), 'contracts', 'deployments')
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, 'mantle-sepolia-mock-token.json'), `${JSON.stringify(deployment, null, 2)}\n`)
console.log(`Mock token deployed at ${receipt.contractAddress}`)
console.log(`Use this as ESCROW_ERC20_ADDRESS and NEXT_PUBLIC_ESCROW_TOKEN_ADDRESS.`)
