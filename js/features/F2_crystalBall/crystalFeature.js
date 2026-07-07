// F2 水晶球 - Feature entry metadata v0.1.1
// Purpose: expose a clear, enabled feature definition for the home menu/router.

import { initCrystalBallPage } from './crystalPage.js';

export const crystalBallFeature = {
  id: 'F2_crystalBall',
  order: 2,
  code: 'F2',
  title: '水晶球',
  name: '水晶球',
  subtitle: '玻璃折射・夢幻放大',
  description: '建立水晶球、折射、放大與柔光照片效果。',
  icon: 'assets/icons/features/F2-水晶球.webp',
  route: '#/feature/F2_crystalBall',
  modulePath: './features/F2_crystalBall/crystalPage.js',
  status: 'enabled',
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: '0.1.1',
  mount: initCrystalBallPage
};

export default crystalBallFeature;
