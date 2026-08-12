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
    const title = searchParams.get('title') || 'Agents need a second opinion.';
    const subtitle = searchParams.get('subtitle') || 'Three agents debate the thesis. Proof lands before capital moves.';

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
            background: 'linear-gradient(125deg, #02030a 0%, #061a44 66%, #0052ff 100%)',
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
                        background: '#3978ff',
                        boxShadow: '0 0 14px #3978ff',
                      },
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: {
                        color: '#8fb6ff',
                        fontSize: '14px',
                        letterSpacing: '4px',
                        textTransform: 'uppercase' as const,
                      },
                      children: 'BOBBY PROTOCOL · ADVERSARIAL DECISION LAYER',
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
                  color: 'rgba(235,240,252,0.68)',
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
                        { type: 'span', props: { style: { color: '#8fb6ff', fontSize: '16px' }, children: 'ON-CHAIN' } },
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
                        { type: 'span', props: { style: { color: '#8fb6ff', fontSize: '16px' }, children: 'ADVERSARIAL' } },
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
                        { type: 'span', props: { style: { color: '#8fb6ff', fontSize: '16px' }, children: 'VERIFIABLE' } },
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
