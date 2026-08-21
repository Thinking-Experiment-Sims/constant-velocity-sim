import {
  calculatePosition,
  isAtBoundary,
  clampPosition,
  calculateMeetingPoint,
  getGroupConfig,
  fitLinearRegression,
  calculatePercentError,
  VELOCITY_RED,
  VELOCITY_BLUE,
  TRACK_MIN,
  TRACK_MAX
} from './constantVelocityPhysics.js';

// Application State
let state = {
  activePreset: '1',      // '1'..'6' or 'sandbox'
  timingMode: 'auto',     // 'auto' | 'manual'
  activeCarToRun: 'none', // 'red' | 'blue' | 'both' | 'none'
  isRunning: false,
  elapsedTime: 0.0,       // in seconds
  lastTimestamp: 0.0,     // in milliseconds
  speedMultiplier: 1.0,
  hasMet: false,
  meetingPoint: null,     // { time, position } theoretical
  
  // Cars configurations
  carRed: {
    color: 'red',
    x: 0.0,
    x0: 0.0,
    v: VELOCITY_RED,
    enabled: true,
    crossedSensors: new Set(),
    wheelAngle: 0.0,
    dataLogs: [] // Array of { t, x } points
  },
  carBlue: {
    color: 'blue',
    x: 210.0,
    x0: 210.0,
    v: -VELOCITY_BLUE,
    enabled: true,
    crossedSensors: new Set(),
    wheelAngle: 0.0,
    dataLogs: [] // Array of { t, x } points
  },
  
  // Graph fit toggled
  isFitToggled: false,
  
  // Challenge State
  challengeUnlocked: false,
  challengeVerified: false,
  isChallengeRunning: false,
  predTime: null,
  predPos: null,
  
  // Split flags on screen
  splitFlags: []
};

// Canvas Configurations
const simCanvas = document.getElementById('simCanvas');
const simCtx = simCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const graphCtx = graphCanvas.getContext('2d');

const SIM_WIDTH = simCanvas.width;
const SIM_HEIGHT = simCanvas.height;
const GRAPH_WIDTH = graphCanvas.width;
const GRAPH_HEIGHT = graphCanvas.height;

// Track Layout Constants
const TRACK_PADDING = 50; // px
const TRACK_Y = 110;      // Y center of central dividing rail
const CAR_RED_Y = 70;     // Y center for Red Car (Top Lane)
const CAR_BLUE_Y = 150;   // Y center for Blue Car (Bottom Lane)
const RULER_Y = 215;      // Y center of ruler tape
const RULER_HEIGHT = 42;

// Scale Factor: cm to pixels on track
const ScaleFactor = (SIM_WIDTH - 2 * TRACK_PADDING) / TRACK_MAX;

// 30 cm sensor positions
const MARKS = [0, 30, 60, 90, 120, 150, 180, 210, 240];

// DOM Elements
const groupSelect = document.getElementById('groupSelect');
const groupInfoText = document.getElementById('groupInfoText');
const timingModeSelect = document.getElementById('timingModeSelect');
const timingModePill = document.getElementById('timingModePill');
const manualSplitBanner = document.getElementById('manualSplitBanner');
const btnManualSplit = document.getElementById('btnManualSplit');

const btnRunRed = document.getElementById('btnRunRed');
const btnRunBlue = document.getElementById('btnRunBlue');
const btnReset = document.getElementById('btnReset');
const modeSelect = document.getElementById('modeSelect');
const statusIndicator = document.getElementById('statusIndicator');
const stopwatchDisplay = document.getElementById('stopwatch');

// Sandbox Elements
const sandboxControls = document.getElementById('sandboxControls');
const sbRedStart = document.getElementById('sbRedStart');
const sbRedVel = document.getElementById('sbRedVel');
const sbBlueStart = document.getElementById('sbBlueStart');
const sbBlueVel = document.getElementById('sbBlueVel');
const sbRedStartVal = document.getElementById('sbRedStartVal');
const sbRedVelVal = document.getElementById('sbRedVelVal');
const sbBlueStartVal = document.getElementById('sbBlueStartVal');
const sbBlueVelVal = document.getElementById('sbBlueVelVal');

// Table Bodies
const redTableBody = document.getElementById('redTable').querySelector('tbody');
const blueTableBody = document.getElementById('blueTable').querySelector('tbody');
const btnClearData = document.getElementById('btnClearData');

// Graph elements
const btnFitLine = document.getElementById('btnFitLine');
const equationDisplay = document.getElementById('equationDisplay');
const redEquationText = document.getElementById('redEquationText');
const blueEquationText = document.getElementById('blueEquationText');

// Challenge Elements
const challengeLockScreen = document.getElementById('challengeLockScreen');
const verificationContainer = document.getElementById('verificationContainer');
const verificationFeedback = document.getElementById('verificationFeedback');
const predictionSolveContainer = document.getElementById('predictionSolveContainer');
const verifyRedSlope = document.getElementById('verifyRedSlope');
const verifyRedIntercept = document.getElementById('verifyRedIntercept');
const verifyBlueSlope = document.getElementById('verifyBlueSlope');
const verifyBlueIntercept = document.getElementById('verifyBlueIntercept');
const btnVerifyEquations = document.getElementById('btnVerifyEquations');
const predTimeInput = document.getElementById('predTime');
const predPosInput = document.getElementById('predPos');
const btnRunChallenge = document.getElementById('btnRunChallenge');
const challengeResultText = document.getElementById('challengeResultText');

// Tab elements
const tabGuidedBtn = document.getElementById('tabGuidedBtn');
const tabTheoryBtn = document.getElementById('tabTheoryBtn');
const panelGuided = document.getElementById('panelGuided');
const panelTheory = document.getElementById('panelTheory');

function init() {
  setupEventListeners();
  applyPreset('1');
  resetAllPositions();
  animate(0);
}

