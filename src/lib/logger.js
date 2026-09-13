const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const c = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

export const logger = {
  info: (...a) => console.log(`${c.gray}${ts()}${c.reset} ${c.blue}INFO${c.reset}`, ...a),
  ok: (...a) => console.log(`${c.gray}${ts()}${c.reset} ${c.green} OK ${c.reset}`, ...a),
  warn: (...a) => console.warn(`${c.gray}${ts()}${c.reset} ${c.yellow}WARN${c.reset}`, ...a),
  error: (...a) => console.error(`${c.gray}${ts()}${c.reset} ${c.red}ERR ${c.reset}`, ...a),
  setup: (...a) => console.log(`${c.gray}${ts()}${c.reset} ${c.magenta}SETUP${c.reset}`, ...a),
};
