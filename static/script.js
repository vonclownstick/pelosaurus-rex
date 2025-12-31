// Global state
let currentRoutine = null;
let currentSegmentIndex = 0;
let timerInterval = null;
let startTime = null;
let pauseTimestamp = null;
let isPaused = false;
let wakeLock = null;
let noSleep = null;
let routines = [];
let totalDuration = 0;
let elapsedTime = 0;
let lastSpokenSecond = -1;
let speechInitialized = false;
let selectedVoice = null;

// Constants
const PIN_EXPIRY_DAYS = 7;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Initialize NoSleep
    if (typeof NoSleep !== 'undefined') {
        noSleep = new NoSleep();
    }

    // Check auth
    if (checkAuth()) {
        loadDashboard();
    } else {
        showView('view-login');
    }
    
    initKeypad();
    initLogout();
    initSpeechResume();
    
    // Wait for voices to load
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = selectVoice;
    }
});

function checkAuth() {
    try {
        const authData = JSON.parse(localStorage.getItem('auth_token'));
        if (authData && authData.expiry > Date.now()) {
            return true;
        }
    } catch (e) {
        console.error('Auth check failed:', e);
    }
    return false;
}

// Variable to store the wake lock sentinel
let wakeLock = null;

// Function to request the wake lock
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active!');
            
            // Listen for release
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock released');
                wakeLock = null; // Important: Clear sentinel so we can re-request
            });
        } else {
            console.warn('Wake Lock API not supported');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

// Handle iOS Safari speech resumption and display catch-up
function initSpeechResume() {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            // Force display update to snap to correct time
            if (timerInterval && !isPaused) {
                updateDisplay();
            }

            // Re-request wake lock if we are in a workout
            if (timerInterval && !isPaused && !wakeLock) {
                await requestWakeLock();
            }

            // Resume speech
            if ('speechSynthesis' in window && window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
        }
    });
}

// View switching
function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(viewId).classList.add('active');
}

// ===== LOGIN VIEW =====
function initKeypad() {
    const pinInput = document.getElementById('pin-input');
    const keyButtons = document.querySelectorAll('.key-btn');
    const errorMsg = document.getElementById('login-error');
    let pin = '';

    keyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Haptic feedback
            try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){}

            const value = button.dataset.value;

            if (value === 'clear') {
                pin = '';
                pinInput.value = '';
                errorMsg.textContent = '';
            } else if (value === 'enter') {
                if (pin.length > 0) {
                    authenticate(pin);
                }
            } else {
                if (pin.length < 4) {
                    pin += value;
                    pinInput.value = pin;
                }
            }
        });
    });
// ... (rest of function)

    async function authenticate(enteredPin) {
        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ pin: enteredPin })
            });

            if (response.ok) {
                // Store auth token
                const expiry = Date.now() + (PIN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
                localStorage.setItem('auth_token', JSON.stringify({ expiry: expiry }));

                pin = '';
                pinInput.value = '';
                errorMsg.textContent = '';
                loadDashboard();
            } else {
                errorMsg.textContent = 'Invalid PIN. Try again.';
                pin = '';
                pinInput.value = '';
            }
        } catch (error) {
            errorMsg.textContent = 'Connection error. Try again.';
            console.error('Auth error:', error);
        }
    }
}

// ===== DASHBOARD VIEW =====
async function loadDashboard() {
    showView('view-dashboard');

    try {
        const response = await fetch('/api/routines');
        routines = await response.json();
        renderRoutines();
    } catch (error) {
        console.error('Failed to load routines:', error);
    }
}