function setupEventListeners() {
  // Group preset change
  groupSelect.addEventListener('change', (e) => {
    applyPreset(e.target.value);
  });

  // Timing Mode Select
  timingModeSelect.addEventListener('change', (e) => {
    state.timingMode = e.target.value;
    if (state.timingMode === 'manual') {
      manualSplitBanner.style.display = 'flex';
      timingModePill.textContent = '⏱️ Manual Mode (With Uncertainty)';
      timingModePill.className = 'timing-mode-pill manual';
    } else {
      manualSplitBanner.style.display = 'none';
      timingModePill.textContent = '🤖 Auto Photogates Mode';
      timingModePill.className = 'timing-mode-pill auto';
    }
  });

  // Manual Split Action Button
  btnManualSplit.addEventListener('click', recordManualSplit);

  // Global Keyboard listener for Spacebar Split
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state.isRunning && state.timingMode === 'manual') {
      e.preventDefault();
      recordManualSplit();
    }
  });

  // Mode select change
  modeSelect.addEventListener('change', (e) => {
    configureCarsAvailability(e.target.value);
    resetAllPositions();
  });

  // Action Buttons
  btnRunRed.addEventListener('click', () => startSingleCar('red'));
  btnRunBlue.addEventListener('click', () => startSingleCar('blue'));
  btnReset.addEventListener('click', resetAllPositions);
  btnClearData.addEventListener('click', clearLoggedData);

  // Live updates when typing prediction values
  predTimeInput.addEventListener('input', () => {
    state.predTime = parseFloat(predTimeInput.value);
    draw();
    drawGraph();
  });
  predPosInput.addEventListener('input', () => {
    state.predPos = parseFloat(predPosInput.value);
    draw();
    drawGraph();
  });

  // Speed Multipliers
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.speedMultiplier = parseFloat(e.target.getAttribute('data-speed'));
    });
  });

  // Sandbox inputs
  sbRedStart.addEventListener('input', (e) => {
    sbRedStartVal.textContent = e.target.value;
    state.carRed.x0 = parseFloat(e.target.value);
    resetAllPositions();
  });
  sbRedVel.addEventListener('input', (e) => {
    sbRedVelVal.textContent = e.target.value;
    state.carRed.v = parseFloat(e.target.value);
    resetAllPositions();
  });
  sbBlueStart.addEventListener('input', (e) => {
    sbBlueStartVal.textContent = e.target.value;
    state.carBlue.x0 = parseFloat(e.target.value);
    resetAllPositions();
  });
  sbBlueVel.addEventListener('input', (e) => {
    sbBlueVelVal.textContent = e.target.value;
    state.carBlue.v = parseFloat(e.target.value);
    resetAllPositions();
  });

  // Graph Line Fitting
  btnFitLine.addEventListener('click', () => {
    state.isFitToggled = !state.isFitToggled;
    if (state.isFitToggled) {
      btnFitLine.classList.add('active');
      equationDisplay.style.display = 'grid';
      fitAndDisplayEquations();
      if (hasSufficientDataToFit()) {
        unlockChallengeVerification();
      }
    } else {
      btnFitLine.classList.remove('active');
      equationDisplay.style.display = 'none';
    }
    drawGraph();
  });

  // Challenge Equation Verification
  btnVerifyEquations.addEventListener('click', verifyAlgebraicEquations);

  // Challenge Prediction Run
  btnRunChallenge.addEventListener('click', startChallengeCollisionRun);

  // Tab switching
  tabGuidedBtn.addEventListener('click', () => {
    tabGuidedBtn.classList.add('active');
    tabTheoryBtn.classList.remove('active');
    panelGuided.classList.add('active');
    panelTheory.classList.remove('active');
  });

  tabTheoryBtn.addEventListener('click', () => {
    tabTheoryBtn.classList.add('active');
    tabGuidedBtn.classList.remove('active');
    panelTheory.classList.add('active');
    panelGuided.classList.remove('active');
  });
}

function applyPreset(preset) {
  state.activePreset = preset;
  
  if (preset === 'sandbox') {
    sandboxControls.style.display = 'block';
    groupInfoText.innerHTML = `<strong>Sandbox Mode:</strong> Customize the start positions and constant speeds of both cars.`;
    
    state.carRed.x0 = parseFloat(sbRedStart.value);
    state.carRed.v = parseFloat(sbRedVel.value);
    state.carBlue.x0 = parseFloat(sbBlueStart.value);
    state.carBlue.v = parseFloat(sbBlueVel.value);
  } else {
    sandboxControls.style.display = 'none';
    const config = getGroupConfig(preset);
    
    if (config) {
      const redDir = config.trial1.v > 0 ? 'forward (right)' : 'backward (left)';
      const blueDir = config.trial2.v > 0 ? 'forward (right)' : 'backward (left)';
      
      groupInfoText.innerHTML = `
        Car A (Red - Top): Starts at ${config.trial1.x0} cm, moving ${redDir} (${Math.abs(config.trial1.v)} cm/s) | 
        Car B (Blue - Bottom): Starts at ${config.trial2.x0} cm, moving ${blueDir} (${Math.abs(config.trial2.v)} cm/s)
      `;
      
      state.carRed.x0 = config.trial1.x0;
      state.carRed.v = config.trial1.v;
      
      state.carBlue.x0 = config.trial2.x0;
      state.carBlue.v = config.trial2.v;
    }
  }
  
  configureCarsAvailability(modeSelect.value);
  resetAllPositions();
}

function configureCarsAvailability(mode) {
  if (mode === 'red') {
    state.carRed.enabled = true;
    state.carBlue.enabled = false;
  } else if (mode === 'blue') {
    state.carRed.enabled = false;
    state.carBlue.enabled = true;
  } else {
    state.carRed.enabled = true;
    state.carBlue.enabled = true;
  }
}

// Reset both cars positions, data tables, graphs, and challenges
function resetAllPositions() {
  state.isRunning = false;
  state.elapsedTime = 0.0;
  state.hasMet = false;
  state.isChallengeRunning = false;
  state.activeCarToRun = 'none';
  state.splitFlags = [];
  
  state.carRed.x = state.carRed.x0;
  state.carRed.wheelAngle = 0.0;
  state.carRed.crossedSensors.clear();
  state.carRed.dataLogs = [];
  
  state.carBlue.x = state.carBlue.x0;
  state.carBlue.wheelAngle = 0.0;
  state.carBlue.crossedSensors.clear();
  state.carBlue.dataLogs = [];
  
  // Reset Line fitting and graph display
  state.isFitToggled = false;
  btnFitLine.classList.remove('active');
  if (equationDisplay) equationDisplay.style.display = 'none';
  
  // Reset Challenge state and inputs
  state.challengeUnlocked = false;
  state.challengeVerified = false;
  state.predTime = null;
  state.predPos = null;
  if (predTimeInput) predTimeInput.value = '';
  if (predPosInput) predPosInput.value = '';
  if (verifyRedSlope) verifyRedSlope.value = '';
  if (verifyRedIntercept) verifyRedIntercept.value = '';
  if (verifyBlueSlope) verifyBlueSlope.value = '';
  if (verifyBlueIntercept) verifyBlueIntercept.value = '';
  
  if (challengeLockScreen) challengeLockScreen.style.display = 'flex';
  if (verificationContainer) verificationContainer.style.display = 'none';
  if (predictionSolveContainer) predictionSolveContainer.style.display = 'none';
  if (verificationFeedback) verificationFeedback.style.display = 'none';
  
  if (state.carRed.enabled && state.carBlue.enabled) {
    state.meetingPoint = calculateMeetingPoint(
      state.carRed.x0, state.carRed.v,
      state.carBlue.x0, state.carBlue.v
    );
  } else {
    state.meetingPoint = null;
  }

  btnRunRed.disabled = !state.carRed.enabled;
  btnRunBlue.disabled = !state.carBlue.enabled;
  btnManualSplit.disabled = true;
  
  statusIndicator.textContent = "Ready — select a car or click Run";
  statusIndicator.className = "status-badge";
  statusIndicator.style.background = "#eef8fb";
  statusIndicator.style.color = "var(--accent-strong)";
  statusIndicator.style.borderColor = "#b8d1db";
  
  updateUI();
  updateTablesUI();
  draw();
  drawGraph();
}

