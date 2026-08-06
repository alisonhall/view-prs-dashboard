const { createPrStatusDisplayHelpers } = require("./pr-status-display.helpers.js");

describe("pr status display helpers", () => {
  const {
    isChangedStatus,
    statusClass,
    approvedClass,
    statusIcon,
    formatTitleWithIcons,
    formatChkDisplay,
  } = createPrStatusDisplayHelpers();

  test("isChangedStatus and statusClass map status values", () => {
    expect(isChangedStatus("CHANGED")).toBe(true);
    expect(isChangedStatus("changed recently")).toBe(true);
    expect(isChangedStatus("NO_CHANGE")).toBe(false);

    expect(statusClass("CHANGED")).toBe("status-changed");
    expect(statusClass("NO_CHANGE")).toBe("status-no-change");
    expect(statusClass("NO_ACTIVITY")).toBe("status-no-activity");
    expect(statusClass("UNKNOWN")).toBe("");
  });

  test("approvedClass maps approved values", () => {
    expect(approvedClass("YES")).toBe("approved-yes");
    expect(approvedClass("NO")).toBe("approved-no");
    expect(approvedClass("MAYBE")).toBe("");
  });

  test("statusIcon maps CHK states and defaults", () => {
    expect(statusIcon("CHK", "PASS")).toBe("✅");
    expect(statusIcon("CHK", "FAIL")).toBe("❌");
    expect(statusIcon("CHK", "RUN")).toBe("⏳");
    expect(statusIcon("CHK", "SKIP")).toBe("⏭️");
    expect(statusIcon("CHK", "NA")).toBe("⚪");
    expect(statusIcon("CHK", "UNKNOWN")).toBe("❔");
    expect(statusIcon("OTHER", "PASS")).toBe("❔");
  });

  test("title and chk formatters normalize display output", () => {
    expect(formatTitleWithIcons("My title [CHK:PASS] [MRG:YES]", "fallback")).toBe(
      "My title",
    );
    expect(formatTitleWithIcons("", "Fallback title [CHK:FAIL]")).toBe(
      "Fallback title",
    );

    expect(formatChkDisplay("Feature [CHK:pass]")).toBe("✅ PASS");
    expect(formatChkDisplay("Feature without marker")).toBe("-");
  });
});
