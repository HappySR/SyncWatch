import type { Handle } from '@sveltejs/kit';

// Auth is handled client-side (ssr = false in +layout.ts).
// No server-side redirect needed.
export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event);
};
