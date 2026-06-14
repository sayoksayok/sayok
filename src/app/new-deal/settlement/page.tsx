import { notFound } from 'next/navigation'
import { escrowDemoEnabled } from '@/lib/escrow-demo'
import SettlementDemoClient from './SettlementDemoClient'

export const metadata = {
  title: 'SayOK Settlement Demo - Mantle Sepolia only',
  description: 'Testnet-only outcome escrow demo for matched referrals. Not audited. No production funds.',
}

export default function SettlementDemoPage() {
  if (!escrowDemoEnabled) notFound()
  return <SettlementDemoClient />
}
