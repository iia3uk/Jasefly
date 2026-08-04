import type { JourneyItem } from '@/builder/widgets/journey'

/** Главная хронология /about — секция «Опыт». */
export const ABOUT_EXPERIENCE = {
  title: 'Опыт',
  subtitle: 'Четыре направления, которые формируют текущую практику.',
  path_title: '',
  growth_title: '',
  footer: '',
  path_items: [
    {
      period: '2016 — н.в.',
      title: 'Web Developer',
      category: 'Веб',
      description:
        'Сайты на готовых CMS — WordPress и October CMS / Laravel — для знакомых; иногда небольшие платные заказы. Собственные платформы тогда не писал.',
      tags: 'WordPress, Laravel, October CMS, PHP, HTML/CSS, JavaScript, MySQL',
    },
    {
      period: '2019 — н.в.',
      title: 'Электромонтёр 4 разряда · промышленная автоматизация',
      category: 'Работа · промышленная автоматизация',
      description:
        'Основная должность — электромонтёр 4 разряда на промышленном предприятии. Разработка и сопровождение автоматизации — дополнительная оплачиваемая производственная нагрузка.',
      details: [
        'монтаж и демонтаж электрооборудования',
        'обслуживание и диагностика оборудования',
        'сборка силовых щитов',
        'сборка распределительных щитов',
        'сборка щитов управления',
        'программирование контроллеров',
        'сопровождение и доработка логики автоматизации',
        'доработка системы под разные типы оборудования',
        'подключение и настройка датчиков',
        'интеграция контроллеров со SCADA',
        'поддержка локальной базы данных и архива',
        'участие во вводе оборудования в эксплуатацию',
        'локальный контур ≈15 контроллеров ОВЕН СПК110 на общей базе',
        'аналоговые датчики и уровнемеры 4–20 mA',
        'герконовые и другие дискретные датчики',
        'Simple SCADA и архив на одном локальном ПК; связь через OPC',
      ].join('\n'),
      tags: [
        'CODESYS 3.5',
        'Structured Text',
        'CFC',
        'ОВЕН СПК110',
        'МВ210-101',
        'МУ210-401',
        'МВ210-202',
        'Simple SCADA',
        'OPC',
        'XAMPP',
        'MySQL',
        '4–20 mA',
        'дискретные датчики',
      ].join(', '),
      featured: true,
    },
    {
      period: '2022 — н.в.',
      title: 'Game Designer / Indie Developer',
      category: 'Игры',
      description:
        'От кастомных карт к полноценным движкам. Значительная часть идей 2022 года оставалась на уровне концептов и бумажных набросков без доведённых игровых систем.',
      milestones: [
        '2021 — Source 2 / Dota 2 custom maps',
        '2022 — Unreal Engine',
        '2025 — Unity',
        '2026 — Godot',
      ].join('\n'),
      tags: 'Dota 2, Source 2, Unreal Engine, Unity, Godot, Game design',
    },
    {
      period: '2026 — н.в.',
      title: 'Собственные продукты и R&D',
      category: 'Продукты',
      description:
        'Переход от сборки на готовых CMS к собственным системам, архитектуре и продуктам с нуля. AI/MCP-first workflow, жёстче к архитектуре и ops.',
      details_layout: 'grid',
      /** Сетка + теги стека подтягиваются из /projects (кроме project_status=cancelled). */
      autofill_from_projects: true,
      featured: true,
    },
  ] satisfies JourneyItem[],
  growth_items: [] as JourneyItem[],
}

/** Компактная секция «Образование» на /about. */
export const ABOUT_EDUCATION = {
  title: 'Образование',
  subtitle: '',
  path_title: '',
  growth_title: '',
  footer: '',
  path_items: [
    {
      period: '2005–2014',
      title: 'Основное общее образование',
      category: 'Образование',
      description: 'Общеобразовательная школа, 9 классов.',
      compact: true,
    },
    {
      period: '2014–2017',
      title: 'Профессионально-техническое образование',
      category: 'Профессиональное образование',
      description: 'Электромонтёр по ремонту и обслуживанию электрооборудования.',
      compact: true,
    },
    {
      period: '2017–2018',
      title: 'Военная служба',
      category: 'Служба',
      description: 'Срочная военная служба.',
      compact: true,
    },
  ] satisfies JourneyItem[],
  growth_items: [] as JourneyItem[],
}

/** Defaults для виджета journey-timeline в палитре билдера. */
export const ABOUT_JOURNEY = {
  ...ABOUT_EXPERIENCE,
  title: 'Опыт',
  subtitle: 'Хронология направлений — периоды, детали, теги и вложенные этапы.',
}
