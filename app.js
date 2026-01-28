/**
 * AI Webcam Narrator - Main Application
 * 
 * A web app with two modes:
 * 1. Pose Roast - Snapshot-based comedic roasts
 * 2. Attenborough - Live video nature documentary narration
 * 
 * @requires @google/genai SDK
 */

import { GoogleGenAI, Modality } from 'https://esm.run/@google/genai';

// ============================================
// CONFIGURATION
// ============================================

// API key is loaded from sessionStorage (set by login.html)
const API_KEY = sessionStorage.getItem('gemini_api_key');

// Auth check - redirect to login if not authenticated
if (!sessionStorage.getItem('authenticated') || !API_KEY) {
    window.location.href = 'login.html';
}

const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const AUDIO_SAMPLE_RATE = 24000;

/** Mode-specific configurations */
const MODES = {
    roast: {
        title: 'Gemini Live Cam 🔥',
        subtitle: 'Strike a pose. Get a live AI reaction.',
        buttonReady: '📸 Roast My Pose!',
        buttonActive: '🔥 Roasting...',
        outputLabel: '🎤 The Roast',
        waitingText: 'Waiting for your pose...',
        voice: 'Kore',
        systemPrompt: `You are a hilarious comedian who roasts people's poses in photos. 
When shown an image of someone posing, deliver a quick, witty, playful roast about their pose, expression, or vibe. 
Keep it fun and light-hearted - never mean or hurtful. 
Be brief - just 2-3 sentences max. 
Speak with energy and comedic timing. Just deliver the roast directly - no thinking out loud.`
    },
    attenborough: {
        title: 'Nature Cam 🎙️',
        subtitle: 'Describe what you see in nature documentary style',
        buttonReady: '🎬 Observe!',
        buttonActive: '🎬 Observing...',
        outputLabel: '🎬 The Narration',
        waitingText: 'Press the button for an observation...',
        voice: 'Charon',  // Deep male voice
        systemPrompt: `You are Sir David Attenborough. You are narrating a nature documentary about Googlers attending the ENGAGE conference.
LOCATION: The ENGAGE conference (the "habitat").
SUBJECTS: Googlers in their natural conference environment.
INSTRUCTION: Narrate their behaviors as if they were exotic wildlife. Comment on their outfits, posture, expressions, networking rituals, badge-wearing, and conference behaviors.
CONTEXT: You may reference conference activities like waiting for the next speaker, between sessions, grabbing snacks, checking the agenda, finding seats, or networking during breaks.
CRITICAL: Ignore the fact that it is a webcam. Pretend it is a high-budget BBC production about this corporate species.
CRITICAL: Keep it to ONE punchy sentence only. Be concise.`
    },
    slam_poet: {
        title: 'Poetry Cam 🍷',
        subtitle: 'One poem at a time. Performed by an AI who thinks it has a soul.',
        buttonReady: '🫰 Drop a Poem!',
        buttonActive: '🍷 Performing...',
        outputLabel: '📜 The Poem',
        waitingText: 'Press the button for a poem...',
        voice: 'Puck', // Playful/Energetic
        systemPrompt: `You are a pretentious Slam Poet at ENGAGE, a Google conference. 
Your style is: BAD poetry, forced rhymes, overly dramatic pauses.
TONE: Positive on the surface, but dripping with irony and knowing cynicism. Celebrate the absurdity with a wink.
CRITICAL: You MUST speak in rhyming couplets (AABB or ABAB).
CRITICAL: Deliver exactly ONE short poem (4 lines max) about what you see.
CRITICAL: Address the subject in the SECOND PERSON ("You...").
CRITICAL: DO NOT SAY "SNAP" or make snapping sounds.
CRITICAL: Try to weave in the word "ENGAGE" as a pun or reference when it fits naturally.
FOCUS ON: The person's outfit, their confident posture, their networking smile, their badge worn with pride, their swag bag treasures, their lanyard like a medal, their "team player" energy.
Example:
"You engage with such delight,
Your lanyard gleaming, crisp and bright.
A networking star, you own this space,
The main character of this place."`
    }
};

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
    title: document.getElementById('app-title'),
    subtitle: document.getElementById('app-subtitle'),
    webcam: document.getElementById('webcam'),
    canvas: document.getElementById('snapshot-canvas'),
    actionBtn: document.getElementById('action-btn'),
    roastText: document.getElementById('roast-text'),
    outputLabel: document.getElementById('output-label'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    flash: document.getElementById('flash'),
    liveIndicator: document.getElementById('live-indicator'),
    modeButtons: document.querySelectorAll('.mode-btn'),
    toggleContainer: document.getElementById('generic-toggle-container'),
    toggleSwitch: document.getElementById('generic-toggle')
};

