const Module = require("module");
const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === "sqlite3") return {};
  return original.call(this, request, ...rest);
};
