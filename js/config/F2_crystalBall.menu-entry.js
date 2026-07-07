// F2 水晶球 - Main menu activation entry v0.1.1
// Use this object to replace the existing grey/disabled F2 menu item.
// Keep visible UI text in Traditional Chinese.

export const F2_CRYSTAL_BALL_MENU_ENTRY = {
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
};

export default F2_CRYSTAL_BALL_MENU_ENTRY;
