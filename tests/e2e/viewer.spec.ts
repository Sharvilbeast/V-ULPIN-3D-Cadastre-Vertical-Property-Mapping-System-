import { test, expect } from "@playwright/test";

test.describe("V-ULPIN 3D Digital Twin Viewer & Cadastre HUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the Cesium scene to finish initializing
    await page.waitForSelector(".cesium-host", { state: "attached" });
  });

  test("1. Initializes 3D Geospatial Scene & HUD Elements", async ({ page }) => {
    // Check page metadata & title
    await expect(page).toHaveTitle(/V-ULPIN/i);

    // Verify topbar brand and municipal context
    await expect(page.locator(".brand-title")).toContainText("V·ULPIN");
    await expect(page.locator(".topbar-context")).toContainText("PUNE");
    await expect(page.locator(".live-chip")).toContainText("DEMO LIVE");

    // Verify pilot inventory summary strip
    await expect(page.locator(".stat-strip")).toBeVisible();
    await expect(page.locator(".stat-strip")).toContainText("Vertical units");

    // Check Cesium canvas element presence
    const canvas = page.locator(".cesium-widget canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
  });

  test("2. Controls Layer Filtering, Floor Slicing, and Exploded View", async ({ page }) => {
    // 1. Property type toggles
    const residentialCheckbox = page.locator('input[aria-label="Show Residential"]');
    await expect(residentialCheckbox).toBeChecked();
    await residentialCheckbox.uncheck();
    await expect(residentialCheckbox).not.toBeChecked();
    await residentialCheckbox.check();
    await expect(residentialCheckbox).toBeChecked();

    // 2. Vertical section floor filter dropdown
    const floorSelect = page.locator('select[aria-label="Filter floor"]');
    await expect(floorSelect).toBeVisible();
    await floorSelect.selectOption({ label: "Basement -1" });
    await expect(floorSelect).toHaveValue("-1");

    await floorSelect.selectOption({ value: "all" });
    await expect(floorSelect).toHaveValue("all");

    // 3. Exploded view slider
    const explodeSlider = page.locator('input[aria-label="Explode building floors"]');
    await expect(explodeSlider).toBeVisible();
    await explodeSlider.fill("2.2");
    await expect(explodeSlider).toHaveValue("2.2");
  });

  test("3. Sub-surface Mode & Camera Presets", async ({ page }) => {
    // 1. Sub-surface checkbox
    const subsurfaceCheckbox = page.getByLabel("Sub-surface view");
    await expect(subsurfaceCheckbox).not.toBeChecked();
    await subsurfaceCheckbox.check();
    await expect(subsurfaceCheckbox).toBeChecked();

    // 2. Camera presets (Aerial, Street, Below)
    const aerialBtn = page.getByRole("button", { name: "Aerial" });
    const streetBtn = page.getByRole("button", { name: "Street" });
    const belowBtn = page.getByRole("button", { name: "Below" });

    await expect(aerialBtn).toBeVisible();
    await expect(streetBtn).toBeVisible();
    await expect(belowBtn).toBeVisible();

    await streetBtn.click();
    await expect(streetBtn).toHaveClass(/camera-preset-active/);

    await belowBtn.click();
    await expect(belowBtn).toHaveClass(/camera-preset-active/);
    // Clicking below automatically enables sub-surface
    await expect(subsurfaceCheckbox).toBeChecked();
  });

  test("4. Topology Audit Execution", async ({ page }) => {
    const auditBtn = page.locator("button.audit-trigger");
    await expect(auditBtn).toBeVisible();

    // Trigger topology collision audit
    await auditBtn.click();

    // Verify audit executes and status updates
    await expect(page.locator(".stat-strip")).toContainText(/READY|PASS|AUDITING/i);
  });

  test("5. Interactive Clash Upload Modal", async ({ page }) => {
    const clashModalTrigger = page.locator("button.footer-alert-link");
    await expect(clashModalTrigger).toBeVisible();
    await clashModalTrigger.click();

    // Verify modal dialog is open
    const modal = page.locator(".collision-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Check boundary overlap");

    // Close modal
    const closeBtn = modal.locator('button[aria-label="Close clash audit"]');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
