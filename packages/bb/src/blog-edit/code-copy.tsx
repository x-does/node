'use client';

import { useEffect } from 'react';

const COPIED_TEXT = 'Copied';
const COPY_TEXT = 'Copy';

function setCopyButtonText(button: HTMLButtonElement, text: string) {
  const label = button.querySelector<HTMLElement>('.blog-code-copy__text');
  if (label) label.textContent = text;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto -9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function BlogCodeCopyController() {
  useEffect(() => {
    const onClick = async (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>('.blog-code-copy');
      if (!button) return;

      const code = button.dataset.copyCode;
      if (typeof code !== 'string') return;

      try {
        await copyText(code);
        button.dataset.copied = 'true';
        setCopyButtonText(button, COPIED_TEXT);
        window.setTimeout(() => {
          button.dataset.copied = 'false';
          setCopyButtonText(button, COPY_TEXT);
        }, 1800);
      } catch {
        button.dataset.copied = 'false';
        setCopyButtonText(button, 'Failed');
        window.setTimeout(() => setCopyButtonText(button, COPY_TEXT), 1800);
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
