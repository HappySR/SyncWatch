export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  host_id: string;
  is_public: boolean;
  created_at: string;
  current_video_url: string | null;
  current_video_type: 'youtube' | 'direct' | 'drive' | null;
  video_time: number;
  is_playing: boolean;
  last_updated: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  has_controls: boolean;
  joined_at: string;
  profiles?: Profile;
  is_online?: boolean;
}

export interface PlayerEvent {
  id: string;
  room_id: string;
  user_id: string;
  event_type: 'play' | 'pause' | 'seek' | 'change_video';
  video_time: number | null;
  video_url: string | null;
  created_at: string;
}

export type VideoType = 'youtube' | 'direct' | 'drive';
