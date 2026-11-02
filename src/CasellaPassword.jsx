// Primo Giocatore - casella password con il tasto «mostra»
// v1.0.0 - 202611022200
// Una casella password con un tasto (l'occhio) per vedere quello che si è
// scritto. Resta nascosta finché non la mostri, e torna nascosta a ogni
// apertura. La usano accesso e profilo, il collegamento BGA e l'invio a BGG.

import { useState } from 'react'

export default function CasellaPassword({ id, value, onChange, autoComplete, onKeyDown }) {
  const [visibile, setVisibile] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={visibile ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{ paddingRight: '3rem' }}
      />
      <button
        type="button"
        onClick={() => setVisibile((v) => !v)}
        aria-label={visibile ? 'Nascondi password' : 'Mostra password'}
        aria-pressed={visibile}
        title={visibile ? 'Nascondi password' : 'Mostra password'}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '2.9rem',
          display: 'grid', placeItems: 'center', background: 'none', border: 0,
          padding: 0, cursor: 'pointer', color: 'var(--inchiostro-tenue, currentColor)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visibile && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  )
}
