import styles from '../styles.module.css'

type Card = { title?: string; text?: string }

export function StarterCard({ title, text }: Card) {
  return (
    <article className={styles.card}>
      <h3 className={styles.cardTitle}>{title || 'Карточка'}</h3>
      {text ? <p className={styles.cardText}>{text}</p> : null}
    </article>
  )
}
