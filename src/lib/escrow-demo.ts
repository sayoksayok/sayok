import { defineChain } from 'viem'

export const escrowDemoEnabled = process.env.NEXT_PUBLIC_ESCROW_DEMO === 'true'

export const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_MANTLE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Mantle Sepolia Explorer',
      url: 'https://explorer.sepolia.mantle.xyz',
    },
  },
  testnet: true,
})

export const escrowContractAddress = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as `0x${string}` | undefined
export const escrowTokenAddress = process.env.NEXT_PUBLIC_ESCROW_TOKEN_ADDRESS as `0x${string}` | undefined
export const escrowTokenDecimals = Number(process.env.NEXT_PUBLIC_ESCROW_TOKEN_DECIMALS || 6)
export const escrowDemoPayee = (process.env.NEXT_PUBLIC_ESCROW_DEMO_PAYEE || '0x1111111111111111111111111111111111111111') as `0x${string}`
export const mantleExplorerUrl = mantleSepolia.blockExplorers.default.url

export const outcomeReferralEscrowAbi = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'referralId', type: 'string' },
      { name: 'payee', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'release',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'referralId', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'referralId', type: 'string' }],
    outputs: [],
  },
] as const

export const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const
