import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../lib/supabase-server';
import HomeClient from './home-client';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { data: { user } } = await createSupabaseServerClient().auth.getUser();
  if (!user) redirect('/login');
  return <HomeClient username={user.email?.split('@')[0] || 'user'} />;
}
