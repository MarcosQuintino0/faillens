module.exports = {
  e2e: {
    baseUrl: "http://localhost:9999",
    setupNodeEvents(on) {
      on("task", {
        fixtureTask() { return "preserved"; },
      });
    },
  },
};
