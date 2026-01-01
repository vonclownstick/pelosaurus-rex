// Spotify Integration with PKCE OAuth Flow
// AIDEV-NOTE: This implements the Spotify Authorization Code Flow with PKCE (RFC 7636)
// to allow client-side OAuth without exposing client secrets.

// Spotify API Configuration
let spotifyClientId = '';  // Set from /api/config

// PKCE Helper Functions
function generateCodeVerifier() {
    const array = new Uint8Array(64);
    window.crypto.getRandomValues(array);
    return base64URLEncode(array);
}

function base64URLEncode(buffer) {
    return btoa(String.fromCharCode.apply(null, buffer))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(new Uint8Array(digest));
}

// Spotify OAuth Flow
async function initiateSpotifyAuth() {
    console.log('Initiating Spotify OAuth...');

    // Get client ID from config
    if (!spotifyClientId) {
        const config = await fetch('/api/config').then(res => res.json());
        spotifyClientId = config.spotifyClientId;
        if (!spotifyClientId) {
            alert('Spotify is not configured. Please set SPOTIFY_CLIENT_ID environment variable.');
            return;
        }
    }

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store code verifier for later use
    localStorage.setItem('spotify_code_verifier', codeVerifier);

    // Build authorization URL
    const redirectUri = `${window.location.origin}/callback`;
    const scope = 'user-modify-playback-state user-read-playback-state';
    const state = generateCodeVerifier().substring(0, 16);  // Random state for CSRF protection

    const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: spotifyClientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        state: state,
        scope: scope
    });

    // Redirect to Spotify authorization
    window.location.href = authUrl;
}

async function handleSpotifyCallback() {
    console.log('Handling Spotify callback...');

    // Check if we're on the callback page
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
        console.error('Spotify authorization error:', error);
        alert('Spotify authorization failed: ' + error);
        window.location.href = '/';
        return;
    }

    if (!code) {
        // Not a callback page
        return;
    }

    // Get stored code verifier
    const codeVerifier = localStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) {
        console.error('Code verifier not found');
        alert('Authorization flow error. Please try again.');
        window.location.href = '/';
        return;
    }

    // Get client ID
    const config = await fetch('/api/config').then(res => res.json());
    spotifyClientId = config.spotifyClientId;

    // Exchange code for access token
    try {
        const redirectUri = `${window.location.origin}/callback`;
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: spotifyClientId,
                code_verifier: codeVerifier
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Token exchange failed');
        }

        const tokenData = await tokenResponse.json();

        // Store tokens
        localStorage.setItem('spotify_access_token', tokenData.access_token);
        localStorage.setItem('spotify_refresh_token', tokenData.refresh_token);
        const expiryTime = Date.now() + (tokenData.expires_in * 1000);
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());

        // Clean up
        localStorage.removeItem('spotify_code_verifier');

        console.log('Spotify authorization successful!');
        alert('Successfully connected to Spotify!');

        // Redirect to home
        window.location.href = '/';
    } catch (err) {
        console.error('Token exchange error:', err);
        alert('Failed to complete Spotify authorization. Please try again.');
        window.location.href = '/';
    }
}

async function refreshAccessToken() {
    console.log('Refreshing Spotify access token...');

    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) {
        console.error('No refresh token available');
        return false;
    }

    const config = await fetch('/api/config').then(res => res.json());
    spotifyClientId = config.spotifyClientId;

    try {
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: spotifyClientId
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Token refresh failed');
        }

        const tokenData = await tokenResponse.json();

        // Update tokens
        localStorage.setItem('spotify_access_token', tokenData.access_token);
        if (tokenData.refresh_token) {
            localStorage.setItem('spotify_refresh_token', tokenData.refresh_token);
        }
        const expiryTime = Date.now() + (tokenData.expires_in * 1000);
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());

        console.log('Access token refreshed successfully');
        return true;
    } catch (err) {
        console.error('Token refresh error:', err);
        return false;
    }
}

async function getValidAccessToken() {
    const accessToken = localStorage.getItem('spotify_access_token');
    const expiryTime = parseInt(localStorage.getItem('spotify_token_expiry') || '0');

    // Check if token is expired or about to expire (within 5 minutes)
    if (Date.now() >= expiryTime - 300000) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            return null;
        }
        return localStorage.getItem('spotify_access_token');
    }

    return accessToken;
}

// Spotify Playback Control
async function playSpotifyPlaylist(playlistUri) {
    console.log('Starting Spotify playback:', playlistUri);

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
        console.error('No valid access token');
        throw new Error('Not authenticated with Spotify');
    }

    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context_uri: playlistUri,
                offset: { position: 0 },
                position_ms: 0
            })
        });

        if (response.status === 404) {
            throw new Error('No active Spotify device found. Please open Spotify on a device first.');
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Spotify API error: ${errorText}`);
        }

        console.log('Playback started successfully');
    } catch (err) {
        console.error('Failed to start playback:', err);
        throw err;
    }
}

async function pauseSpotifyPlayback() {
    console.log('Pausing Spotify playback');

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
        console.warn('No valid access token for pause');
        return;
    }

    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.ok || response.status === 204) {
            console.log('Playback paused successfully');
        }
    } catch (err) {
        console.error('Failed to pause playback:', err);
    }
}

async function resumeSpotifyPlayback() {
    console.log('Resuming Spotify playback');

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
        console.warn('No valid access token for resume');
        return;
    }

    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 404) {
            console.warn('No active Spotify device found');
            return;
        }

        if (response.ok || response.status === 204) {
            console.log('Playback resumed successfully');
        }
    } catch (err) {
        console.error('Failed to resume playback:', err);
    }
}

// Auto-handle callback on page load
if (window.location.pathname === '/callback') {
    handleSpotifyCallback();
}
