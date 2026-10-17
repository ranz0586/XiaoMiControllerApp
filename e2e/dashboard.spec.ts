import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/devices', route => route.fulfill({ json: [] }));
});
test('demo controls work and never call device APIs', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) calls.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your air, at a glance.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sleep', exact: true }).click();
  await expect(page.getByText('Quieter airflow for a restful room.')).toBeVisible();
  await page.getByRole('switch', { name: 'Child lock' }).click();
  await expect(page.getByRole('switch', { name: 'Child lock' })).toBeChecked();
  await page.getByRole('button', { name: 'Turn purifier off' }).click();
  await expect(page.getByRole('button', { name: 'Turn purifier on' })).toBeVisible();
  await page.getByRole('button', { name: /Bedroom Purifying/ }).click();
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeVisible();
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(url => new URL(url).pathname === '/api/devices')).toBe(true);
});

test('saved purifier loads automatically on startup and reload', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/devices') return route.fulfill({ json: [{ id: 'saved', name: 'Saved purifier', ip: '192.168.0.14', model: 'zhimi.airpurifier.ma2' }] });
    if (path.endsWith('/history')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { power: true, aqi: 41, temperature: 25.6, humidity: 62,
      mode: 'auto', timestamp: new Date().toISOString(), capabilities: [] } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Saved purifier' })).toBeVisible();
  await expect(page.getByText('Local workspace', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeEnabled();
  await expect(page.getByText('Demo workspace', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved purifier' })).toBeVisible();
});

test('startup connection failure shows an error rather than sample readings', async ({ page }) => {
  await page.route('**/api/devices', route => route.fulfill({ status: 503, json: { detail: 'Backend unavailable' } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Backend unavailable');
  await expect(page.getByText('Demo workspace', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Living room' })).toHaveCount(0);
});

test('offline startup retains saved readings and disables controls', async ({ page }) => {
  const saved = { power: true, aqi: 27, mode: 'auto', timestamp: '2026-10-04T10:00:00Z', capabilities: [], modes: ['auto', 'silent', 'favorite'] };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/devices') return route.fulfill({ json: [{ id: 'saved', name: 'Offline purifier', ip: '192.168.1.10', model: 'zhimi.airpurifier.ma2' }] });
    if (path.endsWith('/history')) return route.fulfill({ json: [saved] });
    return route.fulfill({ status: 502, json: { detail: 'Purifier did not respond' } });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Showing the last successful reading');
  await expect(page.locator('.air-number')).toHaveText('27');
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeDisabled();
  await expect(page.getByText('Demo workspace', { exact: true })).toHaveCount(0);
});

test('polling stops when hidden and reconnects when visible', async ({ page }) => {
  let polls = 0;
  const reading = { power: true, aqi: 12, mode: 'auto', timestamp: new Date().toISOString(), capabilities: [], modes: ['auto', 'silent', 'favorite'] };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/devices') return route.fulfill({ json: [{ id: 'saved', name: 'Saved purifier', ip: '192.168.1.10', model: 'zhimi.airpurifier.ma2' }] });
    if (path.endsWith('/history')) return route.fulfill({ json: [] });
    polls++;
    return route.fulfill({ json: reading });
  });
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeDisabled();
  const before = polls;
  await page.clock.fastForward(30000);
  expect(polls).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => polls).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeEnabled();
});

test('live setup, controls, and removal use backend API', async ({ page }) => {
  let devices: unknown[] = [];
  const reading = { power: true, aqi: 18, temperature: 23, humidity: 50, filter_life_remaining: 60,
    filter_hours_used: 300, motor_speed: 500, mode: 'auto', favorite_level: 5, child_lock: false,
    buzzer: true, timestamp: new Date().toISOString(), capabilities: ['favorite_level', 'child_lock', 'buzzer'], modes: ['auto', 'silent', 'favorite'] };
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/models') return route.fulfill({ json: [{ model: 'zhimi.airpurifier.mb3', protocol: 'miot' }] });
    if (path === '/api/devices' && request.method() === 'POST') {
      const body = request.postDataJSON(); expect(body.token).toBe('a'.repeat(32));
      devices = [{ id: 'live-one', name: body.name, ip: body.ip, model: body.model }];
      return route.fulfill({ status: 201, json: devices[0] });
    }
    if (path === '/api/devices') return route.fulfill({ json: devices });
    if (path.endsWith('/commands')) {
      const body = request.postDataJSON(); Object.assign(reading, { [body.action]: body.value });
      return route.fulfill({ json: reading });
    }
    if (request.method() === 'DELETE') { devices = []; return route.fulfill({ status: 204 }); }
    if (path.endsWith('/history')) return route.fulfill({ json: [reading] });
    return route.fulfill({ json: reading });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Connect my devices' }).click();
  await page.getByRole('button', { name: 'Add your first purifier' }).click();
  await page.getByLabel('Room or device name').fill('Office');
  await page.getByLabel('Local IPv4 address').fill('192.168.1.10');
  await page.getByLabel('miIO token').fill('a'.repeat(32));
  await page.getByRole('button', { name: 'Add device', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Office' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeEnabled();
  await page.getByRole('button', { name: 'Turn purifier off' }).click();
  await expect(page.getByRole('button', { name: 'Turn purifier on' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove device', exact: true }).click();
  await page.locator('.remove-confirm').getByRole('button', { name: 'Remove device' }).click();
  await expect(page.getByRole('button', { name: 'Add your first purifier' })).toBeVisible();
});

test('fan slider automatically applies final value and displays device readback', async ({ page }) => {
  const commands: number[] = [];
  const reading = { power: true, aqi: 18, mode: 'favorite', favorite_level: 5,
    timestamp: new Date().toISOString(), capabilities: ['favorite_level'], modes: ['auto', 'silent', 'favorite'] };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/devices') return route.fulfill({ json: [{ id: 'saved', name: 'Office', ip: '192.168.1.10', model: 'zhimi.airpurifier.ma2' }] });
    if (path.endsWith('/history')) return route.fulfill({ json: [] });
    if (path.endsWith('/commands')) {
      const body = route.request().postDataJSON();
      expect(body.action).toBe('favorite_level');
      commands.push(body.value);
      if (body.value === 14) return route.fulfill({ status: 502, json: { detail: 'Purifier did not respond' } });
      reading.favorite_level = commands.length === 1 ? 5 : body.value;
    }
    return route.fulfill({ json: reading });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'App sections' }).getByRole('button', { name: 'Controls', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Favorite fan level' });
  await expect(slider).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Apply level' })).toHaveCount(0);
  await slider.fill('7');
  await slider.fill('9');
  expect(commands).toEqual([]);
  await slider.dispatchEvent('pointerup', { pointerType: 'touch' });
  await expect(slider).toHaveValue('5');
  expect(commands).toEqual([9]);
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('6');
  await expect.poll(() => commands.length).toBe(2);
  await slider.blur();
  expect(commands).toEqual([9, 6]);
  await slider.focus();
  await slider.press('End');
  await expect(page.getByRole('alert').first()).toContainText('Purifier did not respond');
  await expect(slider).toHaveValue('6');
  await expect(slider).toBeDisabled();
  expect(commands).toEqual([9, 6, 14]);
});

test('filter reset requires confirmation and uses readback with unsupported/error guards', async ({ page }) => {
  let resets = 0;
  const reading = { power: true, aqi: 18, mode: 'auto', filter_life_remaining: 20, filter_hours_used: 600,
    timestamp: new Date().toISOString(), capabilities: ['reset_filter'], modes: ['auto', 'silent', 'favorite'] };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/devices') return route.fulfill({ json: [{ id: 'saved', name: 'Office', ip: '192.168.1.10', model: 'zhimi.airpurifier.ma2' }] });
    if (path.endsWith('/history')) return route.fulfill({ json: [] });
    if (path.endsWith('/commands')) {
      expect(route.request().postDataJSON()).toEqual({ action: 'reset_filter', value: true });
      if (++resets > 1) return route.fulfill({ status: 502, json: { detail: 'The purifier rejected this command.' } });
      reading.filter_life_remaining = 93; reading.filter_hours_used = 2;
    }
    return route.fulfill({ json: reading });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const deviceView = async () => page.getByRole('navigation', { name: 'App sections' }).getByRole('button', { name: 'Device', exact: true }).click();
  await deviceView();
  const filter = page.locator('.filter-panel');
  await filter.getByRole('button', { name: 'Reset filter', exact: true }).click();
  await expect(filter.getByRole('alert')).toContainText('Only reset after replacing the filter');
  await filter.getByRole('button', { name: 'Confirm filter reset' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-filter-reset.png' });
  expect(resets).toBe(0);
  await filter.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(filter.getByRole('button', { name: 'Confirm filter reset' })).toHaveCount(0);
  expect(resets).toBe(0);
  await filter.getByRole('button', { name: 'Reset filter', exact: true }).click();
  await filter.getByRole('button', { name: 'Confirm filter reset' }).click();
  await expect(filter.getByText('2 hours used', { exact: true })).toBeVisible();
  await expect(filter.locator('.filter-ring')).toContainText('93');
  expect(resets).toBe(1);
  await filter.getByRole('button', { name: 'Reset filter', exact: true }).click();
  await filter.getByRole('button', { name: 'Confirm filter reset' }).click();
  await expect(page.getByRole('alert').first()).toContainText('The purifier rejected this command.');
  await expect(filter.getByText('2 hours used', { exact: true })).toBeVisible();
  await expect(filter.getByRole('button', { name: 'Reset filter', exact: true })).toBeDisabled();
  reading.capabilities = [];
  await page.reload(); await deviceView();
  await expect(filter.getByRole('button', { name: 'Reset filter', exact: true })).toBeDisabled();
  await expect(filter.getByText('Filter reset is unavailable on this model.')).toBeVisible();
});

test('mobile dashboard fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Air quality', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('phone views separate content and keep text readable', async ({ page }) => {
  await page.route('**/api/models', route => route.fulfill({ json: [{ model: 'zhimi.airpurifier.mb3', protocol: 'miot' }] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'App sections' });
  await expect(page.locator('.air-panel')).toBeVisible();
  await expect(page.locator('.controls')).toBeHidden();
  await expect(page.locator('.history')).toBeHidden();
  await expect(page.locator('.filter-panel')).toBeHidden();
  await navigation.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(page.locator('.air-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Sleep', exact: true }).click();
  await expect(page.getByText('Quieter airflow for a restful room.')).toBeVisible();
  expect(await page.locator('.mode-buttons button span').last().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: 'test-results/mobile-controls.png', fullPage: true });
  await navigation.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.history')).toBeVisible();
  await expect(page.locator('.controls')).toBeHidden();
  await page.screenshot({ path: 'test-results/mobile-history.png', fullPage: true });
  await navigation.getByRole('button', { name: 'Device', exact: true }).click();
  await expect(page.locator('.filter-panel')).toBeVisible();
  await expect(page.locator('.history')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add a purifier', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-device.png', fullPage: true });
  await navigation.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'test-results/mobile-small.png', fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await navigation.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(page.locator('.controls')).toBeVisible();
  await expect(page.locator('.history')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
  await page.setViewportSize({ width: 390, height: 844 });
  await navigation.getByRole('button', { name: 'Device', exact: true }).click();
  await page.getByRole('button', { name: 'Add a purifier', exact: true }).click();
  await expect(page.getByLabel('Room or device name')).toBeVisible();
  expect(await page.getByLabel('Room or device name').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await navigation.getByRole('button', { name: 'Overview', exact: true }).click();
});

test('desktop overview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Air quality over time' })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});

test('phone content scrolls above navigation and selector focus clears its label', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '24px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px');
  });
  const navigation = page.getByRole('navigation', { name: 'App sections' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const section of ['Overview', 'Controls']) {
      await navigation.getByRole('button', { name: section, exact: true }).click();
      expect(await page.locator('main').evaluate(el => el.scrollTop)).toBe(0);
      const main = (await page.locator('main').boundingBox())!;
      const nav = (await navigation.boundingBox())!;
      expect(main.y + main.height).toBeLessThanOrEqual(nav.y + 1);
      const target = section === 'Overview' ? page.getByRole('button', { name: 'Turn purifier off' }) : page.getByRole('switch', { name: 'Notification sounds' });
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
      expect(await target.evaluate(el => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
      if (viewport.width === 390) await page.screenshot({ path: `test-results/mobile-clear-${section.toLowerCase()}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await navigation.getByRole('button', { name: 'Overview', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Selected purifier' });
  await select.focus();
  expect(await select.evaluate(el => {
    const labelText = document.createRange();
    labelText.selectNode(el.parentElement!.firstChild!);
    const style = getComputedStyle(el);
    const outlineTop = el.getBoundingClientRect().top - parseFloat(style.outlineWidth) - parseFloat(style.outlineOffset);
    return outlineTop >= labelText.getBoundingClientRect().bottom;
  })).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-selector-focus.png' });
});

test('network discovery adds verified purifier without exposing credentials', async ({ page }) => {
  let saved = false;
  const device = { id: 'new-purifier', name: 'Office', ip: '192.168.0.14', model: 'zhimi.airpurifier.ma2' };
  const reading = { power: true, aqi: 12, mode: 'auto', timestamp: new Date().toISOString(), capabilities: [], modes: ['auto', 'silent', 'favorite'] };
  await page.route('**/api/**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/devices') return route.fulfill({ json: saved ? [device] : [] });
    if (path === '/api/discovery') return route.fulfill({ json: saved ? [] : [{ ...device, id: 'candidate', name: 'Xiaomi purifier' }] });
    if (path === '/api/discovery/candidate') {
      expect(request.postDataJSON()).toEqual({ name: 'Office' });
      saved = true; return route.fulfill({ status: 201, json: device });
    }
    if (path.endsWith('/history')) return route.fulfill({ json: [] });
    return route.fulfill({ json: reading });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'App sections' });
  await navigation.getByRole('button', { name: 'Device', exact: true }).click();
  await page.getByRole('button', { name: 'Scan network', exact: true }).click();
  await expect(page.getByText('192.168.0.14 · Token verified')).toBeVisible();
  await page.getByLabel('Name for 192.168.0.14').fill('Office');
  await page.screenshot({ path: 'test-results/mobile-discovery.png', fullPage: true });
  await page.getByRole('button', { name: 'Add purifier', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Office', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn purifier off' })).toBeEnabled();
  await navigation.getByRole('button', { name: 'Device', exact: true }).click();
  await page.getByRole('button', { name: 'Scan network', exact: true }).click();
  await expect(page.getByText('No new purifiers with a valid token found.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add purifier', exact: true })).toHaveCount(0);
});

test('failed discovery shows error and offers no addable results', async ({ page }) => {
  await page.route('**/api/discovery', route => route.fulfill({ status: 502, json: { detail: 'Network discovery failed' } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'App sections' }).getByRole('button', { name: 'Device', exact: true }).click();
  await page.getByRole('button', { name: 'Scan network', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Network discovery failed');
  await expect(page.getByRole('button', { name: 'Add purifier', exact: true })).toHaveCount(0);
});
