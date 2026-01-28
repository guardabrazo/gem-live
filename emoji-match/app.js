import { GoogleGenAI, Modality } from 'https://esm.run/@google/genai';
import { CONFIG } from '../config.js';

// --- Configuration ---
const API_KEY = CONFIG.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const EMOJIS = ['😀', '😮', '😡', '🤔', '😎', '😜', '🤩', '😴', '😱', '🥳'];

// --- DOM Elements ---
const els = {
    webcam: document.getElementById('webcam'),
    canvas: document.getElementById('canvas'),
    targetEmoji: document.getElementById('target-emoji'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    nextBtn: document.getElementById('next-btn'),
    snapshotBtn: document.getElementById('snapshot-btn'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    scoreVal: document.getElementById('score-val'),
    scoreBar: document.getElementById('score-bar'),
    transcript: document.getElementById('transcript')
};

// --- State ---
let state = {
    isPlaying: false,
    currentEmoji: '',
    session: null,
    audioContext: null,
    nextPlayTime: 0,
    streamInterval: null,
    nudgeInterval: null,
    streamInterval: null,
    nudgeInterval: null,
    transcriptText: '',
    emojiQueue: ['😮', '😡', '🤔'] // Fixed start sequence
};

// --- Audio Player ---
function initAudio() {
    if (!state.audioContext) {
        state.audioContext = new AudioContext({ sampleRate: 24000 });
    }
    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }
    state.nextPlayTime = state.audioContext.currentTime;
}

function playAudioChunk(base64Data) {
    if (!state.audioContext) return;

    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const buffer = state.audioContext.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = state.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audioContext.destination);

    const now = state.audioContext.currentTime;
    if (state.nextPlayTime < now) state.nextPlayTime = now;
    source.start(state.nextPlayTime);
    state.nextPlayTime += buffer.duration;
}

// --- Webcam & Capture ---
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false
        });
        els.webcam.srcObject = stream;
        return true;
    } catch (err) {
        console.error('Webcam fail:', err);
        els.transcript.textContent = 'Camera access denied 🚫';
        return false;
    }
}

function captureFrame() {
    const ctx = els.canvas.getContext('2d');
    els.canvas.width = els.webcam.videoWidth;
    els.canvas.height = els.webcam.videoHeight;
    // Mirror the capture to match the video preview
    ctx.translate(els.canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(els.webcam, 0, 0);
    return els.canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
}

// --- Game Logic ---
function pickRandomEmoji() {
    if (state.emojiQueue.length > 0) {
        state.currentEmoji = state.emojiQueue.shift();
    } else {
        state.currentEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    }

    els.targetEmoji.textContent = state.currentEmoji;
    // Add pop animation
    els.targetEmoji.style.transform = 'scale(0.1)';
    setTimeout(() => els.targetEmoji.style.transform = 'scale(1)', 100);
}

function updateScore(score) {
    els.scoreVal.textContent = score;
    els.scoreBar.style.width = `${score}%`;

    // Color shift based on score
    if (score > 80) els.scoreBar.style.backgroundColor = '#4CAF50'; // Green
    else if (score > 50) els.scoreBar.style.backgroundColor = '#FFC107'; // Yellow
    else els.scoreBar.style.backgroundColor = '#F44336'; // Red
}

function parseScore(text) {
    const match = text.match(/SCORE:\s*(\d+)/i);
    if (match) {
        const score = parseInt(match[1], 10);
        updateScore(Math.min(100, Math.max(0, score)));
    }
}

// --- Gemini Live ---
async function startGame() {
    if (state.isPlaying) return;

    initAudio();
    pickRandomEmoji();

    state.isPlaying = true;
    els.startBtn.disabled = true;
    els.stopBtn.disabled = true; // Disable stop during countdown

    // Countdown removed for instant start
    // for (let i = 3; i > 0; i--) { ... }

    els.stopBtn.disabled = false;
    els.nextBtn.disabled = false;
    els.snapshotBtn.disabled = false;
    els.transcript.textContent = 'Connecting to judge...';

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    // ... (start of startGame function)

    // ...



    try {
        state.session = await ai.live.connect({
            model: MODEL,
            config: {
                responseModalities: [Modality.AUDIO],
                outputAudioTranscription: {},
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: 'Puck' // Picking Puck for energetic game show host vibe
                        }
                    }
                },
                generationConfig: {
                    thinkingConfig: { thinkingBudget: 0 }
                },
                // Enable proactive mode: don't wait for user to speak
                realtimeInputConfig: {
                    automaticActivityDetection: { disabled: true }
                },
                systemInstruction: `You are the judge of a 'Match the Emoji' game. 
Wait for the user to send a snapshot and a target emoji name.
When you receive an image, compare the user's face to the specified target emoji.
Output a similarity score from 0 to 100.
FORMAT: "SCORE: [number] [Commentary]"
COMMENTARY RULES:
- Be extremely concise (Max 6 words).
- Be strict but funny.
- Do NOT mention the emoji name.
Example: "SCORE: 40 Mouth wider! SCORE: 90 Perfect!"`
            },
            callbacks: {
                onopen: () => {
                    els.transcript.textContent = 'Judge is watching! Mimic the face!';
                },
                onmessage: handleMessage,
                onclose: stopGame,
                onerror: (e) => {
                    console.error(e);
                    els.transcript.textContent = 'Connection error!';
                    stopGame();
                }
            }
        });

        // Kickstart removed: Doing nothing allows the socket to open silently.
        // We wait for the first manual snapshot to send any data.
        /*
        state.session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: 'I am ready. Do not speak yet. Wait for the image.' }] }],
            turnComplete: true
        });
        */

        // Frame streaming removed - we only send manual snapshots now
        // state.streamInterval = setInterval(sendFrame, 500);

        // Auto-nudge removed in favor of manual snapshot

    } catch (e) {
        console.error(e);
        els.transcript.textContent = 'Failed to connect.';
        state.isPlaying = false;
        els.startBtn.disabled = false;
    }
}

