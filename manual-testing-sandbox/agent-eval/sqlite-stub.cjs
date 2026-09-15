const Module = require("module");
const original = Module._load;

// A no-op DB so DevDataSqliteDb's usage-logging calls (exercised now that
// the eval goes through the real BaseLLM.streamChat -> _logEnd, not just a
// hand-rolled fetch) don't crash the harness for lacking a real sqlite3
// native binding in this headless context. The eval doesn't care about
// token-usage history, so swallowing these calls is safe.
const fakeDb = {
  async run() {},
  async all() {
    return [];
  },
  async exec() {},
};

Module._load = function (request, ...rest) {
  if (request === "sqlite3") return {};
  if (request === "sqlite") return { open: async () => fakeDb };
  return original.call(this, request, ...rest);
};
