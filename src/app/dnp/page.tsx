import type { Metadata } from 'next';
import DnpGame from './DnpGame';

export const metadata: Metadata = {
  title: 'DefinitelyNotPong',
  description: 'A browser-only, Hostinger-safe canvas paddle game against an AI opponent.',
};

export default function DefinitelyNotPongPage() {
  return <DnpGame />;
}