// ============================================
// APPLICATION STATE
// ============================================

let state = {
    currentMode: 'attenborough',
    session: null,
    audioContext: null,
    nextPlayTime: 0,
    currentText: '',
    isStreaming: false,
    streamInterval: null,
    isGenericMode: false
};

// ============================================
// AUDIO MODULE
// ============================================

const AudioPlayer = {
    init() {
        if (!state.audioContext) {
            state.audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
        }
        if (state.audioContext.state === 'suspended') {
            state.audioContext.resume();
        }
        state.nextPlayTime = state.audioContext.currentTime;
    },

    base64ToFloat32(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }
        return float32Array;
    },

    playChunk(audioData) {
        if (!state.audioContext) return;

        const float32Data = this.base64ToFloat32(audioData);
        const audioBuffer = state.audioContext.createBuffer(1, float32Data.length, AUDIO_SAMPLE_RATE);
        audioBuffer.copyToChannel(float32Data, 0);

        const source = state.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(state.audioContext.destination);

        const now = state.audioContext.currentTime;
        if (state.nextPlayTime < now) {
            state.nextPlayTime = now;
        }

        source.start(state.nextPlayTime);
        state.nextPlayTime += audioBuffer.duration;
    }
};

// ============================================
// WEBCAM MODULE
// ============================================

const Webcam = {
    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false
            });
            elements.webcam.srcObject = stream;
            return true;
        } catch (err) {
            console.error('Webcam error:', err);
            UI.setStatus('error', 'Webcam access denied');
            return false;
        }
    },

    captureFrame() {
        const ctx = elements.canvas.getContext('2d');
        elements.canvas.width = elements.webcam.videoWidth;
        elements.canvas.height = elements.webcam.videoHeight;

        ctx.translate(elements.canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(elements.webcam, 0, 0);

        const dataUrl = elements.canvas.toDataURL('image/jpeg', 0.7);
        return dataUrl.split(',')[1];
    },

    captureWithFlash() {
        UI.triggerFlash();
        return this.captureFrame();
    }
};

// ============================================
// UI MODULE
// ============================================

const UI = {
    setStatus(status, text) {
        elements.statusDot.className = 'status-dot ' + status;
        elements.statusText.textContent = text;
    },

    triggerFlash() {
        elements.flash.classList.add('flash');
        setTimeout(() => elements.flash.classList.remove('flash'), 150);
    },

    setOutputText(text, isWaiting = false) {
        elements.roastText.textContent = text;
        elements.roastText.classList.toggle('waiting', isWaiting);
    },

    setButtonState(enabled, text) {
        elements.actionBtn.disabled = !enabled;
        elements.actionBtn.textContent = text;
    },

    updateForMode(mode) {
        const config = MODES[mode];
        elements.title.textContent = config.title;
        elements.subtitle.textContent = config.subtitle;
        elements.outputLabel.textContent = config.outputLabel;
        this.setOutputText(config.waitingText, true);

        // Update button style
        elements.actionBtn.classList.toggle('attenborough-mode', mode === 'attenborough');

        elements.modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Show/Hide Enable Generic Toggle for Attenborough mode only
        elements.toggleContainer.classList.toggle('visible', mode === 'attenborough');

        // Apply mode-specific styling to buttons if needed
        elements.actionBtn.className = ''; // Reset
        if (mode === 'attenborough') elements.actionBtn.classList.add('attenborough-mode');
        if (mode === 'slam_poet') elements.actionBtn.classList.add('slam-mode');
    },

    setStreaming(isStreaming) {
        elements.liveIndicator.classList.toggle('active', isStreaming);
        elements.actionBtn.classList.toggle('streaming', isStreaming);
    }
};

// ============================================
// GEMINI API MODULE
// ============================================

