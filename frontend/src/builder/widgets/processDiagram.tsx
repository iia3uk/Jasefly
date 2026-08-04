import { useId, useRef } from 'react'
import clsx from 'clsx'
import { useInView, useReducedMotion } from 'framer-motion'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import {
  nodesByRole,
  normalizeProcessDiagram,
  type ProcessNode,
} from '@/shared/processDiagram'

function fields(...items: SettingsField[]) {
  return items
}

function NodeCard({
  node,
  size = 'md',
}: {
  node: ProcessNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const primary = node.emphasis === 'primary' || node.role === 'core'
  return (
    <div
      className={clsx(
        'relative min-w-0 rounded-[calc(var(--radius)+2px)] border bg-[color:var(--background)]/80 backdrop-blur-sm',
        primary
          ? 'border-[color-mix(in_srgb,var(--primary)_45%,transparent)] shadow-[0_0_40px_-18px_var(--primary)]'
          : 'border-white/[0.1]',
        size === 'lg' ? 'px-5 py-5 sm:px-6 sm:py-6' : size === 'sm' ? 'px-3.5 py-3' : 'px-4 py-4',
      )}
    >
      <p
        className={clsx(
          'font-heading font-semibold tracking-[-0.02em]',
          size === 'lg' ? 'text-lg sm:text-xl' : 'text-sm sm:text-base',
        )}
      >
        {node.title}
      </p>
      {node.description ? (
        <p className={clsx('mt-1.5 text-[var(--muted)]', size === 'lg' ? 'text-sm leading-6' : 'text-xs leading-5')}>
          {node.description}
        </p>
      ) : null}
    </div>
  )
}

function VerticalArrow({ loop = false }: { loop?: boolean }) {
  return (
    <div className="flex flex-col items-center py-2 text-[var(--muted)]" aria-hidden>
      <span className="block h-6 w-px bg-[color-mix(in_srgb,var(--primary)_45%,transparent)]" />
      <span className="mt-0.5 text-[10px] leading-none opacity-70">{loop ? '↺' : '↓'}</span>
    </div>
  )
}

function DesktopFlow({
  inputs,
  cores,
  outputs,
  feedback,
  centerTitle,
  centerDescription,
  animate,
}: {
  inputs: ProcessNode[]
  cores: ProcessNode[]
  outputs: ProcessNode[]
  feedback: ProcessNode[]
  centerTitle: string
  centerDescription: string
  animate: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.35 })
  const active = animate && inView

  return (
    <div ref={ref} className="relative min-w-0 overflow-hidden rounded-[calc(var(--radius)+6px)] border border-white/[0.08] bg-white/[0.015] p-5 sm:p-8 lg:p-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(600px 280px at 50% 45%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%)',
        }}
        aria-hidden
      />

      {/* SVG connectors — schematic, not a timeline */}
      <svg
        className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full lg:block"
        viewBox="0 0 1000 420"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={`pd-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {/* input → core */}
        <path
          d="M 220 210 C 300 210, 340 210, 400 210"
          fill="none"
          stroke={`url(#pd-grad-${uid})`}
          strokeWidth="1.5"
          className={clsx(active && 'pd-path-draw')}
        />
        {/* core → contour */}
        <path
          d="M 600 210 C 660 210, 700 210, 780 210"
          fill="none"
          stroke={`url(#pd-grad-${uid})`}
          strokeWidth="1.5"
          className={clsx(active && 'pd-path-draw')}
          style={{ animationDelay: '0.35s' }}
        />
      </svg>

      <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,0.95fr)] lg:items-center lg:gap-8">
        <div className="space-y-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Вход</p>
          {inputs.map((n) => (
            <NodeCard key={n.id} node={n} />
          ))}
        </div>

        <div className="relative rounded-[calc(var(--radius)+8px)] border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] p-5 sm:p-7">
          <div
            className="pointer-events-none absolute -inset-px rounded-[calc(var(--radius)+8px)] opacity-60"
            style={{ boxShadow: 'inset 0 0 48px -20px var(--primary)' }}
            aria-hidden
          />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Ядро</p>
          <h3 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{centerTitle}</h3>
          {centerDescription ? (
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{centerDescription}</p>
          ) : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {cores.map((n) => (
              <NodeCard key={n.id} node={{ ...n, emphasis: 'primary' }} size="sm" />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Контур</p>
          {outputs.map((n) => (
            <NodeCard key={n.id} node={n} />
          ))}
          {feedback.map((n) => (
            <div key={n.id} className="relative">
              <NodeCard node={{ ...n, description: n.description || 'Цикл не заканчивается релизом' }} />
              <span className="absolute -right-1 -top-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]" aria-hidden>
                ↺
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MobileFlow({
  inputs,
  cores,
  outputs,
  feedback,
  centerTitle,
  centerDescription,
}: {
  inputs: ProcessNode[]
  cores: ProcessNode[]
  outputs: ProcessNode[]
  feedback: ProcessNode[]
  centerTitle: string
  centerDescription: string
}) {
  const stages: Array<{ key: string; node?: ProcessNode; center?: boolean; loop?: boolean }> = [
    ...inputs.map((n) => ({ key: n.id, node: n })),
    { key: 'center', center: true },
    ...outputs.map((n) => ({ key: n.id, node: n })),
    ...feedback.map((n) => ({ key: n.id, node: n, loop: true })),
  ]

  return (
    <ol className="mx-auto flex max-w-md flex-col items-stretch">
      {stages.map((stage, index) => (
        <li key={stage.key} className="flex flex-col items-stretch">
          {stage.center ? (
            <div className="rounded-[calc(var(--radius)+6px)] border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] p-5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Ядро</p>
              <h3 className="mt-2 font-heading text-xl font-semibold">{centerTitle}</h3>
              {centerDescription ? (
                <p className="mt-2 text-sm text-[var(--muted)]">{centerDescription}</p>
              ) : null}
              <div className="mt-4 space-y-2">
                {cores.map((c) => (
                  <NodeCard key={c.id} node={c} size="sm" />
                ))}
              </div>
            </div>
          ) : stage.node ? (
            <NodeCard node={stage.node} />
          ) : null}
          {index < stages.length - 1 ? <VerticalArrow /> : <VerticalArrow loop />}
        </li>
      ))}
    </ol>
  )
}

function ProcessDiagramRender({ settings }: { settings: Record<string, unknown> }) {
  const model = normalizeProcessDiagram(settings)
  const styles = stylesToCss(readStyles(settings))
  const reducedMotion = useReducedMotion()
  const inputs = nodesByRole(model.nodes, 'input')
  const cores = nodesByRole(model.nodes, 'core')
  const outputs = nodesByRole(model.nodes, 'output')
  const feedback = nodesByRole(model.nodes, 'feedback')
  const orphan = model.nodes.filter((n) => !n.role)
  const inputsAll = inputs.length ? inputs : orphan.slice(0, Math.ceil(orphan.length / 3))
  const coresAll = cores.length
    ? cores
    : orphan.slice(Math.ceil(orphan.length / 3), Math.ceil((2 * orphan.length) / 3))
  const outputsAll = outputs.length ? outputs : orphan.slice(Math.ceil((2 * orphan.length) / 3))
  const feedbackAll = feedback

  return (
    <div className="min-w-0" style={styles}>
      {(model.title || model.subtitle) ? (
        <div className="mb-8 max-w-2xl">
          {model.title ? (
            <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{model.title}</h2>
          ) : null}
          {model.subtitle ? <p className="mt-2 text-[var(--muted)]">{model.subtitle}</p> : null}
        </div>
      ) : null}

      {!model.nodes.length ? (
        <p className="text-sm text-[var(--muted)]">Добавьте этапы процесса</p>
      ) : (
        <>
          <div className="hidden lg:block">
            <DesktopFlow
              inputs={inputsAll}
              cores={coresAll}
              outputs={outputsAll}
              feedback={feedbackAll}
              centerTitle={model.centerTitle}
              centerDescription={model.centerDescription}
              animate={!reducedMotion}
            />
          </div>
          <div className="lg:hidden">
            <MobileFlow
              inputs={inputsAll}
              cores={coresAll}
              outputs={outputsAll}
              feedback={feedbackAll}
              centerTitle={model.centerTitle}
              centerDescription={model.centerDescription}
            />
          </div>
        </>
      )}
    </div>
  )
}

const DEFAULT_NODES = [
  { id: 'idea', title: 'Идея', description: 'Задача и ограничения.', role: 'input' },
  { id: 'prototype', title: 'Прототип', description: 'Быстрая проверка гипотезы.', role: 'input' },
  { id: 'architecture', title: 'Архитектура', description: 'Устойчивая структура.', role: 'core' },
  { id: 'automation', title: 'Автоматизация', description: 'Снятие рутины.', role: 'core' },
  { id: 'ops', title: 'Эксплуатация', description: 'Рабочий контур.', role: 'output' },
  { id: 'growth', title: 'Развитие', description: 'Итерации по факту использования.', role: 'feedback' },
]

const DEFAULT_CONNECTIONS = [
  { from: 'idea', to: 'prototype', type: 'direct' },
  { from: 'prototype', to: 'architecture', type: 'direct' },
  { from: 'architecture', to: 'automation', type: 'direct' },
  { from: 'automation', to: 'ops', type: 'direct' },
  { from: 'ops', to: 'growth', type: 'direct' },
  { from: 'growth', to: 'idea', type: 'feedback' },
]

export function registerProcessDiagramWidgets() {
  registerWidget({
    type: 'process-diagram',
    label: 'Схема процесса',
    category: 'landing',
    defaultSettings: {
      title: 'Как я работаю',
      subtitle: 'Путь от идеи до рабочего контура — и обратно в развитие.',
      center_title: 'Рабочая система',
      center_description: 'Архитектура и автоматизация сходятся в устойчивое ядро продукта.',
      nodes: DEFAULT_NODES,
      connections: DEFAULT_CONNECTIONS,
      mobile_mode: 'vertical',
    },
    settingsFields: fields(
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'center_title', label: 'Заголовок ядра', type: 'text' },
      { key: 'center_description', label: 'Описание ядра', type: 'textarea' },
      {
        key: 'nodes',
        label: 'Этапы',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Этап"
            blank={() => ({ id: '', title: '', description: '', role: 'input', emphasis: 'default' })}
            fields={[
              { key: 'id', label: 'ID', kind: 'text' },
              { key: 'title', label: 'Название', kind: 'text' },
              { key: 'description', label: 'Описание', kind: 'textarea' },
              { key: 'role', label: 'Роль (input|core|output|feedback)', kind: 'text' },
              { key: 'emphasis', label: 'Акцент (default|primary)', kind: 'text' },
            ]}
          />
        ),
      },
      {
        key: 'connections',
        label: 'Связи',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Связь"
            blank={() => ({ from: '', to: '', type: 'direct' })}
            fields={[
              { key: 'from', label: 'От (id)', kind: 'text' },
              { key: 'to', label: 'К (id)', kind: 'text' },
              { key: 'type', label: 'Тип (direct|feedback)', kind: 'text' },
            ]}
          />
        ),
      },
    ),
    Render: ProcessDiagramRender,
  })
}
