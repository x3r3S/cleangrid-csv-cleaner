import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const requiredMappings = [
  { target: "company", source: "Company Name", label: "Company" },
  { target: "email", source: "E-mail", label: "Email" }
];

const optionalMappings = [
  { target: "contact", source: "Full Name", label: "Contact" },
  { target: "phone", source: "Mobile", label: "Phone" },
  { target: "country", source: "Market", label: "Country" }
];

const mappingNames = {
  company: "Company",
  contact: "Contact",
  email: "Email",
  phone: "Phone",
  country: "Country"
};

const projectLinks = [
  { name: "Source", href: "https://github.com/x3r3S/cleangrid-csv-cleaner" },
  { name: "CI", href: "https://github.com/x3r3S/cleangrid-csv-cleaner/actions" }
];

function contrastRatio(foreground, background) {
  const luminance = (value) => {
    const channels = value.match(/[\d.]+/g).slice(0, 3).map((channel) => Number(channel) / 255);
    const linear = channels.map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("required mappings pause classification and recover after remapping", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#schema-summary")).toContainText("Schema: 5/5 mapped");
  await expect(page.locator("#metric-ready")).toHaveText("3");
  await expect(page.getByRole("button", { name: "Export 3 ready rows" })).toBeEnabled();
  await expect(page.locator("#records-body tr")).toHaveCount(8);

  for (const mapping of requiredMappings) {
    const select = page.locator(`[data-map-target="${mapping.target}"]`);
    await select.selectOption("");

    await expect(page.locator("#mapping-state")).toContainText(`4/5 mapped · ${mapping.label} required`);
    await expect(page.locator("#schema-summary")).toContainText(`map ${mapping.label} to classify rows`);
    await expect(page.getByRole("button", { name: "Complete mapping to export" })).toBeDisabled();
    await expect(page.locator("#metric-total")).toHaveText("8");
    await expect(page.locator("#metric-ready")).toHaveText("0");
    await expect(page.locator("#records-body tr")).toHaveCount(0);
    await expect(page.locator("#empty-state")).toContainText("Complete the required mapping");

    if (mapping.target === "company") {
      await expect(page.locator("#audit-list")).toContainText("MAPPING REQUIRED");
      await expect(page.locator("#audit-list")).not.toContainText("RULES APPLIED");

      const auditDownloadStarted = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download audit JSON" }).click();
      const auditDownload = await auditDownloadStarted;
      const audit = JSON.parse(await readFile(await auditDownload.path(), "utf8"));

      expect(audit.classification).toBe("pending");
      expect(audit.missingRequired).toEqual(["company"]);
      expect(audit.summary).toEqual({ total: 8, ready: null, review: null, rejected: null });
      expect(audit.events.map(({ event }) => event)).toEqual(["FILE_PARSED", "MAPPING_REQUIRED"]);
      expect(audit.events[0].detail).toContain("8 rows");
    }

    await select.selectOption(mapping.source);
    await expect(page.locator("#mapping-state")).toContainText("5/5 mapped · ready");
    await expect(page.locator("#metric-ready")).toHaveText("3");
    await expect(page.getByRole("button", { name: "Export 3 ready rows" })).toBeEnabled();
    await expect(page.locator("#records-body tr")).toHaveCount(8);
  }
});

test("duplicate source mapping fails closed and recovers at wide and mobile sizes", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const company = page.locator('[data-map-target="company"]');
    const email = page.locator('[data-map-target="email"]');
    await company.selectOption("E-mail");

    const warning = page.getByRole("alert");
    await expect(warning).toContainText("E-mail");
    await expect(warning).toContainText("Company + Email");
    await expect(company).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#mapping-state")).toContainText("mapping conflict");
    await expect(page.locator("#schema-summary")).toContainText("resolve duplicate source mapping");
    await expect(page.locator("#metric-total")).toHaveText("8");
    await expect(page.locator("#metric-ready")).toHaveText("0");
    await expect(page.locator("#metric-review")).toHaveText("0");
    await expect(page.locator("#metric-rejected")).toHaveText("0");
    await expect(page.locator("#records-body tr")).toHaveCount(0);
    await expect(page.locator("#empty-state")).toContainText("Resolve the duplicate source mapping");
    await expect(page.getByRole("button", { name: "Resolve mapping conflict to export" })).toBeDisabled();
    await expect(page.locator("#audit-list")).toContainText("MAPPING CONFLICT");
    await expect(page.locator("#audit-list")).not.toContainText("RULES APPLIED");

    const auditDownloadStarted = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download audit JSON" }).click();
    const auditDownload = await auditDownloadStarted;
    const audit = JSON.parse(await readFile(await auditDownload.path(), "utf8"));

    expect(audit.classification).toBe("blocked");
    expect(audit.missingRequired).toEqual([]);
    expect(audit.duplicateSources).toEqual([
      { source: "E-mail", targets: ["company", "email"] }
    ]);
    expect(audit.summary).toEqual({ total: 8, ready: null, review: null, rejected: null });
    expect(audit.events.map(({ event }) => event)).toEqual(["FILE_PARSED", "MAPPING_CONFLICT"]);

    await company.selectOption("Company Name");
    await expect(warning).toBeHidden();
    await expect(company).not.toHaveAttribute("aria-invalid", "true");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#mapping-state")).toHaveText("5/5 mapped · ready");
    await expect(page.locator("#metric-ready")).toHaveText("3");
    await expect(page.locator("#metric-review")).toHaveText("2");
    await expect(page.locator("#metric-rejected")).toHaveText("3");
    await expect(page.getByRole("button", { name: "Export 3 ready rows" })).toBeEnabled();
    await expect(page.locator("#records-body tr")).toHaveCount(8);
    await expect(page.locator("#audit-list")).not.toContainText("MAPPING CONFLICT");
  }
});

