import { expect, test } from '@playwright/test'

test('app loads login without crashing', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('La app se trabo')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /Centro Jurídico NOA/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
  await expect(page.locator('input[type="email"]')).toBeVisible()
})

test('authenticated app loads casos without crashing', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'E2E credentials are required')

  await page.goto('/')
  await page.fill('input[type="email"]', process.env.E2E_EMAIL!)
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD!)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/casos')

  await expect(page.getByText('La app se trabo')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Casos' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Nuevo Caso/i })).toBeVisible()
})

test('authenticated finance routes load without crashing', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'E2E credentials are required')

  await page.goto('/')
  await page.fill('input[type="email"]', process.env.E2E_EMAIL!)
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD!)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/casos')

  await page.goto('/ingresos')
  await page.waitForURL(url => /\/(ingresos|casos)$/.test(url.toString()))
  await page.waitForLoadState('networkidle')
  if (await page.getByRole('heading', { name: 'Casos' }).isVisible()) {
    await expect(page.getByText('La app se trabo')).toHaveCount(0)
    return
  }

  await expect(page.getByText('La app se trabo')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ingresos' })).toBeVisible()
  await expect(page.getByText(/Pipeline de cobranzas por casos/i)).toBeVisible()

  await page.goto('/flujo-caja')
  await page.waitForURL(url => /\/(flujo-caja|casos)$/.test(url.toString()))
  await page.waitForLoadState('networkidle')
  if (await page.getByRole('heading', { name: 'Casos' }).isVisible()) {
    await expect(page.getByText('La app se trabo')).toHaveCount(0)
    return
  }

  await expect(page.getByText('La app se trabo')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Flujo de caja' })).toBeVisible()
  await expect(page.getByText(/Conexión real entre casos y caja/i)).toBeVisible()
})

test('admin dashboard root loads without crashing', async ({ page }) => {
  test.skip(!process.env.E2E_DASHBOARD_EMAIL || !process.env.E2E_DASHBOARD_PASSWORD, 'Dashboard E2E credentials are required')

  await page.goto('/')
  await page.fill('input[type="email"]', process.env.E2E_DASHBOARD_EMAIL!)
  await page.fill('input[type="password"]', process.env.E2E_DASHBOARD_PASSWORD!)
  await page.click('button[type="submit"]')

  await expect(page.getByRole('heading', { name: /Centro Jurídico NOA/i })).toHaveCount(0)

  await page.goto('/')

  await expect(page.getByText('La app se trabo')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Panel de Control' })).toBeVisible({ timeout: 15000 })
})