// Clear logged data points (alias to resetAllPositions)
function clearLoggedData() {
  resetAllPositions();
}

// Run single car independently (Automatically records t=0 initial point)
function startSingleCar(color) {
  if (state.isRunning) return;
  
  state.activeCarToRun = color;
  state.isRunning = true;
  state.elapsedTime = 0.0;
  state.lastTimestamp = performance.now();
  state.splitFlags = [];
  
  if (color === 'red') {
    state.carRed.x = state.carRed.x0;
    state.carRed.crossedSensors.clear();
    state.carRed.dataLogs = [];
    
    // Auto-record initial position at t = 0.00 s so student never misses it!
    state.carRed.crossedSensors.add(state.carRed.x0);
    state.carRed.dataLogs.push({ t: 0.0, x: state.carRed.x0 });
    
    btnRunRed.disabled = true;
    btnRunBlue.disabled = false;
    statusIndicator.textContent = "Running Red Car A (Top lane)...";
  } else {
    state.carBlue.x = state.carBlue.x0;
    state.carBlue.crossedSensors.clear();
    state.carBlue.dataLogs = [];
    
    // Auto-record initial position at t = 0.00 s so student never misses it!
    state.carBlue.crossedSensors.add(state.carBlue.x0);
    state.carBlue.dataLogs.push({ t: 0.0, x: state.carBlue.x0 });
    
    btnRunBlue.disabled = true;
    btnRunRed.disabled = false;
    statusIndicator.textContent = "Running Blue Car B (Bottom lane)...";
  }
  
  if (state.timingMode === 'manual') {
    btnManualSplit.disabled = false;
  }
  
  updateTablesUI();
  drawGraph();
}

// Manual Split Recording
function recordManualSplit() {
  if (!state.isRunning) return;
  
  const activeCar = state.activeCarToRun === 'red' ? state.carRed : 
                   (state.activeCarToRun === 'blue' ? state.carBlue : null);
  
  if (!activeCar) return;
  
  let bestMark = null;
  let minDiff = Infinity;
  
  MARKS.forEach(m => {
    if (!activeCar.crossedSensors.has(m)) {
      const diff = Math.abs(activeCar.x - m);
      if (diff < minDiff && diff <= 45) { // Generous split detection window
        minDiff = diff;
        bestMark = m;
      }
    }
  });
  
  if (bestMark !== null) {
    activeCar.crossedSensors.add(bestMark);
    activeCar.dataLogs.push({ t: state.elapsedTime, x: bestMark });
    activeCar.dataLogs.sort((a, b) => a.t - b.t);
    
    state.splitFlags.push({ x: bestMark, t: state.elapsedTime });
    
    updateTablesUI();
    drawGraph();
    
    if (state.isFitToggled) {
      fitAndDisplayEquations();
    }
  }
}

// Run prediction crossing test
function startChallengeCollisionRun() {
  if (state.isRunning) return;
  
  resetAllPositions();
  state.activeCarToRun = 'both';
  state.isChallengeRunning = true;
  state.isRunning = true;
  state.lastTimestamp = performance.now();
  
  state.predTime = parseFloat(predTimeInput.value);
  state.predPos = parseFloat(predPosInput.value);
  
  btnRunRed.disabled = true;
  btnRunBlue.disabled = true;
  
  statusIndicator.textContent = "Running Meeting Point Challenge (Crossing Paths)...";
  challengeResultText.textContent = "Watching cars move to verify your algebraic prediction...";
  challengeResultText.style.color = "var(--muted)";
}

// Main update loop
function animate(timestamp) {
  if (state.isRunning) {
    const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.1) * state.speedMultiplier;
    state.lastTimestamp = timestamp;
    
    state.elapsedTime += dt;
    
    updatePhysics(dt);
    if (state.timingMode === 'auto') {
      checkMarkingsCrossing();
    }
    checkSimulationEnd();
  }
  
  updateUI();
  draw();
  
  requestAnimationFrame(animate);
}

function updatePhysics(dt) {
  const isRedActive = state.isRunning && (state.activeCarToRun === 'red' || state.activeCarToRun === 'both');
  const isBlueActive = state.isRunning && (state.activeCarToRun === 'blue' || state.activeCarToRun === 'both');
  
  // Red Car physics (Top lane)
  if (state.carRed.enabled && isRedActive && !isAtBoundary(state.carRed.x, state.carRed.v)) {
    state.carRed.x = calculatePosition(state.elapsedTime, state.carRed.x0, state.carRed.v);
    
    const wheelRadius = 15;
    const deltaCm = state.carRed.v * dt;
    state.carRed.wheelAngle += (deltaCm * ScaleFactor) / wheelRadius;
    
    state.carRed.x = clampPosition(state.carRed.x);
  }
  
  // Blue Car physics (Bottom lane)
  if (state.carBlue.enabled && isBlueActive && !isAtBoundary(state.carBlue.x, state.carBlue.v)) {
    state.carBlue.x = calculatePosition(state.elapsedTime, state.carBlue.x0, state.carBlue.v);
    
    const wheelRadius = 15;
    const deltaCm = state.carBlue.v * dt;
    state.carBlue.wheelAngle += (deltaCm * ScaleFactor) / wheelRadius;
    
    state.carBlue.x = clampPosition(state.carBlue.x);
  }
  
  // Check for crossing paths in Both Cars mode
  if (state.activeCarToRun === 'both' && !state.hasMet && state.meetingPoint) {
    const hasCrossedNow = (state.carRed.v > state.carBlue.v && state.carRed.x >= state.carBlue.x) ||
                          (state.carRed.v < state.carBlue.v && state.carRed.x <= state.carBlue.x);
    
    if (hasCrossedNow) {
      state.hasMet = true;
      
      state.carRed.x = state.meetingPoint.position;
      state.carBlue.x = state.meetingPoint.position;
      
      state.isRunning = false;
      btnRunRed.disabled = false;
      btnRunBlue.disabled = false;
      
      if (state.isChallengeRunning) {
        evaluateChallengeOutcome();
      } else {
        statusIndicator.innerHTML = `✨ <strong>Cars Crossed Paths!</strong> Met at <strong>${state.meetingPoint.position.toFixed(1)} cm</strong> at ${state.meetingPoint.time.toFixed(2)} s.`;
      }
    }
  }
}

