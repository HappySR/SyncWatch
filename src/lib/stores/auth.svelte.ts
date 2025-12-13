import { supabase } from '$lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '$lib/types';

class AuthStore {
  user = $state<User | null>(null);
  profile = $state<Profile | null>(null);
  loading = $state(true);

  constructor() {
    this.initialize();
  }

  async initialize() {
    const { data: { user } } = await supabase.auth.getUser();
    this.user = user;
    
    if (user) {
      await this.loadProfile(user.id);
    }
    
    this.loading = false;

    supabase.auth.onAuthStateChange(async (event, session) => {
      this.user = session?.user ?? null;
      
      if (session?.user) {
        await this.loadProfile(session.user.id);
      } else {
        this.profile = null;
      }
    });
  }

  async loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      this.profile = data;
    } else if (error && this.user) {
      // Create profile if doesn't exist
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
      
      if (newProfile) this.profile = newProfile;
    }
  }
}

export const authStore = new AuthStore();
