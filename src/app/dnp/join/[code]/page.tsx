import type { Metadata } from 'next';
import DnpGame from '../../DnpGame';

export const metadata: Metadata = {
  title: 'Join DefinitelyNotPong room',
  description: 'Join a DefinitelyNotPong multiplayer room by six-character code.',
};

export default async function JoinDnpRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DnpGame initialJoin={{ code: code.toUpperCase() }} />;
}
