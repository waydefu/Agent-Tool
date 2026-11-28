import { host } from '@hermes/plugin-sdk'

const ID = 'hermes-hud-context'
const allowed = new Set(['system_prompt', 'tool_definitions', 'rules', 'skills', 'mcp', 'subagent_definitions', 'memory', 'conversation'])
const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null

function state() {
  const session = host.state.focusedSessionId?.get()
  const owner = host.state.focusedSessionOwner?.get()
  const connection = host.state.connectionId?.get()
  const profile = host.state.profile?.get()
  return {
    session: typeof session === 'string' ? session : '',
    busy: !!host.state.busy?.get(),
    eligible: !!session && !!owner && !!connection && owner.connectionId === connection && owner.profile === profile
  }
}

export default {
  id: ID,
  name: 'Hermes HUD context bridge',
  description: 'Read-only context aggregates for the Hermes cache HUD',
  register(ctx) {
    const bridge = {
      state,
      async read() {
        const before = state()
        if (!before.eligible || before.busy) throw new Error('Context unavailable for this session')
        const result = await host.request('session.context_breakdown', { session_id: before.session })
        const after = state()
        if (!after.eligible || after.busy || after.session !== before.session) throw new Error('Session changed')
        if (!result || !Array.isArray(result.categories)) throw new Error('Invalid context response')
        const categories = result.categories.flatMap(item => {
          const tokens = count(item?.tokens)
          return allowed.has(item?.id) && tokens !== null ? [{ id: item.id, tokens }] : []
        })
        return {
          context_used: count(result.context_used),
          context_max: count(result.context_max),
          context_estimated: result.context_estimated !== false,
          context_source: ['provider_usage', 'provider_usage_plus_estimate', 'local_estimate'].includes(result.context_source) ? result.context_source : 'unknown',
          categories
        }
      }
    }
    window.__hermesHudContext = bridge
    ctx.onDispose(() => { if (window.__hermesHudContext === bridge) delete window.__hermesHudContext })
  }
}
