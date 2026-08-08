export function register(platform) {
  platform.registerWidget?.({
    type: 'auth-register',
    stableType: true,
    label: 'Форма регистрации',
    category: 'system',
  })
}
