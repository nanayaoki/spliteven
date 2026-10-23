import { redirect } from 'next/navigation';
import { getSessionUser } from '../lib/auth';
import HomeClient from './home-client';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = getSessionUser();
  if (!user) redirect('/login');
  return <HomeClient username={user.username} />;
}