// Auto Crossing check (Photogates)
function checkMarkingsCrossing() {
  const isRedActive = state.activeCarToRun === 'red' || state.activeCarToRun === 'both';
  const isBlueActive = state.activeCarToRun === 'blue' || state.activeCarToRun === 'both';
  
  MARKS.forEach(pos => {
    if (state.carRed.enabled && isRedActive && !state.carRed.crossedSensors.has(pos)) {
      const crossed = (state.carRed.v >= 0 && state.carRed.x >= pos && state.carRed.x0 <= pos) ||
                      (state.carRed.v < 0 && state.carRed.x <= pos && state.carRed.x0 >= pos);
      if (crossed) {
        state.carRed.crossedSensors.add(pos);
        state.carRed.dataLogs.push({ t: state.elapsedTime, x: pos });
        state.carRed.dataLogs.sort((a, b) => a.t - b.t);
        updateTablesUI();
        drawGraph();
        
        if (state.isFitToggled) {
          fitAndDisplayEquations();
        }
      }
    }
    
    if (state.carBlue.enabled && isBlueActive && !state.carBlue.crossedSensors.has(pos)) {
      const crossed = (state.carBlue.v >= 0 && state.carBlue.x >= pos && state.carBlue.x0 <= pos) ||
                      (state.carBlue.v < 0 && state.carBlue.x <= pos && state.carBlue.x0 >= pos);
      if (crossed) {
        state.carBlue.crossedSensors.add(pos);
        state.carBlue.dataLogs.push({ t: state.elapsedTime, x: pos });
        state.carBlue.dataLogs.sort((a, b) => a.t - b.t);
        updateTablesUI();
        drawGraph();
        
        if (state.isFitToggled) {
          fitAndDisplayEquations();
        }
      }
    }
  });
}

function checkSimulationEnd() {
  if (!state.isRunning) return;
  
  const isRedActive = state.activeCarToRun === 'red' || state.activeCarToRun === 'both';
  const isBlueActive = state.activeCarToRun === 'blue' || state.activeCarToRun === 'both';
  
  const redFinished = !state.carRed.enabled || !isRedActive || isAtBoundary(state.carRed.x, state.carRed.v);
  const blueFinished = !state.carBlue.enabled || !isBlueActive || isAtBoundary(state.carBlue.x, state.carBlue.v);
  
  if (redFinished && blueFinished) {
    state.isRunning = false;
    
    btnRunRed.disabled = !state.carRed.enabled;
    btnRunBlue.disabled = !state.carBlue.enabled;
    btnManualSplit.disabled = true;
    
    if (state.isChallengeRunning && !state.hasMet) {
      statusIndicator.textContent = "Challenge Complete — Cars did not cross paths.";
      challengeResultText.textContent = "Cars reached boundaries without meeting. Check your equations and directions!";
      challengeResultText.style.color = "var(--warn)";
    } else {
      const finishedCar = state.activeCarToRun === 'red' ? 'Red Car A' : (state.activeCarToRun === 'blue' ? 'Blue Car B' : 'Run');
      statusIndicator.textContent = `${finishedCar} finished! You can now run the other car or click Fit Line.`;
    }
  }
}

// Fit equations and display regression + uncertainty metrics
function fitAndDisplayEquations() {
  const redFit = fitLinearRegression(state.carRed.dataLogs);
  const blueFit = fitLinearRegression(state.carBlue.dataLogs);
  
  if (redFit && state.carRed.enabled) {
    const pErr = calculatePercentError(redFit.slope, state.carRed.v);
    redEquationText.innerHTML = `
      <div><strong>Red Car A Model (Top):</strong> <i>x</i> = (${redFit.slope.toFixed(2)} cm/s)<i>t</i> + ${redFit.intercept.toFixed(1)} cm</div>
      <div style="font-size: 0.8rem; color: #666; margin-top: 2px;">
        Linear Fit R² = <strong>${redFit.r2.toFixed(4)}</strong> | Error = ${pErr.toFixed(1)}%
      </div>
    `;
  } else {
    redEquationText.innerHTML = `<div>Red Car A: <em>(Need at least 2 logged points)</em></div>`;
  }
  
  if (blueFit && state.carBlue.enabled) {
    const pErr = calculatePercentError(blueFit.slope, state.carBlue.v);
    blueEquationText.innerHTML = `
      <div><strong>Blue Car B Model (Bottom):</strong> <i>x</i> = (${blueFit.slope.toFixed(2)} cm/s)<i>t</i> + ${blueFit.intercept.toFixed(1)} cm</div>
      <div style="font-size: 0.8rem; color: #666; margin-top: 2px;">
        Linear Fit R² = <strong>${blueFit.r2.toFixed(4)}</strong> | Error = ${pErr.toFixed(1)}%
      </div>
    `;
  } else {
    blueEquationText.innerHTML = `<div>Blue Car B: <em>(Need at least 2 logged points)</em></div>`;
  }
  
  if (hasSufficientDataToFit()) {
    unlockChallengeVerification();
  }
}

function hasSufficientDataToFit() {
  const redOk = !state.carRed.enabled || state.carRed.dataLogs.length >= 2;
  const blueOk = !state.carBlue.enabled || state.carBlue.dataLogs.length >= 2;
  return redOk && blueOk;
}

function unlockChallengeVerification() {
  if (state.challengeUnlocked) return;
  state.challengeUnlocked = true;
  
  challengeLockScreen.style.display = 'none';
  verificationContainer.style.display = 'block';
}

