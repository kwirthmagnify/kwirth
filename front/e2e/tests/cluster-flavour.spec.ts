import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs } from './helpers'

/*
    The cluster's distribution and whether a Rancher manages it (S1 of the suse-stack).

    It goes through the UI, not the API, on purpose: '/config/cluster' needs authentication, and what
    matters here is what the user ends up SEEING. That also covers the front's own half -- the switch that
    turns a flavour into an icon and a label, which is where a 'case' for a value nothing produces went
    unnoticed for as long as it was a free-form string.

    ⚠️ The details live inside a <Collapse unmountOnExit>, so until the card is expanded they are not
    merely invisible: they are NOT IN THE DOM. A negative assertion written without expanding first passes
    for the wrong reason -- it finds nothing because nothing is there yet -- which is exactly how the first
    version of this spec went green while checking nothing at all.

    Detecting RKE2 or Harvester cannot be set up in an e2e -- that needs those clusters -- and is covered
    by the 'back/tests/model/ClusterInfo.test.ts' harness against their documented clues.

    NON-destructive: it is all reads.
*/

/** Opens the cluster card and waits for its details, so nothing is asserted against an empty DOM. */
const abrirDetalles = async (page: Page) => {
    await login(page)
    await dismissOpenDialogs(page)
    await page.locator('button[aria-label="expandir/colapsar"]').first().click()
    // The guard that makes the negative assertions meaningful: the panel really is open.
    await expect(page.getByText('Cluster details')).toBeVisible()
    await expect(page.getByText('Cluster Info')).toBeVisible()
}

test('la home publica la distribucion del cluster', async ({ page }) => {
    await abrirDetalles(page)
    await expect(page.getByText('Flavour:')).toBeVisible()
})

test('el dev corre sobre k3d, y se dice con su nombre', async ({ page }) => {
    // Asserts the VALUE, not that the label is there: a flavour that stopped being detected would fall to
    // the generic 'Kubernetes' of the default branch, and a test checking only for presence stays green.
    await abrirDetalles(page)
    await expect(page.getByText('K3D', { exact: true })).toBeVisible()
})

test('🔴 un k3s pelado NO se anuncia como gestionado por Rancher', async ({ page }) => {
    /*
        k3s ships k3s.cattle.io and helm.cattle.io of its own, so detecting Rancher by the 'cattle.io'
        domain would report one on every k3s in existence. The dev cluster is exactly that case -- k3d
        with those CRDs and no Rancher anywhere -- so this is the test that catches such a regression.
    */
    await abrirDetalles(page)
    await expect(page.getByText('Managed by:')).toHaveCount(0)
})
