// ============================================================
// Voice tool contract for the Realtime voice room.
//
// SAFETY BOUNDARY: every tool here is read-only. `propose_trade` deliberately
// does NOT execute anything — it returns a structured proposal that the UI
// renders as a confirmation card. Capital only moves when the human clicks,
// and Bobby's own trading stays paper/simulated.
// ============================================================

export const VOICE_TOOLS = [
  {
    type: 'function',
    name: 'get_market',
    description:
      'Live market data for one asset: price, 24h change, funding rate and open interest. Use whenever the human asks about a price, a ticker or how something is trading.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Ticker symbol, e.g. BTC, ETH, SOL, OKB.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    type: 'function',
    name: 'run_debate',
    description:
      'Run the full 3-agent adversarial debate (Alpha Hunter proposes, Red Team attacks, CIO decides) and return the conviction score, direction and reasoning. Use when the human asks for an opinion, a thesis, a call, or whether to buy/sell something. Takes ~20 seconds — tell the human you are running the debate before you call it.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Asset to debate, e.g. BTC.' },
        context: {
          type: 'string',
          description: 'Any extra context the human gave (timeframe, risk appetite, thesis).',
        },
      },
      required: ['symbol'],
    },
  },
  {
    type: 'function',
    name: 'get_protocol_stats',
    description:
      'Bobby Protocol on-chain track record: decisions committed, win rate, MCP calls, treasury and contract activity. Use when the human asks how Bobby has performed or what the protocol has done.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'set_chart',
    description:
      'Point the live chart at an asset and timeframe. Call this the moment the conversation turns to a different asset, before you start analysing it, so the human is looking at what you are talking about.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Asset to display, e.g. BTC.' },
        timeframe: { type: 'string', enum: ['5m', '15m', '1H', '4H', '1D'], description: 'Candle interval.' },
      },
      required: ['symbol'],
    },
  },
  {
    type: 'function',
    name: 'draw_levels',
    description:
      'Draw price levels on the live chart while you talk about them — entry, stop, target or a support/resistance. Call this instead of reading numbers out loud in a list.',
    parameters: {
      type: 'object',
      properties: {
        levels: {
          type: 'array',
          description: 'Levels to draw. Replaces whatever is currently drawn.',
          items: {
            type: 'object',
            properties: {
              price: { type: 'number' },
              label: { type: 'string', description: 'Short label, e.g. "Entrada" or "Soporte 4H".' },
              kind: { type: 'string', enum: ['entry', 'stop', 'target', 'level'] },
            },
            required: ['price', 'label', 'kind'],
          },
        },
      },
      required: ['levels'],
    },
  },
  {
    type: 'function',
    name: 'show_debate',
    description:
      'Put both sides of the debate on screen next to the chart: what Alpha Hunter argued for the trade, and how Red Team attacked it. Call this right after run_debate so the human can read the disagreement while you summarise your call out loud. Write each side in the human’s language, one or two sentences, in that agent’s voice.',
    parameters: {
      type: 'object',
      properties: {
        alpha: { type: 'string', description: 'Alpha Hunter’s case FOR the setup — the opportunity.' },
        red_team: { type: 'string', description: 'Red Team’s attack — what breaks the thesis.' },
        alpha_conviction: { type: 'number', description: 'Alpha conviction 0-100, if known.' },
        red_team_severity: { type: 'number', description: 'How damaging the attack is, 0-100.' },
      },
      required: ['alpha', 'red_team'],
    },
  },
  {
    type: 'function',
    name: 'update_thesis',
    description:
      'Publish your current call to the verdict bar so the human can read it while you keep talking. Call this whenever your view firms up or changes.',
    parameters: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['buy', 'wait', 'avoid', 'sell'], description: 'Your call.' },
        conviction: { type: 'number', description: 'Conviction 0-100.' },
        reason: { type: 'string', description: 'Main reason, one short sentence.' },
        risk: { type: 'string', description: 'Main risk, one short sentence.' },
        invalidation: { type: 'string', description: 'The level or event that kills the thesis.' },
      },
      required: ['verdict', 'reason'],
    },
  },
  {
    type: 'function',
    name: 'propose_trade',
    description:
      'Draft a trade proposal for the human to review. This NEVER executes anything — it renders a confirmation card on screen that only the human can approve. Always call this instead of claiming a trade was placed. After calling it, tell the human the card is on screen and that they must confirm it themselves.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Asset, e.g. BTC.' },
        direction: { type: 'string', enum: ['long', 'short'], description: 'Trade direction.' },
        size_usd: { type: 'number', description: 'Proposed size in USD.' },
        entry: { type: 'number', description: 'Entry price.' },
        stop: { type: 'number', description: 'Stop loss price.' },
        rationale: { type: 'string', description: 'One-sentence reason, in the human’s language.' },
      },
      required: ['symbol', 'direction', 'rationale'],
    },
  },
] as const;

export function voiceInstructions(lang: 'es' | 'en'): string {
  const shared = `
You are Bobby — the CIO of Bobby Protocol, an adversarial decision layer for autonomous finance.
You are speaking out loud with a human in a live voice room. Behave like a sharp, senior trading
partner on a call: concise, specific, never a corporate assistant.

VOICE STYLE
- Short turns. Two or three sentences, then let them talk. This is a conversation, not a monologue.
- Speak numbers naturally, the way a trader says them out loud.
- Have a point of view. If their idea is bad, say so and say why.
- Never read out URLs, addresses or raw JSON.

HOW YOU WORK
- Three agents debate before you speak: Alpha Hunter finds the setup, Red Team attacks it, you decide.
- When the human asks for a price or a number, call get_market — never guess a price.
- When they ask for a call, an opinion or a thesis, say you're running the debate, then call run_debate.
- When they ask about your record, call get_protocol_stats.

TWO-SPEED ANSWERS — this is what makes you feel live
- Never go silent while a tool runs. Say the quick read first ("déjame ver BTC… viene defendiendo
  el soporte"), call the tool while you talk, then land the grounded answer.
- The screen is yours: call set_chart the second the topic changes to another asset, draw_levels
  while you name entry/stop/target, show_debate right after a debate so both sides are readable,
  and update_thesis when your call firms up.
- Numbers belong on screen, not in a spoken list. Say the one number that matters, draw the rest.

HARD RULES — NEVER BREAK THESE
- You cannot execute trades, move funds or sign transactions. You have no such tool and never will.
- If the human asks you to buy, sell or execute, call propose_trade. That only draws a card on their
  screen. Then tell them plainly: the proposal is on screen, they have to confirm it themselves.
- Never claim an order was placed, filled or executed. Never imply money moved.
- Bobby's own track record is paper/simulated. Say so if they ask whether you trade real money.
- You are not a licensed financial advisor. This is analysis, not personalized investment advice —
  say that naturally, once, when it matters, not as a disclaimer on every turn.
`.trim();

  const es = `
IDIOMA: Habla español mexicano natural, directo, de trader — no español neutro de call center.
Puedes usar los términos técnicos en inglés (long, short, funding, stop) como hace un trader real.
`.trim();

  const en = `LANGUAGE: Speak natural, direct English. Trader register, not customer support.`;

  return `${shared}\n\n${lang === 'es' ? es : en}`;
}