test("ready export matches the visible queue and excludes the placeholder phone", async ({ page }) => {
  await page.goto("/");

  const downloadStarted = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export 3 ready rows" }).click();
  const download = await downloadStarted;
  const csv = await readFile(await download.path(), "utf8");

  expect(csv.trim().split("\n")).toHaveLength(4);
  expect(csv).toContain("Nordlicht Studio GMBH");
  expect(csv).not.toContain("Bright Mile LLC");
  await expect(page.getByRole("status").filter({ hasText: "Ready rows downloaded locally." })).toBeVisible();
});

test("optional mapping gaps stay exportable, name the skipped field, and restore cleanly", async ({ page }) => {
  await page.goto("/");

  for (const mapping of optionalMappings) {
    const select = page.locator(`[data-map-target="${mapping.target}"]`);
    await select.selectOption("");

    await expect(page.locator("#mapping-state")).toContainText(`4/5 mapped · ready · optional ${mapping.label} skipped`);
    await expect(page.locator("#schema-summary")).toContainText(`optional ${mapping.label} skipped`);
    await expect(page.locator("#rail-schema-status")).toContainText(`optional ${mapping.label} skipped`);
    await expect(page.locator("#progress-map-state")).toContainText(`${mapping.label} optional`);
    await expect(page.locator("#audit-list")).toContainText("OPTIONAL FIELDS SKIPPED");
    await expect(page.locator("#audit-list")).toContainText(`${mapping.label} is not mapped`);
    await expect(page.getByRole("button", { name: /^Export \d+ ready rows?$/ })).toBeEnabled();
    await expect(page.locator("#records-body tr")).toHaveCount(8);

    if (mapping.target === "phone") {
      await expect(page.locator("#schema-summary")).toContainText("phone normalization and E.164-shape checks not run");
      await expect(page.locator("#schema-summary")).not.toContainText("email and E.164-shape checks");
      await expect(page.locator("#audit-list")).toContainText("phone normalization and E.164-shape checks not run");

      const auditDownloadStarted = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download audit JSON" }).click();
      const auditDownload = await auditDownloadStarted;
      const audit = JSON.parse(await readFile(await auditDownload.path(), "utf8"));

      expect(audit.classification).toBe("complete");
      expect(audit.skippedOptional).toEqual(["phone"]);
      expect(audit.summary).toEqual({ total: 8, ready: 5, review: 0, rejected: 3 });
      expect(audit.events.map(({ event }) => event)).toEqual([
        "FILE_PARSED",
        "OPTIONAL_FIELDS_SKIPPED",
        "RULES_APPLIED",
        "DEDUPE_COMPLETED",
        "EXPORT_READY"
      ]);
      expect(audit.events.find(({ event }) => event === "RULES_APPLIED").detail).toContain("phone normalization and E.164-shape checks not run");
    }

    await select.selectOption(mapping.source);
    await expect(page.locator("#mapping-state")).toHaveText("5/5 mapped · ready");
    await expect(page.locator("#schema-summary")).toHaveText("Schema: 5/5 mapped · email and E.164-shape checks");
    await expect(page.locator("#audit-list")).not.toContainText("OPTIONAL FIELDS SKIPPED");
    await expect(page.locator("#metric-ready")).toHaveText("3");
    await expect(page.locator("#metric-review")).toHaveText("2");
    await expect(page.locator("#metric-rejected")).toHaveText("3");
    await expect(page.getByRole("button", { name: "Export 3 ready rows" })).toBeEnabled();
  }
});

