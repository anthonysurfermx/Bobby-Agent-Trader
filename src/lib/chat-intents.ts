// Bilingual intent parser for Claw Trader Chat (EN/ES)
// Extracts: amount, target return, risk level, search queries, market references

export type ChatIntentType = 'FIND_OPPORTUNITIES' | 'ANALYZE_MARKET' | 'SEARCH_MARKET' | 'HELP' | 'UNKNOWN'

export interface ChatIntent {
  type: ChatIntentType
  amount?: number
  targetReturn?: number
  risk?: 'low' | 'medium' | 'high'
  query?: string
  marketRef?: number
  raw: string
}

const HELP_WORDS = ['help', 'ayuda', 'como funciona', 'how does it work', 'que puedo hacer', 'what can i do']

const RISK_LOW = ['bajo', 'conservador', 'safe', 'low', 'seguro', 'poco riesgo']
const RISK_MED = ['medio', 'moderado', 'medium', 'moderate', 'normal']
const RISK_HIGH = ['alto', 'agresivo', 'high', 'aggressive', 'yolo', 'arriesgado', 'mucho riesgo']

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?¿!¡.,]/g, '')
    .trim()
}

function containsAny(text: string, words: string[]): boolean {
  return words.some(w => text.includes(w))
}

function extractAmount(text: string): number | undefined {
  // "mil" → 1000
  if (/\bmil\b/.test(text) && !/\bmiles\b/.test(text)) {
    const match = text.match(/(\d+)\s*mil/)
    if (match) return parseInt(match[1]) * 1000
    return 1000
  }
  // $1,000 or $1000 or 1000 usd or 1000 dollars or 1000 pesos
  const match = text.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:usd|usdc|dollars?|pesos|dlls?)?/i)
  if (match) {
    const val = parseFloat(match[1].replace(/,/g, ''))
    if (val > 0 && val < 10_000_000) return val
  }
  return undefined
}

function extractTargetReturn(text: string): number | undefined {
  // "ganar 5%", "earn 5%", "return 5%", "5% return", "5 porciento"
  const match = text.match(/(?:ganar|earn|return|rendimiento|profit|ganancia)?\s*(\d+(?:\.\d+)?)\s*%/)
    || text.match(/(\d+(?:\.\d+)?)\s*(?:porciento|percent|%)\s*(?:return|rendimiento|ganancia)?/)
  if (match) {
    const val = parseFloat(match[1])
    if (val > 0 && val < 1000) return val
  }
  return undefined
}

function extractRisk(text: string): 'low' | 'medium' | 'high' | undefined {
  if (containsAny(text, RISK_HIGH)) return 'high'
  if (containsAny(text, RISK_LOW)) return 'low'
  if (containsAny(text, RISK_MED)) return 'medium'
  return undefined
}

function extractMarketRef(text: string): number | undefined {
  // "#1", "el 1", "numero 1", "number 1", "the first", "el primero"
  const hashMatch = text.match(/#(\d+)/)
  if (hashMatch) return parseInt(hashMatch[1])

  const numMatch = text.match(/(?:numero|number|el|the)\s*(\d+)/i)
  if (numMatch) return parseInt(numMatch[1])

  if (/\b(primero|first|uno)\b/.test(text)) return 1
  if (/\b(segundo|second|dos)\b/.test(text)) return 2
  if (/\b(tercero|third|tres)\b/.test(text)) return 3

  return undefined
}

function extractQuery(text: string): string {
  const removeWords = [
    'busca', 'buscar', 'search', 'find', 'show', 'muestra', 'dame',
    'quiero', 'want', 'me', 'de', 'los', 'las', 'el', 'la', 'hey',
    'what', 'about', 'que', 'hay', 'como', 'esta', 'for', 'en',
    'sobre', 'the', 'mercados', 'markets', 'oportunidades', 'opportunities',
    'ver', 'see', 'analiza', 'analyze',
  ]
  let cleaned = text
  for (const w of removeWords) {
    cleaned = cleaned.replace(new RegExp(`\\b${w}\\b`, 'gi'), '')
  }
  return cleaned.replace(/\s+/g, ' ').trim()
}

export function parseChatIntent(rawText: string): ChatIntent {
  const text = normalize(rawText)

  // Help
  if (containsAny(text, HELP_WORDS)) {
    return { type: 'HELP', raw: rawText }
  }

  // Market reference ("#1", "el primero", "dime mas sobre el 2")
  const marketRef = extractMarketRef(text)
  if (marketRef && text.length < 30) {
    return { type: 'ANALYZE_MARKET', marketRef, raw: rawText }
  }

  // Has amount or target return → FIND_OPPORTUNITIES
  const amount = extractAmount(text)
  const targetReturn = extractTargetReturn(text)
  const risk = extractRisk(text)

  if (amount || targetReturn) {
    const query = extractQuery(text)
    return {
      type: 'FIND_OPPORTUNITIES',
      amount,
      targetReturn,
      risk: risk || 'medium',
      query: query.length > 1 ? query : undefined,
      raw: rawText,
    }
  }

  // Market ref with longer text (e.g. "dime más sobre el número 1")
  if (marketRef) {
    return { type: 'ANALYZE_MARKET', marketRef, raw: rawText }
  }

  // Default: treat as search
  const query = extractQuery(text)
  if (query.length > 1) {
    return { type: 'SEARCH_MARKET', query, risk, raw: rawText }
  }

  return { type: 'UNKNOWN', raw: rawText }
}
