'use strict';
const { spawn } = require('child_process');

function queryQuotaOnce(executable, start, config) {
  return new Promise((resolve, reject) => {
    let child, buffer = '', finished = false, initialized = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (child) child.kill();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Codex quota request timed out')), 15000);
    try {
      child = start(executable, ['-c', config, 'app-server'],
        { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      child.on('error', () => finish(new Error('Unable to start Codex quota query')));
      child.on('close', () => {
        const error = new Error('Codex quota query exited early');
        if (!initialized) error.code = 'STARTUP_FAILED';
        finish(error);
      });
      child.stdin.on('error', () => finish(new Error('Codex quota query input failed')));
      child.stdout.on('error', () => finish(new Error('Codex quota query output failed')));
      const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        if (buffer.length > 1048576) return finish(new Error('Codex quota response too large'));
        let n;
        while ((n = buffer.indexOf('\n')) !== -1 && !finished) {
          const line = buffer.slice(0, n); buffer = buffer.slice(n + 1);
          let message;
          try { message = JSON.parse(line); } catch { return finish(new Error('Invalid Codex response')); }
          if (message.id === 1) {
            if (message.error) return finish(new Error('Codex initialization failed'));
            initialized = true;
            send({ method: 'initialized' });
            send({ id: 2, method: 'account/rateLimits/read' });
          } else if (message.id === 2) {
            if (message.error) return finish(new Error('Codex quota request failed'));
            const limits = message.result?.rateLimits;
            const buckets = [];
            for (const [field, mins, window, label] of [['secondary', 10080, 'week', '每週'], ['primary', 300, '5h', '五小時']]) {
              const b = limits?.[field];
              if (!b || b.windowDurationMins !== mins || typeof b.usedPercent !== 'number' || !Number.isFinite(b.usedPercent) || b.usedPercent < 0 || b.usedPercent > 100) continue;
              const reset = typeof b.resetsAt === 'number' && Number.isFinite(b.resetsAt) && b.resetsAt > 0
                ? new Date(b.resetsAt * 1000).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) + ' 重置' : '';
              buckets.push({ window, label, remaining: Math.round(100 - b.usedPercent), used: b.usedPercent, reset });
            }
            if (!buckets.length) return finish(new Error('Codex quota unavailable'));
            finish(null, [{ name: '週額度 / 五小額度', plan: 'unknown', buckets }]);
          }
        }
      });
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'hermes_quota_hud', version: '1.0' } } });
    } catch { finish(new Error('Unable to start Codex quota query')); }
  });
}
async function queryQuota(executable, start = spawn) {
  try {
    return await queryQuotaOnce(executable, start, 'mcp_servers.hybrid2.enabled=false');
  } catch (error) {
    if (error.code !== 'STARTUP_FAILED') throw error;
    // A missing hybrid2 entry needs a complete disabled server configuration.
    return queryQuotaOnce(executable, start, 'mcp_servers.hybrid2={command="__disabled__",enabled=false}');
  }
}
function createQuotaPoller(query) {
  let state = { quota: [], quotaStatus: 'unavailable', quotaUpdated: '' };
  let next = 0, failures = 0;
  return {
    async refresh(now = Date.now()) {
      if (now < next) return state;
      try {
        const quota = await query();
        state = { quota, quotaStatus: 'fresh', quotaUpdated: new Date(now).toLocaleTimeString() };
        failures = 0;
        next = now + 60000;
      } catch {
        failures++;
        state = { ...state, quotaStatus: state.quota.length ? 'stale' : 'unavailable' };
        next = now + Math.min(300000, 60000 * (2 ** Math.min(failures, 3)));
      }
      return state;
    },
  };
}
module.exports = { queryQuota, createQuotaPoller };
