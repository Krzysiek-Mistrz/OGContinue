const Module = require("module");
const original = Module._load;

// no-op DB - no real sqlite3 binding here, eval doesn't care about usage logging anyway
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
