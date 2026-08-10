// Server-only entry. Anything that touches Node-only APIs (`fs`, the
// OpenAI SDK's server usage, etc.) lives behind this subpath so React
// Native bundlers never pull it into the mobile graph. The mobile client
// uses `@voice-expense/ai`; the Next.js API routes use
// `@voice-expense/ai/server`. `askMurmurTools.ts` no longer touches
// `node:vm` (fix-plan 2.10 replaced the sandbox with a closed set of
// plain-function tools) but stays behind this boundary regardless — it's
// only ever consumed by the API route.

export {
  buildAskMurmurPrompt,
  validateAskMurmurResponse,
  validateAskMurmurResponseAgainstCalls,
} from './askMurmur'
export type { AskMurmurValidation } from './askMurmur'

export {
  TOOLS,
  resolveToolCall,
  trustedNumbersFromCalls,
  comparisonsFromCalls,
  buildSummarySnapshot,
  buildDataOverview,
} from './askMurmurTools'
export type {
  ToolContext,
  ToolCallRecord,
  AskMurmurDataOverview,
} from './askMurmurTools'
