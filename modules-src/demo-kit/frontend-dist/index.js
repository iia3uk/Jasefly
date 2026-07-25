/**
 * Prebuilt stub for package install tests without a frontend build step.
 * Source: frontend/src/index.ts
 */
export const JaseflyFrontendModule = {
  name: 'demo-kit',
  label: 'Demo Kit',
  adminNav: [
    {
      group: 'Разработка',
      path: '/admin/demo-kit',
      label: 'Demo Kit',
      permission: 'demo-kit.view',
      icon: 'package',
    },
  ],
  adminScreens: [
    {
      path: 'demo-kit',
      label: 'Demo Kit',
      group: 'Разработка',
    },
  ],
}

export default JaseflyFrontendModule
