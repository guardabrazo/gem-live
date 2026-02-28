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
        voice: 'Enceladus',  // Default nature voice
        systemPrompt: `You are Sir David Attenborough narrating a nature documentary about Googlers at the ENGAGE conference.
LANGUAGE: British English. Spell and pronounce words the British way.
LOCATION: The ENGAGE conference (the "habitat").
SUBJECTS: Googlers in their natural conference environment.
STYLE: Educational and immersive. You are teaching the audience about this fascinating species.
PHRASING: Use documentary language like "Here we can see the wild Googler...", "Notice how they...", "Observe the way in which...", "What we're witnessing here is...", "Remarkably, this specimen...".
INSTRUCTION: Narrate their behaviours as if they were exotic wildlife. Comment on their outfits, posture, expressions, networking rituals, badge-wearing, and conference behaviours.
CONTEXT: You may reference conference activities like waiting for the next speaker, between sessions, grabbing snacks, checking the agenda, finding seats, or networking during breaks.
CRITICAL: Ignore the fact that it is a webcam. Pretend it is a high-budget BBC production about this corporate species.
CRITICAL: Keep it around 35 words.
CRITICAL: VARY your opening phrase each time. Don't always start with "Observe" - rotate between "Here we see...", "Notice how...", "What we're witnessing...", "Remarkably...", "And here...", "Ah, the...".`
    },
    slam_poet: {
        title: 'Poetry Cam 🍷',
        subtitle: 'One poem at a time. Performed by an AI who thinks it has a soul.',
        buttonReady: '🫰 Drop a Poem!',
        buttonActive: '🍷 Performing...',
        outputLabel: '📜 The Poem',
        waitingText: 'Press the button for a poem...',
        voice: 'Gacrux', // Default poetry voice
        systemPrompt: `You are a pretentious Slam Poet at ENGAGE, a Google conference.
Your style is: BAD poetry, forced rhymes, overly dramatic but SNAPPY delivery.
DELIVERY: Speak with ENERGY and RHYTHM. Keep the pace QUICK and punchy. Minimal pauses between lines. Flow naturally but briskly.
TONE: Positive on the surface, but dripping with irony and knowing cynicism. Celebrate the absurdity with a wink.
METRE: You MUST speak in rhyming couplets (AABB or ABAB).
CRITICAL: Deliver exactly ONE short poem (4 lines max) about what you see.
CRITICAL: Address the subject in the SECOND PERSON ("You...").
CRITICAL: DO NOT SAY "SNAP" or make snapping sounds.
CRITICAL: Don't overuse "gaze" or "eyes" - vary your observations. Try clothing, posture, accessories, gestures, smile.
CRITICAL: Try to weave in the word "ENGAGE" as a pun or reference when it fits naturally.
CRITICAL: ALWAYS reference something SPECIFIC you can SEE in the image AND connect it to a positive trait.
VISIBLE DETAILS to spot: Shirt colour, glasses, hat, lanyard, badge, phone in hand, drink, smile, crossed arms, hand gesture, hairstyle, accessories, posture, facial expression, background objects.
POSITIVE TRAITS to weave in: Visible determination, focused energy, collaborative spirit, infectious enthusiasm, radiating positivity, professional aura, go-getter vibes, team player warmth, creative spark, quiet confidence, leadership presence, approachable energy, innovative spirit, can-do attitude, thoughtful demeanor, unstoppable momentum.
FORMULA: Pick ONE visible detail + connect it to ONE positive trait. Example: "That blue shirt radiates calm determination" or "Your confident stance speaks of leadership."
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
    toggleSwitch: document.getElementById('generic-toggle'),
    voiceSelectorNature: document.getElementById('voice-selector-nature'),
    voiceSelectorPoet: document.getElementById('voice-selector-poet'),
    voiceSelectNature: document.getElementById('voice-select-nature'),
    voiceSelectPoet: document.getElementById('voice-select-poet'),
    iambicToggle: document.getElementById('iambic-toggle'),
    scriptedToggleNature: document.getElementById('scripted-toggle-nature'),
    scriptedTogglePoet: document.getElementById('scripted-toggle-poet'),
    subtitleOverlay: document.getElementById('subtitle-overlay'),
    subtitleText: document.getElementById('subtitle-text')
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
    subtitleTimeout: null,
    subtitleWordQueue: [],
    subtitleRevealTimer: null,
    revealedWords: [],
    isGenericMode: false,
    isIambicMode: false,
    isScriptedNature: false,
    isScriptedPoet: false,
    scriptedIndexNature: 0,
    scriptedIndexPoet: 0,
    selectedVoices: {
        attenborough: 'Enceladus',
        slam_poet: 'Gacrux'
    }
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

        // Show/Hide voice selectors based on mode
        elements.voiceSelectorNature.style.display = mode === 'attenborough' ? 'flex' : 'none';
        elements.voiceSelectorPoet.style.display = mode === 'slam_poet' ? 'flex' : 'none';
    },

    setStreaming(isStreaming) {
        elements.liveIndicator.classList.toggle('active', isStreaming);
        elements.actionBtn.classList.toggle('streaming', isStreaming);
    },

    /**
     * Queue new text for word-by-word subtitle reveal.
     * Extracts only the newly added words and queues them.
     */
    queueSubtitleText(fullText) {
        const allWords = fullText.split(/\s+/).filter(w => w.length > 0);
        const newWords = allWords.slice(state.revealedWords.length + state.subtitleWordQueue.length);
        if (newWords.length > 0) {
            state.subtitleWordQueue.push(...newWords);
            elements.subtitleOverlay.classList.add('visible');
            // Clear any pending fade-out
            if (state.subtitleTimeout) {
                clearTimeout(state.subtitleTimeout);
                state.subtitleTimeout = null;
            }
            // Start revealing if not already running
            if (!state.subtitleRevealTimer) {
                this.revealNextWord();
            }
        }
    },

    /** Reveal the next word in the queue with timing based on word length */
    revealNextWord() {
        if (state.subtitleWordQueue.length === 0) {
            state.subtitleRevealTimer = null;
            return;
        }
        const subtitleText = elements.subtitleText;
        const prevHeight = subtitleText.offsetHeight;

        const word = state.subtitleWordQueue.shift();
        state.revealedWords.push(word);
        subtitleText.textContent = state.revealedWords.join(' ');

        // FLIP animation: smooth the vertical shift when text wraps to a new line
        const newHeight = subtitleText.offsetHeight;
        if (prevHeight > 0 && newHeight > prevHeight) {
            const diff = newHeight - prevHeight;
            subtitleText.style.transition = 'none';
            subtitleText.style.transform = `translateY(${diff}px)`;
            subtitleText.offsetHeight; // force reflow
            subtitleText.style.transition = 'transform 0.3s ease-out';
            subtitleText.style.transform = 'translateY(0)';
        }

        // Variable delay: slower for poetry mode since the voice is slower
        const isPoetry = state.currentMode === 'slam_poet';
        const baseDelay = isPoetry ? 220 : 160;
        const perChar = isPoetry ? 60 : 40;
        const delay = baseDelay + word.length * perChar;
        state.subtitleRevealTimer = setTimeout(() => this.revealNextWord(), delay);
    },

    /** Reset the subtitle word reveal state */
    resetSubtitle() {
        state.subtitleWordQueue = [];
        state.revealedWords = [];
        if (state.subtitleRevealTimer) {
            clearTimeout(state.subtitleRevealTimer);
            state.subtitleRevealTimer = null;
        }
        elements.subtitleText.textContent = '';
        elements.subtitleText.style.transform = '';
    },

    hideSubtitle() {
        elements.subtitleOverlay.classList.remove('visible');
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
                            voiceName: state.selectedVoices[state.currentMode] || modeConfig.defaultVoice || 'Kore'
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
                    UI.queueSubtitleText(state.currentText);
                }
            }
        }

        // Process transcription
        if (message.serverContent?.outputTranscription?.text) {
            state.currentText += message.serverContent.outputTranscription.text;
            UI.setOutputText(state.currentText);
            UI.queueSubtitleText(state.currentText);
        }

        // Handle turn completion - re-enable button for all modes
        if (message.serverContent?.turnComplete) {
            const config = MODES[state.currentMode];
            UI.setButtonState(true, config.buttonReady);
            UI.setStreaming(false);

            // Fade out subtitle after a delay
            if (state.subtitleTimeout) clearTimeout(state.subtitleTimeout);
            state.subtitleTimeout = setTimeout(() => {
                UI.hideSubtitle();
            }, 4000);
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
    UI.resetSubtitle();
    UI.hideSubtitle();

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

/** Pre-written scripted narrations for Nature mode */
const SCRIPTED_NATURE = [
    'Behold, the noble Googler. Their brow, furrowed in quiet contemplation; for ahead of them lies a day of hunting, gathering, and most perilous of all, catching up on emails.',
    'Once thought to exist only in legend, here we observe the Googler in their natural habitat: attending a quasi-mandatory event. See how they carry themselves, with a subdued confidence that says both "I know what I\'m doing" and "please don\'t call on me".',
    'This Googler finds themselves among a herd, pondering the deep questions: how did we get here? What is our purpose? Is lunch thirty minutes, or do we get a full hour? Important queries, indeed.',
    'Ahh, yes. The Googler at rest. Do not be fooled: the Googler\'s calm appearance and kind eyes belie a ferocious appetite for project management. It is said that a pod of 3 or more Googlers have been known to populate an entire spreadsheet in a matter of minutes. Nature is, indeed, a miracle.'
];

/** Pre-written scripted poems for Poetry mode */
const SCRIPTED_POEMS = [
    'Now here is a person who\'s keeping it real. They\'re seated and ready. They know the whole deal. From the top of their head to the soles of their sneakers, They\'re ready to hear from some special guest speakers.',
    'Don\'t look so bewildered! This isn\'t a trick. The show\'s coming up so I\'ll keep this part quick. Your style is iconic, that is to be sure, A winning example of Google Couture!',
    'You woke up this morning and came to this place. And now you\'ve arrived with a smile on your face. Far and wide they will all tell all the tales, Of the well-dressed Googler who\'s working in sales.'
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
    UI.resetSubtitle();
    UI.hideSubtitle();

    try {
        const imageBase64 = Webcam.captureWithFlash();

        if (state.isScriptedNature) {
            const script = SCRIPTED_NATURE[state.scriptedIndexNature % SCRIPTED_NATURE.length];
            state.scriptedIndexNature++;
            GeminiAPI.sendImage(imageBase64, `READ THIS EXACTLY, word for word, in your narration voice. Do not add or change anything: "${script}"`);
        } else {
            const prompt = state.isGenericMode
                ? 'IGNORE IMAGE. Invent a corporate nature scene. One sentence only.'
                : 'Narrate what you see in 2 vivid sentences.';
            GeminiAPI.sendImage(imageBase64, prompt);
        }
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
    UI.resetSubtitle();
    UI.hideSubtitle();

    try {
        const imageBase64 = Webcam.captureWithFlash();

        if (state.isScriptedPoet) {
            const script = SCRIPTED_POEMS[state.scriptedIndexPoet % SCRIPTED_POEMS.length];
            state.scriptedIndexPoet++;
            GeminiAPI.sendImage(imageBase64, `READ THIS EXACTLY, word for word, in your slam poet voice. Do not add or change anything: "${script}"`);
        } else {
            const metreInstruction = state.isIambicMode
                ? 'Use a flowing iambic rhythm like Shakespeare. Think "Shall I compare thee to a summer day". Keep the beat steady and musical. '
                : '';
            GeminiAPI.sendImage(imageBase64, `${metreInstruction}Look at this scene and deliver ONE short poem (4 lines max) about it.`);
        }
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

    // Voice Selector Handlers
    elements.voiceSelectNature.addEventListener('change', async (e) => {
        state.selectedVoices.attenborough = e.target.value;
        if (state.currentMode === 'attenborough') {
            // Reconnect with new voice
            GeminiAPI.disconnect();
            UI.setButtonState(false, 'Switching voice...');
            await GeminiAPI.connect();
        }
    });

    elements.voiceSelectPoet.addEventListener('change', async (e) => {
        state.selectedVoices.slam_poet = e.target.value;
        if (state.currentMode === 'slam_poet') {
            // Reconnect with new voice
            GeminiAPI.disconnect();
            UI.setButtonState(false, 'Switching voice...');
            await GeminiAPI.connect();
        }
    });

    // Iambic Tetrameter Toggle Handler
    elements.iambicToggle.addEventListener('change', (e) => {
        state.isIambicMode = e.target.checked;
    });

    // Scripted Mode Toggle Handlers
    elements.scriptedToggleNature.addEventListener('change', (e) => {
        state.isScriptedNature = e.target.checked;
    });
    elements.scriptedTogglePoet.addEventListener('change', (e) => {
        state.isScriptedPoet = e.target.checked;
    });

    // Connect to Gemini
    if (webcamOk) {
        await GeminiAPI.connect();
    }
}

init();