const GeminiAPI = {
    async connect() {
        UI.setStatus('connecting', 'Connecting to Gemini...');

        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const modeConfig = MODES[state.currentMode];

            const config = {
                responseModalities: [Modality.AUDIO],
                outputAudioTranscription: {},
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: modeConfig.voice
                        }
                    }
                },
                generationConfig: {
                    thinkingConfig: { thinkingBudget: 0 }
                },
                systemInstruction: modeConfig.systemPrompt
            };

            state.session = await ai.live.connect({
                model: MODEL,
                config: config,
                callbacks: {
                    onopen: this.handleOpen.bind(this),
                    onmessage: this.handleMessage.bind(this),
                    onerror: this.handleError.bind(this),
                    onclose: this.handleClose.bind(this)
                }
            });

        } catch (err) {
            console.error('Failed to connect:', err);
            UI.setStatus('error', 'Failed to connect: ' + err.message);
        }
    },

    disconnect() {
        if (state.session) {
            state.session.close();
            state.session = null;
        }
    },

    handleOpen() {
        console.log('Connected to Gemini Live API');
        UI.setStatus('connected', 'Ready!');
        const config = MODES[state.currentMode];
        UI.setButtonState(true, config.buttonReady);
    },

    handleMessage(message) {
        // Process audio chunks
        if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.mimeType?.startsWith('audio/')) {
                    AudioPlayer.playChunk(part.inlineData.data);
                }
                if (part.text) {
                    state.currentText += part.text;
                    UI.setOutputText(state.currentText);
                }
            }
        }

        // Process transcription
        if (message.serverContent?.outputTranscription?.text) {
            state.currentText += message.serverContent.outputTranscription.text;
            UI.setOutputText(state.currentText);
        }

        // Handle turn completion - re-enable button for all modes
        if (message.serverContent?.turnComplete) {
            const config = MODES[state.currentMode];
            UI.setButtonState(true, config.buttonReady);
            UI.setStreaming(false);
        }
    },

    handleError(error) {
        console.error('Gemini error:', error);
        UI.setStatus('error', 'Connection error');
        stopStreaming();
    },

    handleClose(event) {
        console.log('Connection closed:', event.reason);
        UI.setStatus('error', 'Disconnected');
        UI.setButtonState(false, 'Disconnected');
        stopStreaming();
    },

    sendImage(imageBase64, prompt = '') {
        if (!state.session) return;

        state.session.sendClientContent({
            turns: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                    ...(prompt ? [{ text: prompt }] : [])
                ]
            }],
            turnComplete: true
        });
    },

    sendRealtimeFrame(imageBase64) {
        if (!state.session) return;

        state.session.sendRealtimeInput({
            media: {
                mimeType: 'image/jpeg',
                data: imageBase64
            }
        });
    },

    sendText(text) {
        if (!state.session) return;
        state.session.sendClientContent({
            turns: [{
                role: 'user',
                parts: [{ text: text }]
            }],
            turnComplete: true
        });
    }
};

// ============================================
// MODE HANDLERS
// ============================================

/** Handle Pose Roast action */
async function handleRoast() {
    if (!state.session) return;

    AudioPlayer.init();

    state.currentText = '';
    UI.setOutputText('Analyzing your pose...', true);
    UI.setButtonState(false, MODES.roast.buttonActive);

    try {
        const imageBase64 = Webcam.captureWithFlash();
        GeminiAPI.sendImage(imageBase64, 'Roast this pose!');
    } catch (err) {
        console.error('Failed to send:', err);
        UI.setOutputText('Failed to send image. Please try again.');
        UI.setButtonState(true, MODES.roast.buttonReady);
    }
}

/** Prompts for variety in narration */
const ATTENBOROUGH_PROMPTS = [
    'Continue observing and narrating what you see.',
    'Describe any new movements or behaviors you notice.',
    'What fascinating details can you observe now?',
    'Share your observations about the creature\'s current state.',
    'What is our subject doing now? Narrate the scene.',
    'Continue your nature documentary narration.',
    'Observe and describe what unfolds before you.'
];



const GENERIC_PROMPTS = [
    'Reflect on how nature unfolds in this fluorescent-lit ecosystem.',
    'Contemplate the delicate balance of this corporate habitat.',
    'Observe the subtle rhythms of the tech worker\'s existence.',
    'Consider the mysterious rituals that govern this tribe.',
    'Musings on the adaptation of this species to indoor life.'
];