test("keyboard file picking and table guidance stay discoverable at wide and mobile sizes", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900, key: "Enter" }, { width: 390, height: 844, key: "Space" }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");

    const fileInput = page.getByLabel("Choose local CSV", { exact: true });
    await expect(fileInput).toHaveAttribute("type", "file");
    await expect(fileInput).not.toHaveAttribute("hidden", "");
    const inputBox = await fileInput.boundingBox();
    expect(inputBox?.width).toBeGreaterThan(100);
    expect(inputBox?.height).toBeGreaterThanOrEqual(40);

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    let reachedFileInput = false;
    for (let press = 0; press < 14; press += 1) {
      await page.keyboard.press("Tab");
      reachedFileInput = await fileInput.evaluate((element) => element === document.activeElement);
      if (reachedFileInput) break;
    }
    expect(reachedFileInput).toBe(true);
    await expect(page.locator(".file-picker:focus-within")).toHaveCount(1);

    const chooserStarted = page.waitForEvent("filechooser");
    await page.keyboard.press(viewport.key);
    await chooserStarted;

    const tableRegion = page.getByRole("region", { name: "Cleaned records table; scroll horizontally for Status and Rule result" });
    await expect(tableRegion).toHaveAttribute("aria-describedby", "table-scroll-hint");
    await expect(tableRegion.getByRole("columnheader", { name: "Status" })).toHaveCount(1);
    await expect(tableRegion.getByRole("columnheader", { name: "Rule result" })).toHaveCount(1);

    const sizes = await page.evaluate(() => ({
      intro: Number.parseFloat(getComputedStyle(document.querySelector(".page-heading p")).fontSize),
      mapping: Number.parseFloat(getComputedStyle(document.querySelector(".mapping-field select")).fontSize),
      table: Number.parseFloat(getComputedStyle(document.querySelector("#records-body td")).fontSize)
    }));
    expect(sizes.intro).toBeGreaterThanOrEqual(14);
    expect(sizes.mapping).toBeGreaterThanOrEqual(11);
    expect(sizes.table).toBeGreaterThanOrEqual(11);

    const colorPairs = await page.evaluate(() => {
      const pair = (foregroundSelector, backgroundSelector) => [
        getComputedStyle(document.querySelector(foregroundSelector)).color,
        getComputedStyle(document.querySelector(backgroundSelector)).backgroundColor
      ];
      return [
        pair("#schema-summary", ".metrics"),
        pair(".progress-steps li:first-child small", ".source-card"),
        pair(".mapping-field label", ".mapping-field")
      ];
    });
    for (const [foreground, background] of colorPairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    if (viewport.width === 390) {
      await expect(page.locator("#table-scroll-hint")).toBeVisible();
      await expect(page.locator("#table-scroll-hint")).toContainText("Swipe horizontally to see Status and Rule result");
      expect(await tableRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      await tableRegion.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => tableRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    } else {
      await expect(page.locator("#table-scroll-hint")).toBeHidden();
    }
  }
});

test("project links and mapping names remain available on desktop and mobile", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Turn an awkward CSV into a clean import." })).toBeVisible();
    await expect(page.locator("#mapping-state")).toContainText("5/5 mapped · ready");
    await expect(page.getByRole("button", { name: "Export 3 ready rows" })).toBeVisible();

    for (const [target, name] of Object.entries(mappingNames)) {
      const requirement = requiredMappings.some((mapping) => mapping.target === target) ? "required" : "optional";
      await expect(page.locator(`#map-${target}`)).toHaveAccessibleName(`Source column for ${name}, ${requirement} field`);
    }

    for (const projectLink of projectLinks) {
      const link = page.getByRole("link", { name: projectLink.name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", projectLink.href);
    }

    if (viewport.width === 390) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  }
});
