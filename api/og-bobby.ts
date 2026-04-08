// ============================================================
// GET /api/og-bobby — Dynamic OG Image for Bobby Agent Trader
// Used by Telegram link previews, Twitter cards, etc.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'Bobby Agent Trader';
    const subtitle = searchParams.get('subtitle') || 'Your AI Trading Room — 3 Agents Debate. You Decide.';

    return new ImageResponse(
      ({
        type: 'div',
        props: {
          style: {
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
            background: 'linear-gradient(135deg, #050505 0%, #0a1a0a 50%, #050505 100%)',
            fontFamily: 'monospace',
            padding: '80px',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: '#22c55e',
                        boxShadow: '0 0 10px #22c55e',
                      },
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: {
                        color: '#22c55e',
                        fontSize: '14px',
                        letterSpacing: '4px',
                        textTransform: 'uppercase' as const,
                      },
                      children: 'BUILT ON OKX X LAYER',
                    },
                  },
                ],
              },
            },
            {
              type: 'h1',
              props: {
                style: {
                  color: 'white',
                  fontSize: '72px',
                  fontWeight: 900,
                  lineHeight: 1.05,
                  margin: '0 0 16px 0',
                  letterSpacing: '-2px',
                },
                children: title,
              },
            },
            {
              type: 'p',
              props: {
                style: {
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '24px',
                  margin: '0 0 40px 0',
                  maxWidth: '800px',
                  lineHeight: 1.4,
                },
                children: subtitle,
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  gap: '24px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      },
                      children: [
                        { type: 'span', props: { style: { fontSize: '20px' }, children: '🟢' } },
                        { type: 'span', props: { style: { color: '#4ade80', fontSize: '16px' }, children: 'Alpha Hunter' } },
                      ],
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      },
                      children: [
                        { type: 'span', props: { style: { fontSize: '20px' }, children: '🔴' } },
                        { type: 'span', props: { style: { color: '#f87171', fontSize: '16px' }, children: 'Red Team' } },
                      ],
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      },
                      children: [
                        { type: 'span', props: { style: { fontSize: '20px' }, children: '🟡' } },
                        { type: 'span', props: { style: { color: '#fbbf24', fontSize: '16px' }, children: 'Bobby CIO' } },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      }) as any,
      { width: 1200, height: 630 }
    );
  } catch {
    return new Response('Error generating image', { status: 500 });
  }
}