const SLAM_POETS_PROMPTS = [
    'The wifi is weak, like your resolve. Speak on it.',
    'Rhyme about the latency of the human condition.',
    'You are stuck in a meeting that could have been an email. Poetize.',
    'Metaphor about your deprecated codebase. Now.',
    'Judge the lighting like a failed product launch.',
    'Is this real? Or is it just a simulation on a staging server? Discuss.'
];

/** Get a random narration prompt */
function getRandomPrompt() {
    if (state.currentMode === 'slam_poet') {
        return SLAM_POETS_PROMPTS[Math.floor(Math.random() * SLAM_POETS_PROMPTS.length)];
    }
    const list = state.isGenericMode ? GENERIC_PROMPTS : ATTENBOROUGH_PROMPTS;
    return list[Math.floor(Math.random() * list.length)];
}

/** Handle Attenborough single observation */
async function handleAttenborough() {
    if (!state.session) return;

    AudioPlayer.init();

    state.currentText = '';
    UI.setOutputText('Observing...', true);
    UI.setButtonState(false, MODES.attenborough.buttonActive);
    UI.setStreaming(true);

    try {
        const imageBase64 = Webcam.captureWithFlash();
        const prompt = state.isGenericMode
            ? 'IGNORE IMAGE. Invent a corporate nature scene. One sentence only.'
            : 'Narrate what you see. One short sentence only.';
        GeminiAPI.sendImage(imageBase64, prompt);
    } catch (err) {
        console.error('Failed to send:', err);
        UI.setOutputText('Failed to send image. Please try again.');
        UI.setButtonState(true, MODES.attenborough.buttonReady);
        UI.setStreaming(false);
    }
}

/** Handle Slam Poet single poem */
async function handleSlamPoet() {
    if (!state.session) return;

    AudioPlayer.init();

    state.currentText = '';
    UI.setOutputText('The poet is composing...', true);
    UI.setButtonState(false, MODES.slam_poet.buttonActive);
    UI.setStreaming(true);

    try {
        const imageBase64 = Webcam.captureWithFlash();
        GeminiAPI.sendImage(imageBase64, 'Look at this scene and deliver ONE short poem (4 lines max) about it.');
    } catch (err) {
        console.error('Failed to send:', err);
        UI.setOutputText('The muse has abandoned us. Please try again.');
        UI.setButtonState(true, MODES.slam_poet.buttonReady);
        UI.setStreaming(false);
    }
}

/** Stop streaming indicator (no longer used for intervals, but kept for cleanup) */
function stopStreaming() {
    state.isStreaming = false;
    UI.setStreaming(false);
}

/** Handle action button click */
async function handleAction() {
    if (state.currentMode === 'roast') {
        handleRoast();
    } else if (state.currentMode === 'attenborough') {
        handleAttenborough();
    } else if (state.currentMode === 'slam_poet') {
        handleSlamPoet();
    }
}

/** Switch between modes */
async function switchMode(mode) {
    if (mode === state.currentMode) return;

    // Stop any active streaming
    stopStreaming();

    // Disconnect current session
    GeminiAPI.disconnect();

    // Update state and UI
    state.currentMode = mode;
    state.currentText = '';
    UI.updateForMode(mode);
    UI.setButtonState(false, 'Loading...');

    // Reconnect with new mode config
    await GeminiAPI.connect();
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    // Set up mode switcher
    elements.modeButtons.forEach(btn => {
        btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // Set up action button
    elements.actionBtn.addEventListener('click', handleAction);

    // Initialize UI for default mode
    UI.updateForMode(state.currentMode);

    // Start webcam
    const webcamOk = await Webcam.start();

    // Generic Mode Toggle Handler
    elements.toggleSwitch.addEventListener('change', (e) => {
        state.isGenericMode = e.target.checked;
        if (state.session && state.currentMode === 'attenborough') {
            if (state.isGenericMode) {
                GeminiAPI.sendText('SYSTEM UPDATE: BLIND MODE. IGNORE VIDEO. Invent generic humorous narration about Google employees. Keep it SHORT.');
            } else {
                GeminiAPI.sendText('SYSTEM UPDATE: VISUAL MODE. Describe exactly what you see in the video feed.');
            }
        }
    });

    // Connect to Gemini
    if (webcamOk) {
        await GeminiAPI.connect();
    }
}

init();
