class SettingsStore {
	showChatInFullscreen = $state(true);
	chatOpacityInFullscreen = $state(0.7);
	isInitialized = $state(false);

	constructor() {
		this.loadSettings();
	}

	loadSettings() {
		if (typeof window !== 'undefined') {
			try {
				const showChat = localStorage.getItem('showChatInFullscreen');
				const opacity = localStorage.getItem('chatOpacityInFullscreen');

				if (showChat !== null) {
					this.showChatInFullscreen = showChat === 'true';
				}
				if (opacity !== null) {
					const parsedOpacity = parseFloat(opacity);
					if (!isNaN(parsedOpacity) && parsedOpacity >= 0.1 && parsedOpacity <= 1) {
						this.chatOpacityInFullscreen = parsedOpacity;
					}
				}
				
				console.log('Settings loaded:', {
					showChatInFullscreen: this.showChatInFullscreen,
					chatOpacityInFullscreen: this.chatOpacityInFullscreen
				});
				
				this.isInitialized = true;
			} catch (error) {
				console.error('Failed to load settings:', error);
				this.isInitialized = true;
			}
		}
	}

	toggleChatInFullscreen() {
		this.showChatInFullscreen = !this.showChatInFullscreen;
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem('showChatInFullscreen', String(this.showChatInFullscreen));
				console.log('Chat visibility updated:', this.showChatInFullscreen);
			} catch (error) {
				console.error('Failed to save chat visibility:', error);
			}
		}
	}

	setChatOpacity(opacity: number) {
		// Clamp between 0.1 and 1
		this.chatOpacityInFullscreen = Math.max(0.1, Math.min(1, opacity));
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem('chatOpacityInFullscreen', String(this.chatOpacityInFullscreen));
				console.log('Chat opacity updated:', this.chatOpacityInFullscreen);
			} catch (error) {
				console.error('Failed to save chat opacity:', error);
			}
		}
	}
}

export const settingsStore = new SettingsStore();
