import { supabase } from '$lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '$lib/types';

class AuthStore {
	user = $state<User | null>(null);
	profile = $state<Profile | null>(null);
	loading = $state(true);
	private initPromise: Promise<void> | null = null;

	constructor() {
		// Only initialize once
		if (!this.initPromise) {
			this.initPromise = this.initialize();
		}
	}

	async initialize() {
		console.log('🔐 Initializing auth...');
		
		try {
			// CRITICAL: Always get fresh session from storage
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

		// CRITICAL: Listen to auth changes
		supabase.auth.onAuthStateChange(async (event, session) => {
			console.log('🔄 Auth event:', event);
			
			// Update user state
			this.user = session?.user ?? null;
			
			// Load profile if user exists
			if (session?.user) {
				await this.loadProfile(session.user.id);
			} else {
				this.profile = null;
			}
			
			// Handle specific events
			if (event === 'SIGNED_OUT') {
				this.user = null;
				this.profile = null;
			}
		});
	}

	async loadProfile(userId: string) {
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
		}
	}
}

export const authStore = new AuthStore();
