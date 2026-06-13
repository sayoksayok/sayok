export type LeadStatus = 'found' | 'contact_found' | 'email_found' | 'outreach_ready' | 'sent'

export type ContactEmailStatus = 'found' | 'verified' | 'guessed' | 'not_found'

export type LeadDiscoveryInput = {
  websiteUrl: string
  targetMarket: string
  goal: string
  maxLeads?: number
  sessionId?: string
  senderProfile?: string
  outreachTemplate?: string
  capturedEmail?: string
  marketingConsent?: boolean
  apiKeys?: {
    braveSearchApiKey?: string
    firecrawlApiKey?: string
    hunterApiKey?: string
    anthropicApiKey?: string
    apolloApiKey?: string
  }
}

export type WebsiteAnalysis = {
  product: string
  targetAudience: string
  positioning: string
  businessModel: string
  searchQueries: string[]
}

export type Lead = {
  id: string
  organizationName: string
  organizationWebsite: string
  category: string
  country: string
  reasonForFit: string
  sourceUrl: string
  confidence: number
  status: LeadStatus
}

export type Contact = {
  id: string
  leadId: string
  name: string
  title: string
  email: string
  emailStatus: ContactEmailStatus
  linkedinUrl: string
  sourceUrl: string
  confidence: number
}

export type OutreachMessage = {
  leadId: string
  contactId: string
  subject: string
  email: string
  linkedin: string
  whatsapp: string
  followUp: string
}

export type LeadDiscoveryResult = {
  id: string
  createdAt: string
  input: LeadDiscoveryInput
  analysis: WebsiteAnalysis
  leads: Lead[]
  contacts: Contact[]
  outreach: OutreachMessage[]
  integrationStatus: {
    firecrawl: string
    brave: string
    hunter: string
    apollo: string
    llm: string
  }
  warnings: string[]
}

export type ApiSetupError = {
  error: string
  missing: string[]
  required: string[]
  optional: string[]
  instructions: string[]
}

export type LeadDiscoveryConfig = {
  ready: boolean
  missing: string[]
  required: string[]
  optional: string[]
  configured: string[]
  instructions: string[]
}
