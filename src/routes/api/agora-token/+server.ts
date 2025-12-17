import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AGORA_APP_CERTIFICATE } from '$env/static/private';
import { PUBLIC_AGORA_APP_ID } from '$env/static/public';

// Fix for CommonJS import issue with Vite
import pkg from 'agora-access-token';
const { RtcTokenBuilder, RtcRole } = pkg;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { channelName, uid } = await request.json();

		console.log('📥 Token request received:', { channelName, uid });

		if (!channelName || uid === undefined) {
			console.error('❌ Missing parameters');
			return json({ error: 'Missing channelName or uid' }, { status: 400 });
		}

		if (!PUBLIC_AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
			console.error('❌ Missing Agora credentials');
			console.error('APP_ID exists:', !!PUBLIC_AGORA_APP_ID);
			console.error('CERTIFICATE exists:', !!AGORA_APP_CERTIFICATE);
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		console.log('🔑 Generating token for channel:', channelName);

		// Token valid for 24 hours
		const expirationTimeInSeconds = 86400;
		const currentTimestamp = Math.floor(Date.now() / 1000);
		const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

		// Convert string UID to number
		const numericUid = parseInt(uid);
		if (isNaN(numericUid)) {
			console.error('❌ Invalid UID format:', uid);
			return json({ error: 'Invalid UID format' }, { status: 400 });
		}

		// Generate token
		const token = RtcTokenBuilder.buildTokenWithUid(
			PUBLIC_AGORA_APP_ID,
			AGORA_APP_CERTIFICATE,
			channelName,
			numericUid,
			RtcRole.PUBLISHER,
			privilegeExpiredTs
		);

		console.log('✅ Token generated successfully');

		return json({
			token,
			appId: PUBLIC_AGORA_APP_ID,
			expiresAt: privilegeExpiredTs
		});
	} catch (error: any) {
		console.error('❌ Token generation error:', error);
		console.error('Error details:', error.message);
		console.error('Stack:', error.stack);
		return json(
			{
				error: 'Failed to generate token',
				details: error.message
			},
			{ status: 500 }
		);
	}
};
