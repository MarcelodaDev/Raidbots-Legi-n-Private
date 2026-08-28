import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, type GlossaryKey } from '../glossary.js';

/**
 * La ayuda que sale al pasar el ratón por encima del `?`.
 *
 * Dos decisiones que importan:
 *
 * - El globo se pinta en un portal con posición fija. Muchas de estas ayudas
 *   viven dentro de tablas con scroll, y si el globo fuese hijo de la tabla se
 *   cortaría por el borde.
 * - Se abre también con el teclado (al enfocar el botón) y se cierra con Escape.
 *   Una ayuda que solo responde al ratón no la ve quien navega con el tabulador
 *   ni quien usa una pantalla táctil.
 */

const WIDTH = 300;
const GAP = 10;
const MARGIN = 8;

interface Position {
  left: number;
  top: number;
  /** El globo está por encima del botón porque abajo no cabía. */
  above: boolean;
}

export function Help({ term }: { term: GlossaryKey }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const height = bubbleRef.current?.offsetHeight ?? 0;

    // Centrado sobre el botón, pero sin salirse por ninguno de los lados.
    const wanted = rect.left + rect.width / 2 - WIDTH / 2;
    const left = Math.min(
      Math.max(wanted, MARGIN),
      Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN),
    );

    const below = rect.bottom + GAP;
    const above = below + height > window.innerHeight - MARGIN && rect.top - GAP - height > MARGIN;

    setPosition({ left, top: above ? rect.top - GAP - height : below, above });
  }, []);

  // Se mide después de pintar: hasta que el globo no existe no se sabe su alto,
  // y sin el alto no se puede decidir si cabe debajo.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`help-dot${open ? ' open' : ''}`}
        aria-label={`Qué es: ${entry.title}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          // En pantalla táctil no hay «pasar por encima»: el toque la abre.
          event.preventDefault();
          setOpen((prev) => !prev);
        }}
      >
        ?
      </button>

      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role="tooltip"
            className="help-bubble"
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
              width: WIDTH,
              // Hasta que no está medido no se enseña, para que no dé un salto.
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            <div className="help-title">{entry.title}</div>
            <p>{entry.text}</p>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Una etiqueta de campo con su ayuda al lado.
 *
 * Es lo que se usa en casi todos los formularios, así el `?` siempre queda en
 * el mismo sitio respecto al texto.
 */
export function FieldLabel({
  children,
  term,
}: {
  children: React.ReactNode;
  term?: GlossaryKey;
}) {
  return (
    <span className="field-label">
      {children}
      {term && <Help term={term} />}
    </span>
  );
}