function renderRoutines() {
    const container = document.getElementById('routines-list');
    container.innerHTML = '';

    // Get history
    let history = {};
    try {
        history = JSON.parse(localStorage.getItem('workout_history') || '{}');
    } catch (e) {
        console.error('History parse error', e);
    }

    routines.forEach(routine => {
        const card = document.createElement('div');
        card.className = `routine-card intensity-${routine.intensity}`;

        const totalSeconds = routine.segments.reduce((sum, seg) => sum + seg.duration, 0);
        const minutes = Math.floor(totalSeconds / 60);

        // Check history
        let historyHtml = '';
        if (history[routine.id]) {
            historyHtml = `<div class="history-tag">✅ Completed ${history[routine.id]}</div>`;
        }

        card.innerHTML = `
            <h3>${routine.title}</h3>
            <p>${routine.description}</p>
            <div class="routine-meta">
                <span>${minutes} minutes</span>
                <span>${routine.segments.length} segments</span>
            </div>
            ${historyHtml}
        `;

        card.addEventListener('click', () => {
            try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){}
            loadRoutine(routine.id);
        });
        container.appendChild(card);
    });
}

function initLogout() {
    document.getElementById('logout-btn').addEventListener('click', () => {
        try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){}
        showView('view-login');
    });
}

// ===== WORKOUT VIEW =====
// ... (start of loadRoutine)

    currentRoutine = routines.find(r => r.id === routineId);
    if (!currentRoutine) return;

    // Reset state
    currentSegmentIndex = 0;
    isPaused = false;
    startTime = null;
    pauseTimestamp = null;
    elapsedTime = 0;
    lastSpokenSecond = -1;

    // Calculate total duration
    totalDuration = currentRoutine.segments.reduce((sum, seg) => sum + seg.duration, 0);

    // Update UI
    document.getElementById('workout-title').textContent = currentRoutine.title;
    document.getElementById('phase-name').textContent = 'Ready to Start';
    document.getElementById('timer').textContent = formatTime(currentRoutine.segments[0].duration);
    document.getElementById('phase-instruction').textContent = currentRoutine.segments[0].instruction;
    document.getElementById('next-phase').textContent =
        currentRoutine.segments.length > 1 ? currentRoutine.segments[1].phase : 'Finish';

    // Show/hide buttons
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('pause-btn').style.display = 'none';
    document.getElementById('resume-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'none';

    // Render timeline
    renderTimeline();

    // Setup controls
    initWorkoutControls();

    showView('view-workout');
}

function renderTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    currentRoutine.segments.forEach((segment, index) => {
        const segmentEl = document.createElement('div');
        segmentEl.className = 'timeline-segment';
        segmentEl.style.flex = segment.duration;
        segmentEl.style.backgroundColor = segment.color;
        segmentEl.textContent = segment.phase;

        if (index === 0) {
            segmentEl.classList.add('active');
        }

        timeline.appendChild(segmentEl);
    });

    updateSegmentCounter();
}

function initWorkoutControls() {
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const stopBtn = document.getElementById('stop-btn');
    const backBtn = document.getElementById('back-btn');

    // Remove old listeners by cloning
    [startBtn, pauseBtn, resumeBtn, stopBtn, backBtn].forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
    });

    // Add new listeners
    document.getElementById('start-btn').addEventListener('click', () => { try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){} startWorkout(); });
    document.getElementById('pause-btn').addEventListener('click', () => { try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){} pauseWorkout(); });
    document.getElementById('resume-btn').addEventListener('click', () => { try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){} resumeWorkout(); });
    document.getElementById('stop-btn').addEventListener('click', () => { try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){} stopWorkout(); });
    document.getElementById('back-btn').addEventListener('click', () => {
        try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){}
        if (timerInterval) {
            if (confirm('Are you sure you want to exit? Your progress will be lost.')) {
                stopWorkout();
                loadDashboard();
            }
        } else {
            loadDashboard();
        }
    });
}

async function startWorkout() {
    // Prime speech synthesis
    primeSpeechSynthesis();

    // Enable NoSleep (Nuclear fallback)
    if (noSleep) {
        try {
            noSleep.enable();
            console.log('NoSleep enabled');
        } catch (e) {
            console.warn('NoSleep failed:', e);
        }
    }

    // Request modern Wake Lock
    await requestWakeLock();

    // Initialize timing
    startTime = Date.now();
    currentSegmentIndex = 0;
    elapsedTime = 0;
    lastSpokenSecond = -1;

    // Show/hide buttons
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('pause-btn').style.display = 'block';
    document.getElementById('stop-btn').style.display = 'block';

    // Start first segment
    speak(`Starting ${currentRoutine.segments[0].phase}`);

    // Update immediately
    updateDisplay();

    // Start timer loop (1000ms "Logic Tick")
    timerInterval = setInterval(updateTimer, 1000);
}

