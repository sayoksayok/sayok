'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { createConfig, http, WagmiProvider, useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatUnits, parseUnits } from 'viem'
import {
  erc20Abi,
  escrowContractAddress,
  escrowDemoPayee,
  escrowTokenAddress,
  escrowTokenDecimals,
  mantleExplorerUrl,
  mantleSepolia,
  outcomeReferralEscrowAbi,
} from '@/lib/escrow-demo'

const referral = {
  id: 'demo-referral-japan-program-001',
  payee: escrowDemoPayee,
  amount: '25',
  condition: 'reply received / intro accepted',
  context: 'A Japanese language program accepted an introduction for Kakehashi-style online lessons.',
}

export default function SettlementDemoClient() {
  const [queryClient] = useState(() => new QueryClient())
  const config = useMemo(() => createConfig({
    chains: [mantleSepolia],
    connectors: [injected()],
    transports: {
      [mantleSepolia.id]: http(mantleSepolia.rpcUrls.default.http[0]),
    },
    ssr: true,
  }), [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SettlementPanel />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

function SettlementPanel() {
  const { address, chainId, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync, data: lastHash, isPending: isWriting } = useWriteContract()
  const publicClient = usePublicClient({ chainId: mantleSepolia.id })
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: lastHash,
    chainId: mantleSepolia.id,
  })
  const [status, setStatus] = useState<'proposed' | 'deposited' | 'released' | 'refunded'>('proposed')
  const [actionError, setActionError] = useState('')

  const missingConfig = !escrowContractAddress || !escrowTokenAddress
  const isWrongChain = isConnected && chainId !== mantleSepolia.id
  const amountUnits = parseUnits(referral.amount, escrowTokenDecimals)
  const txUrl = lastHash ? `${mantleExplorerUrl}/tx/${lastHash}` : ''

  async function deposit() {
    if (!escrowContractAddress || !escrowTokenAddress) return
    setActionError('')
    try {
      const approveHash = await writeContractAsync({
        address: escrowTokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [escrowContractAddress, amountUnits],
        chainId: mantleSepolia.id,
      })
      console.log('Escrow token approval tx:', approveHash)
      await publicClient?.waitForTransactionReceipt({ hash: approveHash })
      await writeContractAsync({
        address: escrowContractAddress,
        abi: outcomeReferralEscrowAbi,
        functionName: 'deposit',
        args: [referral.id, referral.payee as `0x${string}`, amountUnits],
        chainId: mantleSepolia.id,
      })
      setStatus('deposited')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Deposit failed.')
    }
  }

  async function release() {
    if (!escrowContractAddress) return
    setActionError('')
    try {
      await writeContractAsync({
        address: escrowContractAddress,
        abi: outcomeReferralEscrowAbi,
        functionName: 'release',
        args: [referral.id],
        chainId: mantleSepolia.id,
      })
      setStatus('released')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Release failed.')
    }
  }

  async function refund() {
    if (!escrowContractAddress) return
    setActionError('')
    try {
      await writeContractAsync({
        address: escrowContractAddress,
        abi: outcomeReferralEscrowAbi,
        functionName: 'refund',
        args: [referral.id],
        chainId: mantleSepolia.id,
      })
      setStatus('refunded')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Refund failed.')
    }
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-orange-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <a href="/new-deal" className="text-xl font-black text-orange-500">SayOK</a>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-orange-700">
            Mantle Sepolia demo only
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold leading-6 text-red-800">
          NOT AUDITED - testnet demo only. This route is hidden unless NEXT_PUBLIC_ESCROW_DEMO=true.
          Do not send real funds. Production SayOK is not wired to this contract.
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">Matched referral</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Outcome-based settlement</h1>
            <dl className="mt-5 space-y-4 text-sm">
              <InfoRow label="Referral ID" value={referral.id} />
              <InfoRow label="Payee" value={referral.payee} />
              <InfoRow label="Amount" value={`${formatUnits(amountUnits, escrowTokenDecimals)} testnet token units`} />
              <InfoRow label="Condition" value={referral.condition} />
              <InfoRow label="Status" value={status} />
            </dl>
          </section>

          <section className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">Agent settlement proposal</p>
            <h2 className="mt-2 text-2xl font-black text-gray-950">Agent proposes escrow settlement</h2>
            <p className="mt-3 text-sm leading-6 text-gray-700">
              Pay {referral.amount} testnet tokens to the matched referrer because the condition is marked as:
              <span className="font-black"> {referral.condition}</span>.
            </p>
            <p className="mt-3 rounded-xl bg-white p-4 text-sm leading-6 text-gray-700">{referral.context}</p>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-500">Wallet approval required</p>
              <h2 className="mt-1 text-xl font-black text-gray-950">Human approval controls every on-chain action.</h2>
              <p className="mt-2 text-sm text-gray-600">The agent proposes. The user clicks. MetaMask asks for explicit approval.</p>
            </div>
            {isConnected ? (
              <button onClick={() => disconnect()} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-50">
                Disconnect {address?.slice(0, 6)}...{address?.slice(-4)}
              </button>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isConnecting}
                className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:bg-gray-400"
              >
                {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
              </button>
            )}
          </div>

          {missingConfig && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              Missing NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS or NEXT_PUBLIC_ESCROW_TOKEN_ADDRESS.
            </div>
          )}

          {isWrongChain && (
            <button
              onClick={() => switchChain({ chainId: mantleSepolia.id })}
              disabled={isSwitching}
              className="mt-5 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:bg-orange-300"
            >
              {isSwitching ? 'Switching...' : 'Switch to Mantle Sepolia'}
            </button>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={deposit}
              disabled={!isConnected || isWrongChain || missingConfig || isWriting || status !== 'proposed'}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
            >
              Approve in wallet: deposit
            </button>
            <button
              onClick={release}
              disabled={!isConnected || isWrongChain || missingConfig || isWriting || status !== 'deposited'}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-200"
            >
              Approve in wallet: release
            </button>
            <button
              onClick={refund}
              disabled={!isConnected || isWrongChain || missingConfig || isWriting || status !== 'deposited'}
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
              Approve in wallet: refund
            </button>
          </div>

          {(isWriting || isConfirming) && <p className="mt-4 text-sm font-bold text-orange-700">Waiting for wallet or Mantle Sepolia confirmation...</p>}
          {isConfirmed && txUrl && (
            <p className="mt-4 break-all rounded-xl bg-green-50 p-4 text-sm font-bold text-green-800">
              Confirmed tx: <a href={txUrl} target="_blank" rel="noreferrer" className="underline">{lastHash}</a>
            </p>
          )}
          {actionError && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{actionError}</p>}
        </section>
      </section>
    </main>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">{label}</dt>
      <dd className="mt-1 break-all font-semibold text-gray-900">{value}</dd>
    </div>
  )
}
