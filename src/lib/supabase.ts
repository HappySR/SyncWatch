import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// CRITICAL FIX: Configure Supabase for 24/7 operation
export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
	auth: {
		storage: typeof window !== 'undefined' ? window.localStorage : undefined,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: true,
		flowType: 'pkce'
	},
	realtime: {
		params: {
			eventsPerSecond: 10
		},
		// CRITICAL: Aggressive settings to keep connection alive
		heartbeatIntervalMs: 15000, // Send heartbeat every 15s
		timeout: 60000, // Wait 60s before considering dead
		// CRITICAL: Reconnect immediately on disconnect
		reconnectAfterMs: (tries: number) => {
			return Math.min(500 * Math.pow(1.5, tries), 5000); // Fast reconnect: 500ms, 750ms, 1125ms...max 5s
		}
	},
	global: {
		headers: {
			'x-client-info': 'syncwatch-app'
		}
	},
	db: {
		schema: 'public'
	}
});

// Export helper functions
export async function signInWithGoogle() {
	const { error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: `${window.location.origin}/dashboard`,
			queryParams: {
				access_type: 'offline',
				prompt: 'consent'
			}
		}
	});
	if (error) throw error;
}

export async function signOut() {
	const { error } = await supabase.auth.signOut();
	if (error) throw error;
}

// CRITICAL: Connection status checker
export async function ensureConnection() {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);
		
		const { error } = await supabase
			.from('profiles')
			.select('id')
			.limit(1)
			.abortSignal(controller.signal);
		
		clearTimeout(timeoutId);
		
		if (error) {
			console.error('❌ Connection check failed:', error);
			// Try to refresh session
			await supabase.auth.refreshSession();
			return false;
		}
		
		return true;
	} catch (err) {
		console.error('❌ Connection error:', err);
		return false;
	}
}