function pauseWorkout() {
    if (!isPaused) {
        isPaused = true;
        pauseTimestamp = Date.now();

        document.getElementById('pause-btn').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'block';

        window.speechSynthesis.cancel();
        
        // Release wake lock on pause to save battery
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    }
}

function resumeWorkout() {
    if (isPaused) {
        isPaused = false;

        // Calculate pause duration and shift start time
        const pauseDuration = Date.now() - pauseTimestamp;
        startTime += pauseDuration;
        pauseTimestamp = null;

        document.getElementById('resume-btn').style.display = 'none';
        document.getElementById('pause-btn').style.display = 'block';
        
        // Re-request wake lock
        requestWakeLock();
    }
}

function stopWorkout() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    isPaused = false;
    window.speechSynthesis.cancel();

    // Release wake lock and NoSleep
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
    if (noSleep) {
        noSleep.disable();
        console.log('NoSleep disabled');
    }

    // Reset UI
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('pause-btn').style.display = 'none';
    document.getElementById('resume-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'none';

    currentSegmentIndex = 0;
    renderTimeline();
}

function updateTimer() {
    if (isPaused) return;

    // Calculate elapsed time
    elapsedTime = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsedTime / 1000);

    // Robust Phase Check: Find which segment we are in
    let accumulatedTime = 0;
    let foundSegment = false;

    for (let i = 0; i < currentRoutine.segments.length; i++) {
        const segDuration = currentRoutine.segments[i].duration;
        if (elapsedSeconds < accumulatedTime + segDuration) {
            // We are in this segment
            if (currentSegmentIndex !== i) {
                // Phase change detected (possibly skipped multiple)
                currentSegmentIndex = i;
                const seg = currentRoutine.segments[i];
                speak(`Starting ${seg.phase}`);
                updateTimeline();
                updateSegmentCounter();
            }
            foundSegment = true;
            break;
        }
        accumulatedTime += segDuration;
    }

    if (!foundSegment && elapsedSeconds >= totalDuration) {
        finishWorkout();
        return;
    }

    updateDisplay();
    
    // Audio cues logic
    const segmentStartTime = accumulatedTime; // accumulatedTime is start of current segment after loop break? 
    // Wait, if I break, accumulatedTime is start of current segment.
    // If I don't break, accumulatedTime is total duration.
    // I need to be careful with scope.
    // Let's re-calculate logic for audio cues to be safe.
}

function updateDisplay() {
    if (!currentRoutine) return;
    
    const elapsedSeconds = Math.floor(elapsedTime / 1000);
    
    // Find current segment details again for display
    let acc = 0;
    let seg = null;
    let segIdx = 0;
    
    for (let i = 0; i < currentRoutine.segments.length; i++) {
        if (elapsedSeconds < acc + currentRoutine.segments[i].duration) {
            seg = currentRoutine.segments[i];
            segIdx = i;
            break;
        }
        acc += currentRoutine.segments[i].duration;
    }
    
    if (!seg) return; // Should be handled by finishWorkout

    const segmentElapsed = elapsedSeconds - acc;
    const segmentRemaining = seg.duration - segmentElapsed;

    // Update Text
    document.getElementById('timer').textContent = formatTime(segmentRemaining);
    document.getElementById('phase-name').textContent = seg.phase;
    document.getElementById('phase-instruction').textContent = seg.instruction;

    // Audio Cues (Check if we haven't spoken for this second)
    if (segmentElapsed !== lastSpokenSecond) {
        lastSpokenSecond = segmentElapsed;
        handleAudioCues(segmentRemaining, segIdx);
    }

    // Update Progress Bar
    const percentage = (elapsedSeconds / totalDuration) * 100;
    document.getElementById('timeline-cursor').style.left = `${Math.min(percentage, 100)}%`;
    document.getElementById('total-progress').textContent = `${Math.floor(percentage)}%`;
}

