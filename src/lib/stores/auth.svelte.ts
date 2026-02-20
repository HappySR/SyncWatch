import { supabase } from '$lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '$lib/types';

class AuthStore {
	user = $state<User | null>(null);
	profile = $state<Profile | null>(null);
	loading = $state(true);
	private initPromise: Promise<void> | null = null;
	private loadingProfile = false;
	private isRefreshing = false;

	constructor() {
		// Only initialize once
		if (!this.initPromise) {
			this.initPromise = this.initialize();
		}
	}

	async initialize() {
		console.log('🔐 Initializing auth...');

		try {
			const { data: { session }, error } = await supabase.auth.getSession();

			if (error) {
				console.error('❌ Session error:', error);
			}

			if (session?.user) {
				console.log('✅ Found existing session');
				this.user = session.user;
				await this.loadProfile(session.user.id);
			} else {
				console.log('ℹ️ No session found');
			}
		} catch (error) {
			console.error('❌ Init error:', error);
		} finally {
			this.loading = false;
		}

		supabase.auth.onAuthStateChange(async (event, session) => {
			console.log('🔄 Auth event:', event);

			if (event === 'SIGNED_OUT') {
				this.user = null;
				this.profile = null;
				return;
			}

			if (event === 'TOKEN_REFRESHED' && session?.user) {
				this.user = session.user;
				// Only reload profile if we don't have it
				if (!this.profile) {
					await this.loadProfile(session.user.id);
				}
				return;
			}

			if (event === 'SIGNED_IN' && session?.user) {
				this.user = session.user;
				await this.loadProfile(session.user.id);
				return;
			}

			if (event === 'USER_UPDATED' && session?.user) {
				this.user = session.user;
				return;
			}
		});

		// Set up visibility change listener to refresh session when tab becomes active
		if (typeof window !== 'undefined') {
			let lastVisibilityChange = Date.now();

			document.addEventListener('visibilitychange', async () => {
				if (document.visibilityState === 'visible') {
					const now = Date.now();
					// Only refresh if more than 2 seconds have passed
					if (now - lastVisibilityChange > 2000) {
						lastVisibilityChange = now;
						console.log('👁️ Tab became visible, checking session...');
						await this.refreshSession();
					}
				}
			});

			// Periodic session refresh every 5 minutes
			setInterval(async () => {
				if (document.visibilityState === 'visible') {
					await this.refreshSession();
				}
			}, 5 * 60 * 1000);
		}
	}

	async refreshSession() {
		if (this.isRefreshing) {
			console.log('⏳ Already refreshing session, skipping...');
			return;
		}

		this.isRefreshing = true;

		try {
			const { data: { session }, error } = await supabase.auth.getSession();

			if (error) {
				console.error('❌ Session refresh error:', error);
				return;
			}

			if (session?.user) {
				if (!this.user) {
					console.log('🔄 Restoring session after tab switch');
					this.user = session.user;
					if (!this.profile) {
						await this.loadProfile(session.user.id);
					}
				} else if (this.user.id !== session.user.id) {
					console.log('🔄 User changed, updating...');
					this.user = session.user;
					await this.loadProfile(session.user.id);
				}
			} else if (this.user) {
				console.log('⚠️ Session expired');
				this.user = null;
				this.profile = null;
			}
		} catch (err) {
			console.error('❌ Session refresh exception:', err);
		} finally {
			setTimeout(() => {
				this.isRefreshing = false;
			}, 1000);
		}
	}

	async loadProfile(userId: string) {
		if (this.loadingProfile) {
			console.log('⏳ Profile already loading, skipping...');
			return;
		}

		if (this.profile && this.profile.id === userId) {
			console.log('✓ Profile already loaded for this user');
			return;
		}

		this.loadingProfile = true;

		try {
			const { data, error } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', userId)
				.maybeSingle();

			if (data) {
				this.profile = data;
				return;
			}

			// Create profile if doesn't exist
			if (error?.code === 'PGRST116' && this.user) {
				const { data: newProfile } = await supabase
					.from('profiles')
					.insert({
						id: this.user.id,
						email: this.user.email!,
						display_name: this.user.user_metadata?.full_name || this.user.email?.split('@')[0],
						avatar_url: this.user.user_metadata?.avatar_url
					})
					.select()
					.single();

				if (newProfile) {
					this.profile = newProfile;
				}
			}
		} catch (err) {
			console.error('Profile error:', err);
		} finally {
			this.loadingProfile = false;
		}
	}
}

export const authStore = new AuthStore();