function handleMessage(msg) {
    // Audio
    if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/')) {
                playAudioChunk(part.inlineData.data);
            }
        }
    }

    // Text / Score
    if (msg.serverContent?.outputTranscription?.text) {
        const text = msg.serverContent.outputTranscription.text;
        parseScore(text);

        // Append raw text to buffer
        state.transcriptText += text;

        // Keep buffer from growing indefinitely (last 2000 chars)
        if (state.transcriptText.length > 2000) {
            state.transcriptText = state.transcriptText.slice(-2000);
        }

        // Format for display:
        // 1. Replace "SCORE: <num>" with a Newline + Emoji or just Newline to create blocks
        // 2. Trim headers
        const displayText = state.transcriptText
            .replace(/SCORE:\s*\d+/gi, '\n') // Turn scores into line breaks
            .replace(/\n\s*\n/g, '\n')       // Collapse multiple newlines
            .trim();

        els.transcript.textContent = displayText;
        els.transcript.scrollTop = els.transcript.scrollHeight;
    }
}

function sendFrame() {
    if (!state.session) return;
    const data = captureFrame();
    state.session.sendRealtimeInput({
        media: { mimeType: 'image/jpeg', data }
    });
}

function stopGame() {
    state.isPlaying = false;
    clearInterval(state.streamInterval);
    clearInterval(state.nudgeInterval);
    if (state.session) {
        state.session.close();
        state.session = null;
    }

    els.startBtn.disabled = false;
    els.stopBtn.disabled = true;
    els.nextBtn.disabled = true;
    els.snapshotBtn.disabled = true;
    els.transcript.textContent = 'Game Stopped.';
    state.transcriptText = '';
}

// Manual Snapshot Trigger
async function triggerSnapshot() {
    if (!state.isPlaying || !state.session) return;

    els.snapshotBtn.disabled = true; // Prevent spam

    // Instant Capture (No countdown)
    const frameData = captureFrame();
    state.session.sendClientContent({
        turns: [{
            role: 'user',
            parts: [
                { inlineData: { mimeType: 'image/jpeg', data: frameData } },
                { text: `Target is ${state.currentEmoji}. Rate my imitation!` }
            ]
        }],
        turnComplete: true
    });

    // Slight delay before re-enabling
    setTimeout(() => {
        if (state.isPlaying) els.snapshotBtn.disabled = false;
    }, 1000);
}

// Change to a new random emoji
function changeEmoji() {
    // Cooldown check
    if (els.nextBtn.disabled) return;

    // Cooldown
    els.nextBtn.disabled = true;
    setTimeout(() => {
        if (state.isPlaying) els.nextBtn.disabled = false;
    }, 500);

    pickRandomEmoji();
    state.transcriptText = ''; // Reset buffer
    els.transcript.textContent = 'New emoji! Click "Judge Me" when ready!';
    updateScore(0);
}

// --- Init ---
els.startBtn.addEventListener('click', startGame);
els.stopBtn.addEventListener('click', stopGame);
els.nextBtn.addEventListener('click', changeEmoji);
els.snapshotBtn.addEventListener('click', triggerSnapshot);

(async () => {
    await startWebcam();
})();
