import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'SayOK Leads - find real people to contact, with verified public emails'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0F2A6B',
          padding: '72px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: '#1B49C4',
              display: 'flex',
            }}
          />
          <div style={{ color: '#fff', fontSize: 30, fontWeight: 700 }}>
            SayOK <span style={{ color: '#9DB6FF' }}>Leads</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              color: '#fff',
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.08,
              maxWidth: 980,
            }}
          >
            Paste a URL. Get real people to contact - outreach already written.
          </div>
          <div style={{ color: '#C9DBFF', fontSize: 28, marginTop: 28, maxWidth: 900 }}>
            Public sources only | Verified before shown | No fake leads
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              background: '#15994E',
              color: '#fff',
              fontSize: 22,
              fontWeight: 600,
              padding: '8px 18px',
              borderRadius: 999,
              display: 'flex',
            }}
          >
            sayok.chat/new-deal
          </div>
          <div style={{ color: '#7E97D6', fontSize: 22 }}>
            A Kakehashi product - your bridge to Japan
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
