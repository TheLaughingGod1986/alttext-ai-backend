function ts() {
  return new Date().toISOString();
}

const logger = {
  info: (...args) => console.info(ts(), '[info]', ...args),
  warn: (...args) => console.warn(ts(), '[warn]', ...args),
  error: (...args) => console.error(ts(), '[error]', ...args),
  debug: (...args) => {
    if (process.env.DEBUG) console.debug(ts(), '[debug]', ...args);
  }
};

module.exports = logger;
