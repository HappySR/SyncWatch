import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const session = event.cookies.get('sb-access-token');

	const publicRoutes = ['/', '/auth/callback'];
	const isApiRoute = event.url.pathname.startsWith('/api/');

	const requiresAuth = !publicRoutes.includes(event.url.pathname) && !isApiRoute;

	if (requiresAuth && !session) {
		throw redirect(303, '/');
	}

	return resolve(event);
};