function handleAudioCues(remainingTime, currentIdx) {
    const nextSegmentIndex = currentIdx + 1;
    const nextSegment = nextSegmentIndex < currentRoutine.segments.length
        ? currentRoutine.segments[nextSegmentIndex]
        : null;

    if (remainingTime === 30 && nextSegment) {
        speak(`In 30 seconds, ${nextSegment.phase}`);
    }

    if (remainingTime <= 5 && remainingTime > 0) {
        speak(remainingTime.toString());
    }
}

function updateTimeline() {
    const segments = document.querySelectorAll('.timeline-segment');
    segments.forEach((seg, index) => {
        seg.classList.toggle('active', index === currentSegmentIndex);
    });
}

function updateProgress() {
    // Merged into updateDisplay
}

function updateSegmentCounter() {
    document.getElementById('segment-counter').textContent =
        `Segment ${currentSegmentIndex + 1}/${currentRoutine.segments.length}`;

    const nextSegmentIndex = currentSegmentIndex + 1;
    if (nextSegmentIndex < currentRoutine.segments.length) {
        document.getElementById('next-phase').textContent =
            currentRoutine.segments[nextSegmentIndex].phase;
    } else {
        document.getElementById('next-phase').textContent = 'Finish';
    }
}

function finishWorkout() {
    clearInterval(timerInterval);
    timerInterval = null;

    document.getElementById('timer').textContent = '00:00';
    document.getElementById('phase-name').textContent = 'Complete!';
    document.getElementById('phase-instruction').textContent = 'Great job!';

    speak('Workout complete! Great job!');

    // Save History
    try {
        const history = JSON.parse(localStorage.getItem('workout_history') || '{}');
        const date = new Date().toLocaleDateString();
        history[currentRoutine.id] = date;
        localStorage.setItem('workout_history', JSON.stringify(history));
    } catch (e) {
        console.error('Save history failed', e);
    }

    // Release locks
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
    if (noSleep) {
        noSleep.disable();
    }

    document.getElementById('pause-btn').style.display = 'none';
    document.getElementById('resume-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'none';
    document.getElementById('start-btn').style.display = 'block';
}

// ===== UTILITIES =====
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function selectVoice() {
    if (!('speechSynthesis' in window)) return;
    
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;

    console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));

    // Priority System:
    // 1. "Samantha" (iOS Premium/Enhanced usually)
    // 2. "Siri" (Newer iOS voices)
    // 3. "Daniel" (High quality UK, popular fallback)
    // 4. Any "Enhanced" or "Premium" voice
    // 5. System Default
    // 6. First English Voice

    let bestVoice = 
        voices.find(v => v.name.includes('Samantha')) ||
        voices.find(v => v.name.includes('Siri') && v.lang.startsWith('en')) ||
        voices.find(v => v.name === 'Daniel') ||
        voices.find(v => (v.name.includes('Enhanced') || v.name.includes('Premium')) && v.lang.startsWith('en')) ||
        voices.find(v => v.default && v.lang.startsWith('en')) ||
        voices.find(v => v.lang.startsWith('en'));

    selectedVoice = bestVoice || voices[0];
    console.log('Selected voice:', selectedVoice ? selectedVoice.name : 'None');
}

function primeSpeechSynthesis() {
    // iOS Safari requires speech to be triggered from a user gesture
    if ('speechSynthesis' in window && !speechInitialized) {
        // Ensure voice is selected
        if (!selectedVoice) selectVoice();

        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
        speechInitialized = true;
        console.log('Speech synthesis primed');
    }
}

function speak(text) {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        // Small delay for iOS stability
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            } else {
                utterance.lang = 'en-US';
            }

            utterance.onerror = (e) => console.error('Speech error:', e);
            window.speechSynthesis.speak(utterance);
        }, 50);
    }
}