// Forgiving & Flexible Equation Verification with Inline UI presentation
function verifyAlgebraicEquations() {
  const enteredRedSlope = parseFloat(verifyRedSlope.value);
  const enteredRedIntercept = parseFloat(verifyRedIntercept.value);
  const enteredBlueSlope = parseFloat(verifyBlueSlope.value);
  const enteredBlueIntercept = parseFloat(verifyBlueIntercept.value);
  
  const redFit = fitLinearRegression(state.carRed.dataLogs);
  const blueFit = fitLinearRegression(state.carBlue.dataLogs);
  
  let redSlopeOk = false;
  let redIntOk = false;
  let blueSlopeOk = false;
  let blueIntOk = false;
  let hints = [];

  // Red Car Verification
  if (state.carRed.enabled) {
    if (isNaN(enteredRedSlope) || isNaN(enteredRedIntercept)) {
      hints.push("Please fill in both the slope and initial position for Red Car A.");
    } else {
      const theoSlope = state.carRed.v;
      const fitSlope = redFit ? redFit.slope : theoSlope;
      const theoInt = state.carRed.x0;
      const fitInt = redFit ? redFit.intercept : theoInt;
      
      // Accept either theoretical or fitted value within generous bounds
      redSlopeOk = (Math.abs(enteredRedSlope - theoSlope) <= 5.0) || 
                   (Math.abs(enteredRedSlope - fitSlope) <= 4.0) ||
                   (theoSlope !== 0 && Math.abs((enteredRedSlope - theoSlope) / theoSlope) <= 0.25);
      
      redIntOk = (Math.abs(enteredRedIntercept - theoInt) <= 6.0) || 
                 (Math.abs(enteredRedIntercept - fitInt) <= 6.0);
      
      if (!redSlopeOk) {
        if (theoSlope < 0 && enteredRedSlope > 0) {
          hints.push(`Red Car A is moving left (negative slope around ${theoSlope.toFixed(0)} cm/s).`);
        } else {
          hints.push(`Red Car A slope should be near ${theoSlope.toFixed(0)} cm/s.`);
        }
      }
      if (!redIntOk) {
        hints.push(`Red Car A starting position was ${theoInt.toFixed(0)} cm.`);
      }
    }
  } else {
    redSlopeOk = true;
    redIntOk = true;
  }

  // Blue Car Verification
  if (state.carBlue.enabled) {
    if (isNaN(enteredBlueSlope) || isNaN(enteredBlueIntercept)) {
      hints.push("Please fill in both the slope and initial position for Blue Car B.");
    } else {
      const theoSlope = state.carBlue.v;
      const fitSlope = blueFit ? blueFit.slope : theoSlope;
      const theoInt = state.carBlue.x0;
      const fitInt = blueFit ? blueFit.intercept : theoInt;
      
      blueSlopeOk = (Math.abs(enteredBlueSlope - theoSlope) <= 5.0) || 
                    (Math.abs(enteredBlueSlope - fitSlope) <= 4.0) ||
                    (theoSlope !== 0 && Math.abs((enteredBlueSlope - theoSlope) / theoSlope) <= 0.25);
      
      blueIntOk = (Math.abs(enteredBlueIntercept - theoInt) <= 6.0) || 
                  (Math.abs(enteredBlueIntercept - fitInt) <= 6.0);
      
      if (!blueSlopeOk) {
        if (theoSlope < 0 && enteredBlueSlope > 0) {
          hints.push(`Blue Car B is moving left (decreasing position), so its velocity/slope must be negative (near ${theoSlope.toFixed(0)} cm/s).`);
        } else {
          hints.push(`Blue Car B slope should be near ${theoSlope.toFixed(0)} cm/s.`);
        }
      }
      if (!blueIntOk) {
        hints.push(`Blue Car B starting position was ${theoInt.toFixed(0)} cm.`);
      }
    }
  } else {
    blueSlopeOk = true;
    blueIntOk = true;
  }

  if (redSlopeOk && redIntOk && blueSlopeOk && blueIntOk) {
    state.challengeVerified = true;
    if (verificationFeedback) {
      verificationFeedback.style.display = 'block';
      verificationFeedback.style.background = '#ebfbee';
      verificationFeedback.style.border = '1px solid #c3fae8';
      verificationFeedback.style.color = '#087f5b';
      verificationFeedback.innerHTML = '✅ <strong>Equations Verified!</strong> Your equations of motion match your experimental data.';
    }
    setTimeout(() => {
      verificationContainer.style.display = 'none';
      predictionSolveContainer.style.display = 'block';
    }, 400);
  } else {
    if (verificationFeedback) {
      verificationFeedback.style.display = 'block';
      verificationFeedback.style.background = '#fff4e6';
      verificationFeedback.style.border = '1px solid #ffd8a8';
      verificationFeedback.style.color = '#d9480f';
      verificationFeedback.innerHTML = `<strong>⚠️ Check your values:</strong><br>${hints.join('<br>')}`;
    }
  }
}

function evaluateChallengeOutcome() {
  if (!state.meetingPoint) return;
  
  const timeErr = Math.abs(state.predTime - state.meetingPoint.time);
  const posErr = Math.abs(state.predPos - state.meetingPoint.position);
  
  const correct = (timeErr <= 0.8) && (posErr <= 6.0);
  
  if (correct) {
    statusIndicator.innerHTML = `🎉 <strong>Challenge Succeeded!</strong>`;
    statusIndicator.style.background = "#ebfbee";
    statusIndicator.style.color = "#087f5b";
    statusIndicator.style.borderColor = "#c3fae8";
    
    challengeResultText.innerHTML = `
      🌟 <strong>Success!</strong> The cars crossed paths at <strong>t = ${state.meetingPoint.time.toFixed(2)} s</strong> at position <strong>x = ${state.meetingPoint.position.toFixed(1)} cm</strong>.<br>
      Your prediction (t = ${state.predTime.toFixed(2)} s, x = ${state.predPos.toFixed(1)} cm) was verified experimentally!
    `;
    challengeResultText.style.color = "#087f5b";
  } else {
    statusIndicator.innerHTML = `❌ <strong>Prediction Error</strong>`;
    statusIndicator.style.background = "#fff5f5";
    statusIndicator.style.color = "#c92a2a";
    statusIndicator.style.borderColor = "#ffc9c9";
    
    challengeResultText.innerHTML = `
      ⚠️ <strong>Discrepancy:</strong> The cars crossed paths at <strong>t = ${state.meetingPoint.time.toFixed(2)} s</strong> at position <strong>x = ${state.meetingPoint.position.toFixed(1)} cm</strong>.<br>
      Your predicted values (t = ${state.predTime || 0} s, x = ${state.predPos || 0} cm) differed. Check your algebraic solution and try again!
    `;
    challengeResultText.style.color = "#c92a2a";
  }
}

function updateUI() {
  const s = Math.floor(state.elapsedTime % 60).toString().padStart(2, '0');
  const ms = Math.floor((state.elapsedTime % 1) * 100).toString().padStart(2, '0');
  stopwatchDisplay.textContent = `${s}.${ms} s`;
}

function updateTablesUI() {
  let redHtml = '';
  let blueHtml = '';
  
  MARKS.forEach(pos => {
    const redLog = state.carRed.dataLogs.find(l => l.x === pos);
    const redTime = redLog ? `${redLog.t.toFixed(2)} s` : '—';
    const redClass = redLog ? 'class="logged-cell"' : '';
    
    redHtml += `
      <tr>
        <td style="font-weight: 600;">${pos}</td>
        <td ${redClass}>${redTime}</td>
      </tr>
    `;
    
    const blueLog = state.carBlue.dataLogs.find(l => l.x === pos);
    const blueTime = blueLog ? `${blueLog.t.toFixed(2)} s` : '—';
    const blueClass = blueLog ? 'class="logged-cell"' : '';
    
    blueHtml += `
      <tr>
        <td style="font-weight: 600;">${pos}</td>
        <td ${blueClass}>${blueTime}</td>
      </tr>
    `;
  });
  
  redTableBody.innerHTML = redHtml;
  blueTableBody.innerHTML = blueHtml;
}

