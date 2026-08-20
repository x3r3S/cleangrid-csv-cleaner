import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const requiredMappings = [
  { target: "company", source: "Company Name", label: "Company" },
  { target: "email", source: "E-mail", label: "Email" }
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

test("project links and mapping names remain available on desktop and mobile", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Turn an awkward CSV into a clean import." })).toBeVisible();
    await expect(page.locator("#mapping-state")).toContainText("5/5 mapped · ready");
    await expect(page.getByRole("button", { name: "Export 3 ready rows" })).toBeVisible();

    for (const [target, name] of Object.entries(mappingNames)) {
      await expect(page.locator(`#map-${target}`)).toHaveAccessibleName(`Source column for ${name}`);
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
