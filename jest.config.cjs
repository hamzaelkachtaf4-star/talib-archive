/** @type {import('jest').Config} */
module.exports = {
  setupFiles: ["<rootDir>/server/__tests__/setup.js"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/open-computer/",
  ],
};
