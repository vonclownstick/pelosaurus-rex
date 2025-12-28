// Global state
let currentRoutine = null;
let currentSegmentIndex = 0;
let timerInterval = null;
let startTime = null;
let pauseTimestamp = null;
let isPaused = false;
let wakeLock = null;
let routines = [];
let totalDuration = 0;
let elapsedTime = 0;
let lastSpokenSecond = -1;
let speechInitialized = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initKeypad();
    initLogout();
    initSpeechResume();
});

// Handle iOS Safari speech resumption after background/foreground
function initSpeechResume() {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && 'speechSynthesis' in window) {
            // Resume speech synthesis when app comes back to foreground
            if (window.speechSynthesis.paused) {
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
        button.addEventListener('click', () => {
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

    routines.forEach(routine => {
        const card = document.createElement('div');
        card.className = `routine-card intensity-${routine.intensity}`;

        const totalSeconds = routine.segments.reduce((sum, seg) => sum + seg.duration, 0);
        const minutes = Math.floor(totalSeconds / 60);

        card.innerHTML = `
            <h3>${routine.title}</h3>
            <p>${routine.description}</p>
            <div class="routine-meta">
                <span>${minutes} minutes</span>
                <span>${routine.segments.length} segments</span>
            </div>
        `;

        card.addEventListener('click', () => loadRoutine(routine.id));
        container.appendChild(card);
    });
}

function initLogout() {
    document.getElementById('logout-btn').addEventListener('click', () => {
        showView('view-login');
    });
}

// ===== WORKOUT VIEW =====
function loadRoutine(routineId) {
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
    document.getElementById('start-btn').addEventListener('click', startWorkout);
    document.getElementById('pause-btn').addEventListener('click', pauseWorkout);
    document.getElementById('resume-btn').addEventListener('click', resumeWorkout);
    document.getElementById('stop-btn').addEventListener('click', stopWorkout);
    document.getElementById('back-btn').addEventListener('click', () => {
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
    // Prime speech synthesis (MUST be in user gesture handler for iOS)
    primeSpeechSynthesis();

    // Request wake lock
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log('Wake lock not supported or failed:', err);
    }

    // Initialize timing
    startTime = Date.now();
    currentSegmentIndex = 0;
    elapsedTime = 0;
    lastSpokenSecond = -1;

    // Show/hide buttons
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('pause-btn').style.display = 'block';
    document.getElementById('stop-btn').style.display = 'block';

    // Start first segment (call speak directly from user gesture context)
    speak(`Starting ${currentRoutine.segments[0].phase}`);

    // Start timer
    timerInterval = setInterval(updateTimer, 100);
}

function pauseWorkout() {
    if (!isPaused) {
        isPaused = true;
        pauseTimestamp = Date.now();

        document.getElementById('pause-btn').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'block';

        window.speechSynthesis.cancel();
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
    }
}

function stopWorkout() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    isPaused = false;
    window.speechSynthesis.cancel();

    // Release wake lock
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
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

    // Calculate elapsed time using delta timing
    elapsedTime = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsedTime / 1000);

    // Calculate segment timing
    let segmentStartTime = 0;
    for (let i = 0; i < currentSegmentIndex; i++) {
        segmentStartTime += currentRoutine.segments[i].duration;
    }

    const currentSegment = currentRoutine.segments[currentSegmentIndex];
    const segmentElapsed = elapsedSeconds - segmentStartTime;
    const segmentRemaining = currentSegment.duration - segmentElapsed;

    // Update timer display
    if (segmentRemaining > 0) {
        document.getElementById('timer').textContent = formatTime(segmentRemaining);
        document.getElementById('phase-name').textContent = currentSegment.phase;
        document.getElementById('phase-instruction').textContent = currentSegment.instruction;
    }

    // Handle audio cues (only once per second)
    if (segmentElapsed !== lastSpokenSecond && segmentRemaining > 0) {
        lastSpokenSecond = segmentElapsed;
        handleAudioCues(segmentRemaining);
    }

    // Check if segment is complete
    if (segmentRemaining <= 0) {
        currentSegmentIndex++;
        lastSpokenSecond = -1;

        if (currentSegmentIndex < currentRoutine.segments.length) {
            // Move to next segment
            const nextSegment = currentRoutine.segments[currentSegmentIndex];
            speak(`Starting ${nextSegment.phase}`);
            updateTimeline();
            updateSegmentCounter();
        } else {
            // Workout complete
            finishWorkout();
        }
    }

    // Update progress
    updateProgress();
}

function handleAudioCues(remainingTime) {
    const nextSegmentIndex = currentSegmentIndex + 1;
    const nextSegment = nextSegmentIndex < currentRoutine.segments.length
        ? currentRoutine.segments[nextSegmentIndex]
        : null;

    // 30-second warning
    if (remainingTime === 30 && nextSegment) {
        speak(`In 30 seconds, ${nextSegment.phase}`);
    }

    // Final countdown (speak() function handles cancel internally)
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
    const totalSeconds = Math.floor(elapsedTime / 1000);
    const percentage = (totalSeconds / totalDuration) * 100;

    document.getElementById('timeline-cursor').style.left = `${Math.min(percentage, 100)}%`;
    document.getElementById('total-progress').textContent = `${Math.floor(percentage)}%`;
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
    document.getElementById('phase-instruction').textContent = 'Great job! You finished the workout.';

    speak('Workout complete! Great job!');

    // Release wake lock
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }

    // Show only start button (to restart)
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

function primeSpeechSynthesis() {
    // iOS Safari requires speech to be triggered from a user gesture
    // This function should be called from a click handler
    if ('speechSynthesis' in window && !speechInitialized) {
        // Speak a short silent utterance to initialize the speech engine
        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
        speechInitialized = true;
        console.log('Speech synthesis primed for iOS');
    }
}

function speak(text) {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech first
        window.speechSynthesis.cancel();

        // Small delay to ensure cancel completes (iOS Safari quirk)
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // iOS Safari specific settings
            utterance.lang = 'en-US';

            // Error handling for iOS
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event);
            };

            utterance.onend = () => {
                console.log('Finished speaking:', text);
            };

            window.speechSynthesis.speak(utterance);
            console.log('Speaking:', text);
        }, 50);
    }
}
