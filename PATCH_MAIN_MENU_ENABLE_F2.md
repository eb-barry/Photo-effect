# F2 水晶球 v0.1.1 - Main Menu Activation Patch

## Purpose

This patch turns on **F2 水晶球** in the main menu so it is no longer greyed out and becomes clickable.

The previous F2 implementation added the feature module, but the home menu/feature registry was still likely marking F2 as planned or disabled.

## Required change

Find the existing F2 item in your feature registry or home menu file. It is usually in one of these files:

- `js/config/features.js`
- `js/config/featureRegistry.js`
- `js/home/homeFeatures.js`
- `js/home/home.js`
- `js/app.js`

Look for something similar to:

```js
{
  id: 'F2_crystalBall',
  title: '水晶球',
  status: 'planned',
  disabled: true
}
```

Replace the F2 item with this enabled version:

```js
{
  id: 'F2_crystalBall',
  order: 2,
  code: 'F2',
  title: '水晶球',
  name: '水晶球',
  subtitle: '玻璃折射・夢幻放大',
  description: '建立水晶球、折射、放大與柔光照片效果。',
  icon: 'assets/icons/features/F2-水晶球.webp',
  route: '#/feature/F2_crystalBall',
  status: 'enabled',
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: '0.1.1'
}
```

## Router check

Make sure your router can open the page when the F2 menu card is clicked.

If your router uses dynamic imports, add this case:

```js
case 'F2_crystalBall': {
  const { initCrystalBallPage } = await import('./features/F2_crystalBall/crystalPage.js');
  return initCrystalBallPage(root, shared);
}
```

If your router uses a registry object, add this entry:

```js
F2_crystalBall: () => import('./features/F2_crystalBall/crystalPage.js')
```

Then call:

```js
module.initCrystalBallPage(root, shared);
```

## CSS check

If F2 is still grey after enabling the object, check whether the home card has one of these classes:

- `disabled`
- `is-disabled`
- `planned`
- `coming-soon`

The F2 card should not receive those classes when `enabled: true` or `disabled: false`.

## Icon note

The icon path follows the project rule:

```text
assets/icons/features/F2-水晶球.webp
```

If this icon file does not exist yet, either add it later or temporarily reuse a neutral feature icon. Missing icon should not disable the feature.
