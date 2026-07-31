// ruleid: proso.focused-or-skipped-test
test.skip('masked regression', () => {});

// ruleid: proso.focused-or-skipped-test
// biome-ignore lint/suspicious/noFocusedTests: OpenGrep positive fixture.
describe.only('focused suite', () => {});
