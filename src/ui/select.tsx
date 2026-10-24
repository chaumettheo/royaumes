'use client'
import { AnimatePresence, motion } from 'motion/react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'

/** Option d'une liste déroulante : sa valeur, son libellé, et une image facultative. */
export interface SelectOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

/**
 * Liste déroulante dans le style du jeu, à la place de la liste native du système : un bouton en
 * bois, et une liste en parchemin qui s'ouvre en rebondissant. Elle suit le modèle « listbox »
 * des recommandations ARIA : flèches, Entrée, Échap, Début, Fin et saisie de la première lettre
 * au clavier ; la valeur choisie est annoncée par les lecteurs d'écran.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Choisir',
}: {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  /** Nom de la liste, lu par les lecteurs d'écran. */
  label: string
  /** Texte affiché tant qu'aucune option ne correspond à la valeur. */
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  // Option mise en évidence au clavier ou au survol, pendant que la liste est ouverte.
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const selected = options.find((option) => option.value === value)

  // Un clic en dehors de la liste la referme.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  // À l'ouverture, l'option choisie est mise en évidence, et la liste reçoit le focus.
  useEffect(() => {
    if (!open) return
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    )
    list.current?.focus()
  }, [open, options, value])

  function choose(index: number) {
    const option = options[index]
    if (option) onChange(option.value)
    setOpen(false)
    root.current?.querySelector('button')?.focus()
  }

  function onListKey(event: KeyboardEvent) {
    const last = options.length - 1
    const moves: Record<string, () => void> = {
      ArrowDown: () => setActive((index) => Math.min(last, index + 1)),
      ArrowUp: () => setActive((index) => Math.max(0, index - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => {
        setOpen(false)
        root.current?.querySelector('button')?.focus()
      },
      Tab: () => setOpen(false),
    }
    const move = moves[event.key]
    if (move) {
      if (event.key !== 'Tab') event.preventDefault()
      move()
      return
    }
    // Saisie d'une lettre : première option dont le libellé commence par cette lettre.
    if (event.key.length === 1) {
      const letter = event.key.toLowerCase()
      const index = options.findIndex((option) => option.label.toLowerCase().startsWith(letter))
      if (index >= 0) setActive(index)
    }
  }

  function onButtonKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div className="select" ref={root} data-open={open || undefined}>
      <button
        type="button"
        className="select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label} : ${selected?.label ?? placeholder}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKey}
      >
        {selected?.icon}
        <span className={selected ? undefined : 'placeholder'}>
          {selected?.label ?? placeholder}
        </span>
        <motion.span
          className="select-arrow"
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={list}
            id={`${id}-list`}
            className="select-list"
            role="listbox"
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            tabIndex={-1}
            onKeyDown={onListKey}
            initial={{ opacity: 0, y: -6, scaleY: 0.85 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.9 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            style={{ transformOrigin: 'top' }}
          >
            {options.map((option, index) => (
              // La liste reçoit le clavier (aria-activedescendant) : chaque option n'est que cliquable.
              <motion.li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-active={index === active || undefined}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.025 }}
              >
                {option.icon}
                <span>{option.label}</span>
                {option.value === value && (
                  <span className="select-check" aria-hidden="true">
                    ✔
                  </span>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
