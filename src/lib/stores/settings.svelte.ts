class SettingsStore {
  showChatInFullscreen = $state(true);
  chatOpacityInFullscreen = $state(0.7);
  
  constructor() {
    if (typeof window !== 'undefined') {
      const showChat = localStorage.getItem('showChatInFullscreen');
      const opacity = localStorage.getItem('chatOpacityInFullscreen');
      
      if (showChat !== null) {
        this.showChatInFullscreen = showChat === 'true';
      }
      if (opacity !== null) {
        this.chatOpacityInFullscreen = parseFloat(opacity);
      }
    }
  }
  
  toggleChatInFullscreen() {
    this.showChatInFullscreen = !this.showChatInFullscreen;
    if (typeof window !== 'undefined') {
      localStorage.setItem('showChatInFullscreen', String(this.showChatInFullscreen));
    }
  }
  
  setChatOpacity(opacity: number) {
    this.chatOpacityInFullscreen = opacity;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatOpacityInFullscreen', String(opacity));
    }
  }
}

export const settingsStore = new SettingsStore();
