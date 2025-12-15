import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get('sb-access-token');
  
  // Define public routes that don't require authentication
  const publicRoutes = ['/', '/auth/callback'];
  
  // Check if current path requires authentication
  const requiresAuth = !publicRoutes.includes(event.url.pathname);
  
  if (requiresAuth && !session) {
    throw redirect(303, '/');
  }
  
  return resolve(event);
};