// ==========================================
// Simulation Canvas Drawing
// ==========================================
function draw() {
  simCtx.clearRect(0, 0, SIM_WIDTH, SIM_HEIGHT);
  
  // 1. Dotted marking lines through track
  MARKS.forEach(pos => {
    const x = cmToPx(pos);
    
    simCtx.strokeStyle = 'rgba(15, 126, 155, 0.15)';
    simCtx.lineWidth = 1.5;
    simCtx.setLineDash([5, 5]);
    simCtx.beginPath();
    simCtx.moveTo(x, 15);
    simCtx.lineTo(x, RULER_Y - 2);
    simCtx.stroke();
    simCtx.setLineDash([]);
    
    simCtx.fillStyle = 'rgba(12, 54, 68, 0.45)';
    simCtx.font = '500 9px "IBM Plex Sans", sans-serif';
    simCtx.textAlign = 'center';
    simCtx.fillText(`${pos} cm`, x, 14);
  });
  
  // 2. Dual Sub-Tracks (Dividing Central Guide Rail)
  // Upper Rail (Red Car)
  simCtx.strokeStyle = '#c8dbe3';
  simCtx.lineWidth = 3;
  simCtx.beginPath();
  simCtx.moveTo(TRACK_PADDING, TRACK_Y - 14);
  simCtx.lineTo(SIM_WIDTH - TRACK_PADDING, TRACK_Y - 14);
  simCtx.stroke();

  // Central Track Dividing Beam
  simCtx.fillStyle = '#e9f4fb';
  simCtx.fillRect(TRACK_PADDING, TRACK_Y - 10, SIM_WIDTH - 2 * TRACK_PADDING, 20);
  simCtx.strokeStyle = '#a9c4cf';
  simCtx.lineWidth = 2;
  simCtx.strokeRect(TRACK_PADDING, TRACK_Y - 10, SIM_WIDTH - 2 * TRACK_PADDING, 20);

  // Center dashed guide line
  simCtx.strokeStyle = '#0f7e9b';
  simCtx.lineWidth = 1.5;
  simCtx.setLineDash([8, 6]);
  simCtx.beginPath();
  simCtx.moveTo(TRACK_PADDING, TRACK_Y);
  simCtx.lineTo(SIM_WIDTH - TRACK_PADDING, TRACK_Y);
  simCtx.stroke();
  simCtx.setLineDash([]);

  // Lower Rail (Blue Car)
  simCtx.strokeStyle = '#c8dbe3';
  simCtx.lineWidth = 3;
  simCtx.beginPath();
  simCtx.moveTo(TRACK_PADDING, TRACK_Y + 14);
  simCtx.lineTo(SIM_WIDTH - TRACK_PADDING, TRACK_Y + 14);
  simCtx.stroke();
  
  // End Bumpers
  simCtx.fillStyle = '#61808b';
  simCtx.fillRect(TRACK_PADDING - 6, CAR_RED_Y - 10, 6, 95);
  simCtx.fillRect(SIM_WIDTH - TRACK_PADDING, CAR_RED_Y - 10, 6, 95);
  
  // 3. Ruler Tape
  drawRulerTape();
  
  // 4. Draw Student Predicted Meeting Flag if set
  if (state.predPos !== null && !isNaN(state.predPos)) {
    drawPredictionFlag(state.predPos);
  }
  
  // 5. Cars: Red on top lane, Blue on bottom lane (so they cleanly cross paths)
  if (state.carRed.enabled) {
    const isRedActive = state.activeCarToRun === 'red' || state.activeCarToRun === 'both';
    drawCartoonCar(state.carRed.x, CAR_RED_Y, 'red', state.carRed.v, state.carRed.wheelAngle, isRedActive);
  }
  
  if (state.carBlue.enabled) {
    const isBlueActive = state.activeCarToRun === 'blue' || state.activeCarToRun === 'both';
    drawCartoonCar(state.carBlue.x, CAR_BLUE_Y, 'blue', state.carBlue.v, state.carBlue.wheelAngle, isBlueActive);
  }
  
  // 6. Crossing Indicator when paths meet
  if (state.hasMet && state.meetingPoint) {
    drawCrossingIndicator(state.meetingPoint.position);
  }
}

// Draw Ruler Tape (cm only)
function drawRulerTape() {
  const yTop = RULER_Y - RULER_HEIGHT / 2;
  
  simCtx.fillStyle = '#ffffff';
  simCtx.fillRect(TRACK_PADDING, yTop, SIM_WIDTH - 2 * TRACK_PADDING, RULER_HEIGHT);
  simCtx.strokeStyle = '#c8dbe3';
  simCtx.lineWidth = 1;
  simCtx.strokeRect(TRACK_PADDING, yTop, SIM_WIDTH - 2 * TRACK_PADDING, RULER_HEIGHT);
  
  simCtx.fillStyle = '#123140';
  simCtx.strokeStyle = '#123140';
  simCtx.textAlign = 'center';
  simCtx.font = 'bold 11px "IBM Plex Sans", sans-serif';
  
  for (let cm = 0; cm <= TRACK_MAX; cm += 1) {
    const x = cmToPx(cm);
    
    if (cm % 30 === 0) {
      simCtx.lineWidth = 1.8;
      simCtx.beginPath();
      simCtx.moveTo(x, yTop);
      simCtx.lineTo(x, yTop + 14);
      simCtx.stroke();
      
      simCtx.fillText(`${cm}`, x, yTop + 26);
    } else if (cm % 10 === 0) {
      simCtx.lineWidth = 1.2;
      simCtx.beginPath();
      simCtx.moveTo(x, yTop);
      simCtx.lineTo(x, yTop + 9);
      simCtx.stroke();
    } else if (cm % 5 === 0) {
      simCtx.lineWidth = 0.8;
      simCtx.beginPath();
      simCtx.moveTo(x, yTop);
      simCtx.lineTo(x, yTop + 6);
      simCtx.stroke();
    } else {
      simCtx.lineWidth = 0.5;
      simCtx.beginPath();
      simCtx.moveTo(x, yTop);
      simCtx.lineTo(x, yTop + 4);
      simCtx.stroke();
    }
  }
}

// Helper: Custom round rect using standard arcTo
function drawRoundedRect(c, rx, ry, w, h, r) {
  c.beginPath();
  c.moveTo(rx + r, ry);
  c.lineTo(rx + w - r, ry);
  c.arcTo(rx + w, ry, rx + w, ry + r, r);
  c.lineTo(rx + w, ry + h - r);
  c.arcTo(rx + w, ry + h, rx + w - r, ry + h, r);
  c.lineTo(rx + r, ry + h);
  c.arcTo(rx, ry + h, rx, ry + h - r, r);
  c.lineTo(rx, ry + r);
  c.arcTo(rx, ry, rx + r, ry, r);
  c.closePath();
}

