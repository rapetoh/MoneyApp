// Server-only entry. Anything that touches Node-only APIs (`node:vm`,
// `fs`, etc.) lives behind this subpath so React Native bundlers never
// pull it into the mobile graph. The mobile client uses
// `@voice-expense/ai`; the Next.js API routes use
// `@voice-expense/ai/server`.

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
