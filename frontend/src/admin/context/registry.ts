export type PreviewKind =
  | 'hero'
  | 'profile'
  | 'blogPost'
  | 'project'
  | 'crudItem'
  | 'homepageSection'
  | 'singleton'
  | 'theme'
  | 'list'
  | 'none'

export type AdminContextKey =
  | 'profile'
  | 'hero'
  | 'footer'
  | 'contact-info'
  | 'seo'
  | 'site-settings'
  | 'email-settings'
  | 'theme'
  | 'homepage'
  | 'homepage-sections'
  | 'blog'
  | 'projects'
  | 'experience'
  | 'education'
  | 'skills'
  | 'skill-categories'
  | 'services'
  | 'testimonials'
  | 'navigation'
  | 'statistics'
  | 'social-links'
  | 'media'
  | 'contact-messages'
  | 'trash'
  | 'activity'
  | 'system'
  | 'backup'
  | 'updates'
  | 'password'

export type AdminContext = {
  title: string
  what: string
  where: string
  publicPath: string | null
  previewKind: PreviewKind
  slugTemplate?: string
}

export const adminContext: Record<AdminContextKey, AdminContext> = {
  profile: {
    title: 'Профиль',
    what: 'Имя, должность, биография и фото автора портфолио.',
    where: 'Страница «О себе» (/about) и блок about на главной.',
    publicPath: '/about',
    previewKind: 'profile',
  },
  hero: {
    title: 'Hero-блок',
    what: 'Главный баннер: заголовок, подзаголовок и кнопки.',
    where: 'Верх главной страницы (/).',
    publicPath: '/',
    previewKind: 'hero',
  },
  footer: {
    title: 'Подвал',
    what: 'Копирайт, слоган и показ соцсетей в футере.',
    where: 'Низ всех публичных страниц.',
    publicPath: '/',
    previewKind: 'singleton',
  },
  'contact-info': {
    title: 'Контакты',
    what: 'Email, телефон, адрес и текст после отправки формы.',
    where: 'Страница контактов (/contact).',
    publicPath: '/contact',
    previewKind: 'singleton',
  },
  seo: {
    title: 'SEO',
    what: 'Title, description, Open Graph и аналитика.',
    where: 'Мета-теги всех страниц сайта.',
    publicPath: '/',
    previewKind: 'singleton',
  },
  'site-settings': {
    title: 'Настройки сайта',
    what: 'Название сайта, локаль, пагинация, режим обслуживания.',
    where: 'Глобальные настройки публичного сайта.',
    publicPath: '/',
    previewKind: 'singleton',
  },
  'email-settings': {
    title: 'Почта',
    what: 'Параметры отправки писем с формы контактов.',
    where: 'Только серверная отправка — на сайте не отображается.',
    publicPath: null,
    previewKind: 'none',
  },
  theme: {
    title: 'Шаблон сайта',
    what: 'Готовые шаблоны или свой HTML, CSS и JS для публичного сайта.',
    where: 'Внешний вид и дополнительная разметка всех публичных страниц.',
    publicPath: '/',
    previewKind: 'theme',
  },
  homepage: {
    title: 'Секции главной',
    what: 'Блоки контента на главной (about, projects, blog и др.).',
    where: 'Главная страница (/), по ключу секции.',
    publicPath: '/',
    previewKind: 'list',
  },
  'homepage-sections': {
    title: 'Секция главной',
    what: 'Заголовок, текст и CTA одной секции главной.',
    where: 'Главная страница (/).',
    publicPath: '/',
    previewKind: 'homepageSection',
  },
  blog: {
    title: 'Блог',
    what: 'Статьи блога: заголовок, обложка, текст, SEO.',
    where: 'Список /blog и страница поста /blog/:slug.',
    publicPath: '/blog',
    previewKind: 'blogPost',
    slugTemplate: '/blog/{slug}',
  },
  projects: {
    title: 'Проекты',
    what: 'Карточка проекта: описание, стек, ссылки, обложка.',
    where: 'Список /projects, деталь /projects/:slug и блок на главной.',
    publicPath: '/projects',
    previewKind: 'project',
    slugTemplate: '/projects/{slug}',
  },
  experience: {
    title: 'Опыт',
    what: 'Места работы и роли в карьере.',
    where: 'Страница «О себе» и блок опыта на главной.',
    publicPath: '/about',
    previewKind: 'crudItem',
  },
  education: {
    title: 'Образование',
    what: 'Учёба и квалификации.',
    where: 'Страница «О себе» (/about).',
    publicPath: '/about',
    previewKind: 'crudItem',
  },
  skills: {
    title: 'Навыки',
    what: 'Категории и навыки со шкалой владения.',
    where: 'Страница «О себе» и блок навыков на главной.',
    publicPath: '/about',
    previewKind: 'crudItem',
  },
  'skill-categories': {
    title: 'Категории навыков',
    what: 'Группы навыков.',
    where: 'Страница «О себе» и блок навыков на главной.',
    publicPath: '/about',
    previewKind: 'crudItem',
  },
  services: {
    title: 'Услуги',
    what: 'Предложения услуг и их описание.',
    where: 'Страница /services и блок на главной.',
    publicPath: '/services',
    previewKind: 'crudItem',
  },
  testimonials: {
    title: 'Отзывы',
    what: 'Отзывы клиентов.',
    where: 'Блок отзывов на главной (/).',
    publicPath: '/',
    previewKind: 'crudItem',
  },
  navigation: {
    title: 'Навигация',
    what: 'Пункты меню в шапке и футере.',
    where: 'Шапка и подвал всех страниц.',
    publicPath: '/',
    previewKind: 'crudItem',
  },
  statistics: {
    title: 'Статистика',
    what: 'Цифры и метрики в about-блоке.',
    where: 'Главная (about) и страница /about.',
    publicPath: '/about',
    previewKind: 'crudItem',
  },
  'social-links': {
    title: 'Соцсети',
    what: 'Ссылки на соцсети и профили.',
    where: 'Футер и блоки контактов (если включено).',
    publicPath: '/',
    previewKind: 'crudItem',
  },
  media: {
    title: 'Медиатека',
    what: 'Загрузка и управление файлами.',
    where: 'Не страница сайта — используется в карточках и обложках.',
    publicPath: null,
    previewKind: 'none',
  },
  'contact-messages': {
    title: 'Сообщения',
    what: 'Входящие заявки с формы контактов.',
    where: 'Не отображается на сайте — только в админке.',
    publicPath: null,
    previewKind: 'none',
  },
  trash: {
    title: 'Корзина',
    what: 'Удалённые элементы до окончательного удаления.',
    where: 'Служебный раздел, на сайте не виден.',
    publicPath: null,
    previewKind: 'none',
  },
  activity: {
    title: 'Журнал действий',
    what: 'Аудит действий администраторов.',
    where: 'Служебный раздел.',
    publicPath: null,
    previewKind: 'none',
  },
  system: {
    title: 'Состояние системы',
    what: 'Здоровье PHP, БД и хранилища.',
    where: 'Служебный раздел.',
    publicPath: null,
    previewKind: 'none',
  },
  backup: {
    title: 'Резервные копии',
    what: 'Экспорт данных CMS.',
    where: 'Служебный раздел.',
    publicPath: null,
    previewKind: 'none',
  },
  updates: {
    title: 'Обновление CMS',
    what: 'Установка ZIP-пакета обновления прямо из админки.',
    where: 'Служебный раздел.',
    publicPath: null,
    previewKind: 'none',
  },
  password: {
    title: 'Пароль',
    what: 'Смена пароля администратора.',
    where: 'Служебный раздел.',
    publicPath: null,
    previewKind: 'none',
  },
}

export function getContext(key: string): AdminContext {
  return adminContext[key as AdminContextKey] ?? {
    title: key,
    what: 'Контент этого раздела.',
    where: 'Публичный сайт.',
    publicPath: '/',
    previewKind: 'none',
  }
}

export function resolvePublicUrl(ctx: AdminContext, slug?: string | null, status?: string | null): { href: string | null; disabledReason?: string } {
  if (ctx.slugTemplate && slug) {
    if (status && status !== 'published') {
      return { href: null, disabledReason: 'publishFirst' }
    }
    return { href: ctx.slugTemplate.replace('{slug}', slug) }
  }
  return { href: ctx.publicPath }
}