// Draw a Cartoon Toy Car
function drawCartoonCar(cmPos, y, color, velocity, wheelAngle, isActive) {
  const x = cmToPx(cmPos);
  
  simCtx.save();
  simCtx.translate(x, y);
  
  const isMovingLeft = velocity < 0;
  if (isMovingLeft) {
    simCtx.scale(-1, 1);
  }
  
  const w = 58;
  const primaryColor = color === 'red' ? '#e03131' : '#1c7ed6';
  const shadowColor = color === 'red' ? '#c92a2a' : '#1864ab';
  
  // Wheels
  drawCartWheel(-16, 9, 8, wheelAngle);
  drawCartWheel(16, 9, 8, wheelAngle);
  
  // Body
  simCtx.fillStyle = primaryColor;
  simCtx.strokeStyle = shadowColor;
  simCtx.lineWidth = 1.5;
  drawRoundedRect(simCtx, -w / 2, -6, w, 12, 3);
  simCtx.fill();
  simCtx.stroke();
  
  // Cabin
  simCtx.beginPath();
  simCtx.moveTo(-w / 2 + 10, -6);
  simCtx.lineTo(-w / 2 + 18, -16);
  simCtx.lineTo(w / 2 - 15, -16);
  simCtx.lineTo(w / 2 - 8, -6);
  simCtx.closePath();
  simCtx.fill();
  simCtx.stroke();
  
  // Windows
  simCtx.fillStyle = '#eef8fb';
  simCtx.beginPath();
  simCtx.moveTo(-w / 2 + 12, -7);
  simCtx.lineTo(-w / 2 + 19, -14);
  simCtx.lineTo(-1, -14);
  simCtx.lineTo(-1, -7);
  simCtx.closePath();
  simCtx.fill();
  
  simCtx.beginPath();
  simCtx.moveTo(1, -7);
  simCtx.lineTo(1, -14);
  simCtx.lineTo(w / 2 - 17, -14);
  simCtx.lineTo(w / 2 - 10, -7);
  simCtx.closePath();
  simCtx.fill();
  
  // Headlight
  simCtx.fillStyle = '#ffec99';
  simCtx.beginPath();
  simCtx.arc(w / 2 - 1, -2, 2.5, -Math.PI / 2, Math.PI / 2);
  simCtx.fill();
  
  simCtx.restore();
  
  // Text label above car
  simCtx.fillStyle = color === 'red' ? '#c92a2a' : '#12518c';
  simCtx.font = 'bold 10px sans-serif';
  simCtx.textAlign = 'center';
  const label = color === 'red' ? 'Red Car A (Top)' : 'Blue Car B (Bottom)';
  
  const currentCarTime = (state.activeCarToRun === 'both' || state.activeCarToRun === color) ? state.elapsedTime : 0.0;
  simCtx.fillText(label, x, y - 24);
  simCtx.fillText(`t = ${currentCarTime.toFixed(2)} s`, x, y - 14);
}

function drawCartWheel(wx, wy, radius, angle) {
  simCtx.save();
  simCtx.translate(wx, wy);
  simCtx.rotate(angle);
  
  simCtx.fillStyle = '#212529';
  simCtx.beginPath();
  simCtx.arc(0, 0, radius, 0, Math.PI * 2);
  simCtx.fill();
  
  simCtx.fillStyle = '#e9ecef';
  simCtx.beginPath();
  simCtx.arc(0, 0, radius - 3, 0, Math.PI * 2);
  simCtx.fill();
  
  simCtx.strokeStyle = '#495057';
  simCtx.lineWidth = 1;
  simCtx.beginPath();
  simCtx.moveTo(0, -(radius - 3));
  simCtx.lineTo(0, radius - 3);
  simCtx.moveTo(-(radius - 3), 0);
  simCtx.lineTo(radius - 3, 0);
  simCtx.stroke();
  
  simCtx.restore();
}

// Draw student predicted collision marker
function drawPredictionFlag(cmPos) {
  const x = cmToPx(cmPos);
  
  simCtx.save();
  simCtx.strokeStyle = '#d67b19';
  simCtx.lineWidth = 2;
  simCtx.setLineDash([4, 3]);
  
  // Vertical line across both tracks
  simCtx.beginPath();
  simCtx.moveTo(x, 25);
  simCtx.lineTo(x, CAR_BLUE_Y + 18);
  simCtx.stroke();
  simCtx.setLineDash([]);
  
  // Flag Banner
  simCtx.fillStyle = '#fff4e6';
  simCtx.strokeStyle = '#d67b19';
  simCtx.lineWidth = 1.5;
  drawRoundedRect(simCtx, x - 60, 20, 120, 20, 4);
  simCtx.fill();
  simCtx.stroke();
  
  simCtx.fillStyle = '#d9480f';
  simCtx.font = 'bold 9px sans-serif';
  simCtx.textAlign = 'center';
  simCtx.fillText(`🚩 Predicted: ${cmPos.toFixed(1)} cm`, x, 33);
  
  simCtx.restore();
}

// Draw Crossing paths visual indicator
function drawCrossingIndicator(cmPos) {
  const x = cmToPx(cmPos);
  
  simCtx.save();
  
  // Vertical linking beam between the two crossing cars
  simCtx.strokeStyle = '#d67b19';
  simCtx.lineWidth = 3;
  simCtx.beginPath();
  simCtx.moveTo(x, CAR_RED_Y - 5);
  simCtx.lineTo(x, CAR_BLUE_Y + 5);
  simCtx.stroke();
  
  // Central Meeting Pin on the track beam
  simCtx.fillStyle = 'rgba(214, 123, 25, 0.25)';
  simCtx.beginPath();
  simCtx.arc(x, TRACK_Y, 28, 0, Math.PI * 2);
  simCtx.fill();
  
  simCtx.strokeStyle = '#d67b19';
  simCtx.lineWidth = 2;
  simCtx.setLineDash([3, 3]);
  simCtx.beginPath();
  simCtx.arc(x, TRACK_Y, 28, 0, Math.PI * 2);
  simCtx.stroke();
  simCtx.setLineDash([]);
  
  simCtx.fillStyle = '#d67b19';
  simCtx.beginPath();
  simCtx.arc(x, TRACK_Y, 6, 0, Math.PI * 2);
  simCtx.fill();
  
  simCtx.fillStyle = '#ffffff';
  simCtx.beginPath();
  simCtx.arc(x, TRACK_Y, 2, 0, Math.PI * 2);
  simCtx.fill();
  
  // Label crossing
  simCtx.fillStyle = '#d9480f';
  simCtx.font = 'bold 10px sans-serif';
  simCtx.textAlign = 'center';
  simCtx.fillText(`✨ Paths Crossed: ${cmPos.toFixed(1)} cm`, x, TRACK_Y - 32);
  
  simCtx.restore();
}

// ==========================================
// Graph Canvas Drawing
// ==========================================
function drawGraph() {
  graphCtx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
  
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;
  
  const graphW = GRAPH_WIDTH - paddingLeft - paddingRight;
  const graphH = GRAPH_HEIGHT - paddingTop - paddingBottom;
  
  // 1. Dynamic Time Axis Max
  let maxTimeVal = 5.0;
  const allPoints = [...state.carRed.dataLogs, ...state.carBlue.dataLogs];
  if (state.predTime && !isNaN(state.predTime)) {
    allPoints.push({ t: state.predTime, x: state.predPos || 0 });
  }
  
  if (allPoints.length > 0) {
    const maxLogT = Math.max(...allPoints.map(p => p.t));
    if (maxLogT > 4.5) {
      maxTimeVal = Math.ceil((maxLogT + 1) / 5) * 5;
    }
  }
  
  const maxPosVal = 240.0;
  
  function timeToPx(t) {
    return paddingLeft + (t / maxTimeVal) * graphW;
  }
  
  function posToPx(x) {
    return paddingTop + graphH - (x / maxPosVal) * graphH;
  }
  
  // Background
  graphCtx.fillStyle = '#f8f9fa';
  graphCtx.fillRect(paddingLeft, paddingTop, graphW, graphH);
  
  graphCtx.strokeStyle = '#ced4da';
  graphCtx.lineWidth = 1;
  graphCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);
  
  // Grid Lines
  graphCtx.strokeStyle = '#e9ecef';
  graphCtx.lineWidth = 1;
  
  const timeStep = maxTimeVal / 10;
  for (let t = 0; t <= maxTimeVal + 1e-4; t += timeStep) {
    const x = timeToPx(t);
    graphCtx.beginPath();
    graphCtx.moveTo(x, paddingTop);
    graphCtx.lineTo(x, paddingTop + graphH);
    graphCtx.stroke();
    
    graphCtx.fillStyle = '#495057';
    graphCtx.font = '10px sans-serif';
    graphCtx.textAlign = 'center';
    graphCtx.fillText(t.toFixed(1), x, paddingTop + graphH + 15);
  }
  
  const posStep = 30;
  for (let p = 0; p <= maxPosVal; p += posStep) {
    const y = posToPx(p);
    graphCtx.beginPath();
    graphCtx.moveTo(paddingLeft, y);
    graphCtx.lineTo(paddingLeft + graphW, y);
    graphCtx.stroke();
    
    graphCtx.fillStyle = '#495057';
    graphCtx.font = '10px sans-serif';
    graphCtx.textAlign = 'right';
    graphCtx.fillText(p.toString(), paddingLeft - 8, y + 3);
  }
  
  // Axis Labels
  graphCtx.fillStyle = '#123140';
  graphCtx.font = 'bold 11px sans-serif';
  graphCtx.textAlign = 'center';
  graphCtx.fillText('Time (s)', paddingLeft + graphW / 2, paddingTop + graphH + 32);
  
  graphCtx.save();
  graphCtx.translate(18, paddingTop + graphH / 2);
  graphCtx.rotate(-Math.PI / 2);
  graphCtx.fillText('Position (cm)', 0, 0);
  graphCtx.restore();
  
  // 5. Draw Scatter Points
  // Red points
  if (state.carRed.enabled) {
    state.carRed.dataLogs.forEach(p => {
      const px = timeToPx(p.t);
      const py = posToPx(p.x);
      
      graphCtx.fillStyle = '#e03131';
      graphCtx.strokeStyle = '#ffffff';
      graphCtx.lineWidth = 1.5;
      graphCtx.beginPath();
      graphCtx.arc(px, py, 4.5, 0, Math.PI * 2);
      graphCtx.fill();
      graphCtx.stroke();
    });
  }
  
  // Blue points
  if (state.carBlue.enabled) {
    state.carBlue.dataLogs.forEach(p => {
      const px = timeToPx(p.t);
      const py = posToPx(p.x);
      
      graphCtx.fillStyle = '#1c7ed6';
      graphCtx.strokeStyle = '#ffffff';
      graphCtx.lineWidth = 1.5;
      graphCtx.beginPath();
      graphCtx.arc(px, py, 4.5, 0, Math.PI * 2);
      graphCtx.fill();
      graphCtx.stroke();
    });
  }
  
  // 6. Draw Regression Fit Lines
  if (state.isFitToggled) {
    const redFit = fitLinearRegression(state.carRed.dataLogs);
    const blueFit = fitLinearRegression(state.carBlue.dataLogs);
    
    if (redFit && state.carRed.enabled) {
      graphCtx.strokeStyle = '#c92a2a';
      graphCtx.lineWidth = 2.5;
      
      const tStart = 0;
      const tEnd = maxTimeVal;
      const xStart = redFit.slope * tStart + redFit.intercept;
      const xEnd = redFit.slope * tEnd + redFit.intercept;
      
      graphCtx.beginPath();
      graphCtx.moveTo(timeToPx(tStart), posToPx(xStart));
      graphCtx.lineTo(timeToPx(tEnd), posToPx(xEnd));
      graphCtx.stroke();
    }
    
    if (blueFit && state.carBlue.enabled) {
      graphCtx.strokeStyle = '#12518c';
      graphCtx.lineWidth = 2.5;
      
      const tStart = 0;
      const tEnd = maxTimeVal;
      const xStart = blueFit.slope * tStart + blueFit.intercept;
      const xEnd = blueFit.slope * tEnd + blueFit.intercept;
      
      graphCtx.beginPath();
      graphCtx.moveTo(timeToPx(tStart), posToPx(xStart));
      graphCtx.lineTo(timeToPx(tEnd), posToPx(xEnd));
      graphCtx.stroke();
    }
  }
  
  // 7. Draw Student Prediction Coordinate on the Graph
  if (state.predTime !== null && state.predPos !== null && !isNaN(state.predTime) && !isNaN(state.predPos)) {
    const px = timeToPx(state.predTime);
    const py = posToPx(state.predPos);
    
    graphCtx.strokeStyle = 'rgba(214, 123, 25, 0.45)';
    graphCtx.lineWidth = 1.5;
    graphCtx.setLineDash([4, 4]);
    
    graphCtx.beginPath();
    graphCtx.moveTo(px, py);
    graphCtx.lineTo(px, paddingTop + graphH);
    graphCtx.stroke();
    
    graphCtx.beginPath();
    graphCtx.moveTo(px, py);
    graphCtx.lineTo(paddingLeft, py);
    graphCtx.stroke();
    graphCtx.setLineDash([]);
    
    graphCtx.fillStyle = '#d67b19';
    graphCtx.strokeStyle = '#ffffff';
    graphCtx.lineWidth = 2;
    graphCtx.beginPath();
    graphCtx.moveTo(px, py - 7);
    graphCtx.lineTo(px + 7, py);
    graphCtx.lineTo(px, py + 7);
    graphCtx.lineTo(px - 7, py);
    graphCtx.closePath();
    graphCtx.fill();
    graphCtx.stroke();
    
    graphCtx.fillStyle = '#d9480f';
    graphCtx.font = 'bold 9px sans-serif';
    graphCtx.textAlign = 'left';
    graphCtx.fillText(`Predicted (${state.predTime.toFixed(2)}s, ${state.predPos.toFixed(1)}cm)`, px + 9, py - 2);
  }
  
  // 8. Legend
  const legendX = paddingLeft + 20;
  const legendY = paddingTop + 15;
  graphCtx.font = '500 10px sans-serif';
  graphCtx.textAlign = 'left';
  
  if (state.carRed.enabled) {
    graphCtx.fillStyle = '#e03131';
    graphCtx.beginPath();
    graphCtx.arc(legendX, legendY, 4, 0, Math.PI * 2);
    graphCtx.fill();
    
    graphCtx.fillStyle = '#495057';
    graphCtx.fillText('Red Car A (Top)', legendX + 10, legendY + 3);
  }
  
  if (state.carBlue.enabled) {
    const offset = state.carRed.enabled ? 120 : 0;
    graphCtx.fillStyle = '#1c7ed6';
    graphCtx.beginPath();
    graphCtx.arc(legendX + offset, legendY, 4, 0, Math.PI * 2);
    graphCtx.fill();
    
    graphCtx.fillStyle = '#495057';
    graphCtx.fillText('Blue Car B (Bottom)', legendX + offset + 10, legendY + 3);
  }
}

function cmToPx(cm) {
  return TRACK_PADDING + cm * ScaleFactor;
}

window.addEventListener('load', init);
