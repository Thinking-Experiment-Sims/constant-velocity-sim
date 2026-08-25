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
  ARDUINO_TRIPS,
  ARDUINO_GROUPS,
  calculateTripDuration,
  calculatePiecewisePosition,
  calculateAverageVelocityMetrics,
  TRACK_MIN,
  TRACK_MAX
} from './constantVelocityPhysics.js';

// =========================================================================
// APPLICATION STATE
// =========================================================================
let state = {
  currentActivity: 'constant', // 'constant' | 'average'

  // Activity 1: Constant Velocity State
  activePreset: '1',      // '1'..'6' or 'sandbox'
  timingMode: 'auto',     // 'auto' | 'manual'
  activeCarToRun: 'none', // 'red' | 'blue' | 'both' | 'none'
  isRunning: false,
  elapsedTime: 0.0,       // in seconds
  lastTimestamp: 0.0,     // in milliseconds
  speedMultiplier: 1.0,
  hasMet: false,
  meetingPoint: null,     // { time, position } theoretical
  
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
  
  isFitToggled: false,
  challengeUnlocked: false,
  challengeVerified: false,
  isChallengeRunning: false,
  predTime: null,
  predPos: null,
  splitFlags: [],

  // Activity 2: Average Velocity (Arduino Car) State
  avgGroup: 'A',          // 'A'..'F' | 'custom'
  avgTrial: 'trial1',     // 'trial1' | 'trial2'
  avgTripNum: 1,          // 1..8
  avgTimingMode: 'auto',  // 'auto' | 'manual'
  avgIsRunning: false,
  avgElapsedTime: 0.0,
  avgLastTimestamp: 0.0,
  avgSpeedMultiplier: 1.0,
  avgCurrentTrip: { ...ARDUINO_TRIPS[1] },
  avgCar: {
    x: 0.0,
    v: 15.0,
    wheelAngle: 0.0,
    segment: 1,
    isFinished: false
  },
  avgLoggedPoints: {
    t0: null,
    tTape: null,
    tf: null
  },
  avgAutoTriggered: {
    t0: false,
    tTape: false,
    tf: false
  }
};

// =========================================================================
// CANVAS & LAYOUT CONSTANTS
// =========================================================================
const simCanvas = document.getElementById('simCanvas');
const simCtx = simCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const graphCtx = graphCanvas.getContext('2d');

const avgSimCanvas = document.getElementById('avgSimCanvas');
const avgSimCtx = avgSimCanvas.getContext('2d');
const avgGraphCanvas = document.getElementById('avgGraphCanvas');
const avgGraphCtx = avgGraphCanvas.getContext('2d');

const SIM_WIDTH = simCanvas.width;
const SIM_HEIGHT = simCanvas.height;
const GRAPH_WIDTH = graphCanvas.width;
const GRAPH_HEIGHT = graphCanvas.height;

const TRACK_PADDING = 50; // px
const TRACK_Y = 110;      // Y center of central rail
const CAR_RED_Y = 70;     // Y center for Red Car (Top Lane)
const CAR_BLUE_Y = 150;   // Y center for Blue Car (Bottom Lane)
const RULER_Y = 215;      // Y center of ruler tape
const RULER_HEIGHT = 42;

const ScaleFactor = (SIM_WIDTH - 2 * TRACK_PADDING) / TRACK_MAX;
const MARKS = [0, 30, 60, 90, 120, 150, 180, 210, 240];

// =========================================================================
// DOM ELEMENTS
// =========================================================================
// Navigation
const btnActConstant = document.getElementById('btnActConstant');
const btnActAverage = document.getElementById('btnActAverage');
const activity1Container = document.getElementById('activity1Container');
const activity2Container = document.getElementById('activity2Container');

// Activity 1 Elements
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

const sandboxControls = document.getElementById('sandboxControls');
const sbRedStart = document.getElementById('sbRedStart');
const sbRedVel = document.getElementById('sbRedVel');
const sbBlueStart = document.getElementById('sbBlueStart');
const sbBlueVel = document.getElementById('sbBlueVel');
const sbRedStartVal = document.getElementById('sbRedStartVal');
const sbRedVelVal = document.getElementById('sbRedVelVal');
const sbBlueStartVal = document.getElementById('sbBlueStartVal');
const sbBlueVelVal = document.getElementById('sbBlueVelVal');
const sbRedDirLeft = document.getElementById('sbRedDirLeft');
const sbRedDirRight = document.getElementById('sbRedDirRight');
const sbBlueDirLeft = document.getElementById('sbBlueDirLeft');
const sbBlueDirRight = document.getElementById('sbBlueDirRight');

const redTableBody = document.getElementById('redTable').querySelector('tbody');
const blueTableBody = document.getElementById('blueTable').querySelector('tbody');
const btnClearData = document.getElementById('btnClearData');

const btnFitLine = document.getElementById('btnFitLine');
const equationDisplay = document.getElementById('equationDisplay');
const redEquationText = document.getElementById('redEquationText');
const blueEquationText = document.getElementById('blueEquationText');

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

const tabGuidedBtn = document.getElementById('tabGuidedBtn');
const tabTheoryBtn = document.getElementById('tabTheoryBtn');
const panelGuided = document.getElementById('panelGuided');
const panelTheory = document.getElementById('panelTheory');

// Activity 2 (Average Velocity) Elements
const avgGroupSelect = document.getElementById('avgGroupSelect');
const avgTrialSelect = document.getElementById('avgTrialSelect');
const customTripWrapper = document.getElementById('customTripWrapper');
const avgTripSelect = document.getElementById('avgTripSelect');
const avgTimingModeSelect = document.getElementById('avgTimingModeSelect');
const avgTripInfoText = document.getElementById('avgTripInfoText');
const btnRunAvgTrip = document.getElementById('btnRunAvgTrip');
const btnResetAvgTrip = document.getElementById('btnResetAvgTrip');
const avgManualSplitBanner = document.getElementById('avgManualSplitBanner');
const btnAvgManualSplit = document.getElementById('btnAvgManualSplit');
const bannerTapePos = document.getElementById('bannerTapePos');
const avgStatusIndicator = document.getElementById('avgStatusIndicator');
const avgStopwatch = document.getElementById('avgStopwatch');

const tableX0 = document.getElementById('tableX0');
const tableXTape = document.getElementById('tableXTape');
const tableXf = document.getElementById('tableXf');
const tableT0 = document.getElementById('tableT0');
const tableTTape = document.getElementById('tableTTape');
const tableTf = document.getElementById('tableTf');

const metricV1 = document.getElementById('metricV1');
const metricV2 = document.getElementById('metricV2');
const metricDx = document.getElementById('metricDx');
const metricDist = document.getElementById('metricDist');
const metricVavg = document.getElementById('metricVavg');
const metricSpeedAvg = document.getElementById('metricSpeedAvg');
const misconceptionCallout = document.getElementById('misconceptionCallout');
const misconceptionText = document.getElementById('misconceptionText');

// =========================================================================
// INITIALIZATION & EVENT LISTENERS
// =========================================================================
function init() {
  setupEventListeners();
  applyPreset('1');
  resetAllPositions();
  
  // Setup Average Velocity Mode Initial State
  loadAverageVelocityTrip();
  resetAvgTrip();
  
  animate(0);
}

function setupEventListeners() {
  // Activity Switcher
  btnActConstant.addEventListener('click', () => switchActivity('constant'));
  btnActAverage.addEventListener('click', () => switchActivity('average'));

  // -------------------------------------------------------------------------
  // Activity 1: Constant Velocity Listeners
  // -------------------------------------------------------------------------
  groupSelect.addEventListener('change', (e) => applyPreset(e.target.value));

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

  btnManualSplit.addEventListener('click', recordManualSplit);

  // Global Keyboard Listener for Spacebar Split
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      if (state.currentActivity === 'constant' && state.isRunning && state.timingMode === 'manual') {
        e.preventDefault();
        recordManualSplit();
      } else if (state.currentActivity === 'average' && state.avgIsRunning && state.avgTimingMode === 'manual') {
        e.preventDefault();
        recordAvgManualSplit();
      }
    }
  });

  modeSelect.addEventListener('change', (e) => {
    configureCarsAvailability(e.target.value);
    resetAllPositions();
  });

  btnRunRed.addEventListener('click', () => startSingleCar('red'));
  btnRunBlue.addEventListener('click', () => startSingleCar('blue'));
  btnReset.addEventListener('click', resetAllPositions);
  btnClearData.addEventListener('click', clearLoggedData);

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

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.speedMultiplier = parseFloat(e.target.getAttribute('data-speed'));
    });
  });

  // Sandbox bidirectional controls
  sbRedStart.addEventListener('input', (e) => {
    sbRedStartVal.textContent = e.target.value;
    state.carRed.x0 = parseFloat(e.target.value);
    resetAllPositions();
  });
  sbRedVel.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    sbRedVelVal.textContent = (val > 0 ? `+${val}` : `${val}`);
    state.carRed.v = val;
    updateSandboxDirectionButtons();
    resetAllPositions();
  });
  sbBlueStart.addEventListener('input', (e) => {
    sbBlueStartVal.textContent = e.target.value;
    state.carBlue.x0 = parseFloat(e.target.value);
    resetAllPositions();
  });
  sbBlueVel.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    sbBlueVelVal.textContent = (val > 0 ? `+${val}` : `${val}`);
    state.carBlue.v = val;
    updateSandboxDirectionButtons();
    resetAllPositions();
  });

  // Quick direction toggle buttons for Sandbox
  sbRedDirLeft.addEventListener('click', () => {
    const mag = Math.abs(parseFloat(sbRedVel.value)) || 30;
    sbRedVel.value = -mag;
    sbRedVelVal.textContent = `-${mag}`;
    state.carRed.v = -mag;
    updateSandboxDirectionButtons();
    resetAllPositions();
  });
  sbRedDirRight.addEventListener('click', () => {
    const mag = Math.abs(parseFloat(sbRedVel.value)) || 30;
    sbRedVel.value = mag;
    sbRedVelVal.textContent = `+${mag}`;
    state.carRed.v = mag;
    updateSandboxDirectionButtons();
    resetAllPositions();
  });

  sbBlueDirLeft.addEventListener('click', () => {
    const mag = Math.abs(parseFloat(sbBlueVel.value)) || 10;
    sbBlueVel.value = -mag;
    sbBlueVelVal.textContent = `-${mag}`;
    state.carBlue.v = -mag;
    updateSandboxDirectionButtons();
    resetAllPositions();
  });
  sbBlueDirRight.addEventListener('click', () => {
    const mag = Math.abs(parseFloat(sbBlueVel.value)) || 10;
    sbBlueVel.value = mag;
    sbBlueVelVal.textContent = `+${mag}`;
    state.carBlue.v = mag;
    updateSandboxDirectionButtons();
    resetAllPositions();
  });

  btnFitLine.addEventListener('click', () => {
    state.isFitToggled = !state.isFitToggled;
    if (state.isFitToggled) {
      btnFitLine.classList.add('active');
      btnFitLine.innerHTML = '<span>📐</span> Hide Line of Best Fit';
      equationDisplay.style.display = 'grid';
      fitAndDisplayEquations();
      if (hasSufficientDataToFit()) {
        unlockChallengeVerification();
      }
    } else {
      btnFitLine.classList.remove('active');
      btnFitLine.innerHTML = '<span>📐</span> Fit Line & Extract Models';
      equationDisplay.style.display = 'none';
    }
    drawGraph();
  });

  btnVerifyEquations.addEventListener('click', verifyAlgebraicEquations);
  btnRunChallenge.addEventListener('click', startChallengeCollisionRun);

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

  // -------------------------------------------------------------------------
  // Activity 2: Average Velocity Listeners
  // -------------------------------------------------------------------------
  avgGroupSelect.addEventListener('change', (e) => {
    state.avgGroup = e.target.value;
    if (state.avgGroup === 'custom') {
      customTripWrapper.style.display = 'flex';
    } else {
      customTripWrapper.style.display = 'none';
    }
    loadAverageVelocityTrip();
    resetAvgTrip();
  });

  avgTrialSelect.addEventListener('change', (e) => {
    state.avgTrial = e.target.value;
    loadAverageVelocityTrip();
    resetAvgTrip();
  });

  avgTripSelect.addEventListener('change', (e) => {
    state.avgTripNum = parseInt(e.target.value, 10);
    loadAverageVelocityTrip();
    resetAvgTrip();
  });

  avgTimingModeSelect.addEventListener('change', (e) => {
    state.avgTimingMode = e.target.value;
    if (state.avgTimingMode === 'manual') {
      avgManualSplitBanner.style.display = 'flex';
    } else {
      avgManualSplitBanner.style.display = 'none';
    }
  });

  btnRunAvgTrip.addEventListener('click', startAvgTrip);
  btnResetAvgTrip.addEventListener('click', resetAvgTrip);
  btnAvgManualSplit.addEventListener('click', recordAvgManualSplit);

  document.querySelectorAll('.avg-speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.avg-speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.avgSpeedMultiplier = parseFloat(e.target.getAttribute('data-speed'));
    });
  });
}

function updateSandboxDirectionButtons() {
  if (state.carRed.v >= 0) {
    sbRedDirRight.classList.add('active');
    sbRedDirLeft.classList.remove('active');
  } else {
    sbRedDirLeft.classList.add('active');
    sbRedDirRight.classList.remove('active');
  }

  if (state.carBlue.v >= 0) {
    sbBlueDirRight.classList.add('active');
    sbBlueDirLeft.classList.remove('active');
  } else {
    sbBlueDirLeft.classList.add('active');
    sbBlueDirRight.classList.remove('active');
  }
}

function switchActivity(act) {
  state.currentActivity = act;
  if (act === 'constant') {
    btnActConstant.classList.add('active');
    btnActAverage.classList.remove('active');
    activity1Container.style.display = 'block';
    activity2Container.style.display = 'none';
    draw();
    drawGraph();
  } else {
    btnActAverage.classList.add('active');
    btnActConstant.classList.remove('active');
    activity1Container.style.display = 'none';
    activity2Container.style.display = 'block';
    drawAvgSimulation();
    drawAvgGraph();
  }
}

// =========================================================================
// ACTIVITY 1: CONSTANT VELOCITY METHODS
// =========================================================================
function applyPreset(preset) {
  state.activePreset = preset;
  
  if (preset === 'sandbox') {
    sandboxControls.style.display = 'block';
    groupInfoText.innerHTML = `<strong>Sandbox Mode:</strong> Fully custom positions ($0\text{--}240\text{ cm}$) and bidirectional velocities ($-50\text{ to }+50\text{ cm/s}$).`;
    
    state.carRed.x0 = parseFloat(sbRedStart.value);
    state.carRed.v = parseFloat(sbRedVel.value);
    state.carBlue.x0 = parseFloat(sbBlueStart.value);
    state.carBlue.v = parseFloat(sbBlueVel.value);
    updateSandboxDirectionButtons();
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
  
  state.isFitToggled = false;
  btnFitLine.classList.remove('active');
  btnFitLine.innerHTML = '<span>📐</span> Fit Line & Extract Models';
  if (equationDisplay) equationDisplay.style.display = 'none';
  
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

function clearLoggedData() {
  resetAllPositions();
}

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
    
    state.carRed.crossedSensors.add(state.carRed.x0);
    state.carRed.dataLogs.push({ t: 0.0, x: state.carRed.x0 });
    
    btnRunRed.disabled = true;
    btnRunBlue.disabled = false;
    statusIndicator.textContent = "Running Red Car A (Top lane)...";
  } else {
    state.carBlue.x = state.carBlue.x0;
    state.carBlue.crossedSensors.clear();
    state.carBlue.dataLogs = [];
    
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
      if (diff < minDiff && diff <= 45) {
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

function updatePhysics(dt) {
  const isRedActive = state.isRunning && (state.activeCarToRun === 'red' || state.activeCarToRun === 'both');
  const isBlueActive = state.isRunning && (state.activeCarToRun === 'blue' || state.activeCarToRun === 'both');
  
  if (state.carRed.enabled && isRedActive && !isAtBoundary(state.carRed.x, state.carRed.v)) {
    state.carRed.x = calculatePosition(state.elapsedTime, state.carRed.x0, state.carRed.v);
    const wheelRadius = 15;
    const deltaCm = state.carRed.v * dt;
    state.carRed.wheelAngle += (deltaCm * ScaleFactor) / wheelRadius;
    state.carRed.x = clampPosition(state.carRed.x);
  }
  
  if (state.carBlue.enabled && isBlueActive && !isAtBoundary(state.carBlue.x, state.carBlue.v)) {
    state.carBlue.x = calculatePosition(state.elapsedTime, state.carBlue.x0, state.carBlue.v);
    const wheelRadius = 15;
    const deltaCm = state.carBlue.v * dt;
    state.carBlue.wheelAngle += (deltaCm * ScaleFactor) / wheelRadius;
    state.carBlue.x = clampPosition(state.carBlue.x);
  }
  
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
        if (state.isFitToggled) fitAndDisplayEquations();
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
        if (state.isFitToggled) fitAndDisplayEquations();
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

  if (state.carRed.enabled) {
    if (isNaN(enteredRedSlope) || isNaN(enteredRedIntercept)) {
      hints.push("Please fill in both the slope and initial position for Red Car A.");
    } else {
      const theoSlope = state.carRed.v;
      const fitSlope = redFit ? redFit.slope : theoSlope;
      const theoInt = state.carRed.x0;
      const fitInt = redFit ? redFit.intercept : theoInt;
      
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
      if (!redIntOk) hints.push(`Red Car A starting position was ${theoInt.toFixed(0)} cm.`);
    }
  } else {
    redSlopeOk = true;
    redIntOk = true;
  }

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
      if (!blueIntOk) hints.push(`Blue Car B starting position was ${theoInt.toFixed(0)} cm.`);
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

// =========================================================================
// ACTIVITY 2: AVERAGE VELOCITY (ARDUINO CAR) METHODS
// =========================================================================
function loadAverageVelocityTrip() {
  if (state.avgGroup === 'custom') {
    const tripNum = state.avgTripNum || 1;
    state.avgCurrentTrip = { ...ARDUINO_TRIPS[tripNum] };
  } else {
    const grp = ARDUINO_GROUPS[state.avgGroup] || ARDUINO_GROUPS['A'];
    state.avgCurrentTrip = { ...grp[state.avgTrial] };
  }

  // Update UI Descriptions
  avgTripInfoText.textContent = `${state.avgCurrentTrip.name}: ${state.avgCurrentTrip.description}`;
  bannerTapePos.textContent = `${state.avgCurrentTrip.xTape}`;
  
  tableX0.textContent = `${state.avgCurrentTrip.x0} cm`;
  tableXTape.textContent = `${state.avgCurrentTrip.xTape} cm`;
  tableXf.textContent = `${state.avgCurrentTrip.xf} cm`;
}

function resetAvgTrip() {
  state.avgIsRunning = false;
  state.avgElapsedTime = 0.0;
  
  state.avgCar = {
    x: state.avgCurrentTrip.x0,
    v: state.avgCurrentTrip.v1,
    wheelAngle: 0.0,
    segment: 1,
    isFinished: false
  };
  
  state.avgLoggedPoints = {
    t0: null,
    tTape: null,
    tf: null
  };
  
  state.avgAutoTriggered = {
    t0: false,
    tTape: false,
    tf: false
  };

  btnRunAvgTrip.disabled = false;
  btnAvgManualSplit.disabled = true;

  avgStatusIndicator.textContent = "Ready — click Run Arduino Car Trip";
  avgStatusIndicator.className = "status-badge";
  avgStatusIndicator.style.background = "#eef8fb";
  avgStatusIndicator.style.color = "var(--accent-strong)";
  avgStatusIndicator.style.borderColor = "#b8d1db";
  
  tableT0.textContent = '—';
  tableTTape.textContent = '—';
  tableTf.textContent = '—';

  tableT0.className = '';
  tableTTape.className = '';
  tableTf.className = '';

  metricV1.textContent = '—';
  metricV2.textContent = '—';
  metricDx.textContent = '—';
  metricDist.textContent = '—';
  metricVavg.textContent = '—';
  metricSpeedAvg.textContent = '—';
  misconceptionCallout.style.display = 'none';

  updateAvgUI();
  drawAvgSimulation();
  drawAvgGraph();
}

function startAvgTrip() {
  if (state.avgIsRunning) return;
  
  resetAvgTrip();
  state.avgIsRunning = true;
  state.avgElapsedTime = 0.0;
  state.avgLastTimestamp = performance.now();
  
  // Record t0 automatically or immediately
  state.avgLoggedPoints.t0 = 0.0;
  state.avgAutoTriggered.t0 = true;
  tableT0.textContent = '0.00 s';
  tableT0.className = 'logged-cell';

  btnRunAvgTrip.disabled = true;
  if (state.avgTimingMode === 'manual') {
    btnAvgManualSplit.disabled = false;
  }
  
  avgStatusIndicator.textContent = "Arduino Car moving (Segment 1)...";
  drawAvgSimulation();
  drawAvgGraph();
}

function recordAvgManualSplit() {
  if (!state.avgIsRunning) return;
  
  const trip = state.avgCurrentTrip;
  const carX = state.avgCar.x;
  
  // Check whether we are recording tTape or tf
  if (state.avgLoggedPoints.tTape === null) {
    const diffTape = Math.abs(carX - trip.xTape);
    if (diffTape <= 35) {
      state.avgLoggedPoints.tTape = state.avgElapsedTime;
      tableTTape.textContent = `${state.avgElapsedTime.toFixed(2)} s`;
      tableTTape.className = 'logged-cell';
      computeAndDisplayAvgMetrics();
      drawAvgGraph();
    }
  } else if (state.avgLoggedPoints.tf === null) {
    const diffF = Math.abs(carX - trip.xf);
    if (diffF <= 35) {
      state.avgLoggedPoints.tf = state.avgElapsedTime;
      tableTf.textContent = `${state.avgElapsedTime.toFixed(2)} s`;
      tableTf.className = 'logged-cell';
      computeAndDisplayAvgMetrics();
      drawAvgGraph();
    }
  }
}

function updateAvgPhysics(dt) {
  if (!state.avgIsRunning) return;
  
  const trip = state.avgCurrentTrip;
  const posObj = calculatePiecewisePosition(state.avgElapsedTime, trip);
  
  state.avgCar.x = posObj.x;
  state.avgCar.v = posObj.v;
  state.avgCar.segment = posObj.segment;
  state.avgCar.isFinished = posObj.isFinished;
  
  // Wheel rotation
  const wheelRadius = 15;
  const deltaCm = state.avgCar.v * dt;
  state.avgCar.wheelAngle += (deltaCm * ScaleFactor) / wheelRadius;
  
  // Auto-recording at transitions
  const { t1, totalTime } = calculateTripDuration(trip);
  
  if (state.avgTimingMode === 'auto') {
    if (!state.avgAutoTriggered.tTape && state.avgElapsedTime >= t1) {
      state.avgAutoTriggered.tTape = true;
      state.avgLoggedPoints.tTape = t1;
      tableTTape.textContent = `${t1.toFixed(2)} s`;
      tableTTape.className = 'logged-cell';
      avgStatusIndicator.textContent = "Transitioned at tape mark! Arduino Car moving (Segment 2)...";
      computeAndDisplayAvgMetrics();
    }
    
    if (!state.avgAutoTriggered.tf && state.avgElapsedTime >= totalTime) {
      state.avgAutoTriggered.tf = true;
      state.avgLoggedPoints.tf = totalTime;
      tableTf.textContent = `${totalTime.toFixed(2)} s`;
      tableTf.className = 'logged-cell';
      computeAndDisplayAvgMetrics();
    }
  }
  
  if (posObj.isFinished || state.avgElapsedTime >= totalTime) {
    state.avgIsRunning = false;
    btnRunAvgTrip.disabled = false;
    btnAvgManualSplit.disabled = true;
    
    // Fill in tf if in auto mode and missing
    if (state.avgLoggedPoints.tf === null) {
      state.avgLoggedPoints.tf = state.avgElapsedTime;
      tableTf.textContent = `${state.avgElapsedTime.toFixed(2)} s`;
      tableTf.className = 'logged-cell';
    }
    
    avgStatusIndicator.innerHTML = `🏁 <strong>Trip Completed!</strong> Arrived at <strong>${trip.xf} cm</strong> at ${state.avgElapsedTime.toFixed(2)} s.`;
    computeAndDisplayAvgMetrics();
    drawAvgGraph();
  }
}

function computeAndDisplayAvgMetrics() {
  const trip = state.avgCurrentTrip;
  const t0 = state.avgLoggedPoints.t0 !== null ? state.avgLoggedPoints.t0 : 0.0;
  const tTape = state.avgLoggedPoints.tTape;
  const tf = state.avgLoggedPoints.tf;
  
  if (tTape !== null) {
    const dt1 = tTape - t0;
    const dx1 = trip.xTape - trip.x0;
    const v1 = dt1 > 0 ? dx1 / dt1 : 0;
    metricV1.textContent = `${v1 > 0 ? '+' : ''}${v1.toFixed(1)} cm/s`;
  }
  
  if (tTape !== null && tf !== null) {
    const dt2 = tf - tTape;
    const dx2 = trip.xf - trip.xTape;
    const v2 = dt2 > 0 ? dx2 / dt2 : 0;
    metricV2.textContent = `${v2 > 0 ? '+' : ''}${v2.toFixed(1)} cm/s`;
    
    const metrics = calculateAverageVelocityMetrics(trip.x0, trip.xTape, trip.xf, t0, tTape, tf);
    
    metricDx.textContent = `${metrics.total.dx > 0 ? '+' : ''}${metrics.total.dx.toFixed(1)} cm`;
    metricDist.textContent = `${metrics.total.distance.toFixed(1)} cm`;
    metricVavg.textContent = `${metrics.total.averageVelocity > 0 ? '+' : ''}${metrics.total.averageVelocity.toFixed(2)} cm/s`;
    metricSpeedAvg.textContent = `${metrics.total.averageSpeed.toFixed(2)} cm/s`;
    
    // Show Misconception Comparison
    misconceptionCallout.style.display = 'block';
    misconceptionText.innerHTML = `
      • <strong>True Average Velocity (Δ<i>x</i> / Δ<i>t</i>):</strong> <strong>${metrics.total.averageVelocity.toFixed(2)} cm/s</strong><br>
      • <strong>Arithmetic Mean (<i>v</i>₁ + <i>v</i>₂) / 2:</strong> <strong>${metrics.total.arithmeticMeanVelocity.toFixed(2)} cm/s</strong><br>
      Notice why they differ: The car spends unequal amounts of time in Segment 1 (Δ<i>t</i>₁ = ${metrics.segment1.dt.toFixed(2)} s) and Segment 2 (Δ<i>t</i>₂ = ${metrics.segment2.dt.toFixed(2)} s). Average velocity is always time-weighted!
    `;
  }
}

function updateAvgUI() {
  const s = Math.floor(state.avgElapsedTime % 60).toString().padStart(2, '0');
  const ms = Math.floor((state.avgElapsedTime % 1) * 100).toString().padStart(2, '0');
  avgStopwatch.textContent = `${s}.${ms} s`;
}

// =========================================================================
// ANIMATION & CANVAS RENDERERS
// =========================================================================
function animate(timestamp) {
  if (state.currentActivity === 'constant') {
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
  } else {
    // Activity 2: Average Velocity Mode
    if (state.avgIsRunning) {
      const dt = Math.min((timestamp - state.avgLastTimestamp) / 1000, 0.1) * state.avgSpeedMultiplier;
      state.avgLastTimestamp = timestamp;
      state.avgElapsedTime += dt;
      
      updateAvgPhysics(dt);
    }
    updateAvgUI();
    drawAvgSimulation();
  }
  
  requestAnimationFrame(animate);
}

// -------------------------------------------------------------------------
// Constant Velocity Canvases Drawing
// -------------------------------------------------------------------------
function draw() {
  simCtx.clearRect(0, 0, SIM_WIDTH, SIM_HEIGHT);
  
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
  
  // Dual Rails & Central Dividing Beam
  simCtx.strokeStyle = '#c8dbe3';
  simCtx.lineWidth = 3;
  simCtx.beginPath();
  simCtx.moveTo(TRACK_PADDING, TRACK_Y - 14);
  simCtx.lineTo(SIM_WIDTH - TRACK_PADDING, TRACK_Y - 14);
  simCtx.stroke();

  simCtx.fillStyle = '#e9f4fb';
  simCtx.fillRect(TRACK_PADDING, TRACK_Y - 10, SIM_WIDTH - 2 * TRACK_PADDING, 20);
  simCtx.strokeStyle = '#a9c4cf';
  simCtx.lineWidth = 2;
  simCtx.strokeRect(TRACK_PADDING, TRACK_Y - 10, SIM_WIDTH - 2 * TRACK_PADDING, 20);

  simCtx.strokeStyle = '#0f7e9b';
  simCtx.lineWidth = 1.5;
  simCtx.setLineDash([8, 6]);
  simCtx.beginPath();
  simCtx.moveTo(TRACK_PADDING, TRACK_Y);
  simCtx.lineTo(SIM_WIDTH - TRACK_PADDING, TRACK_Y);
  simCtx.stroke();
  simCtx.setLineDash([]);

  simCtx.strokeStyle = '#c8dbe3';
  simCtx.lineWidth = 3;
  simCtx.beginPath();
  simCtx.moveTo(TRACK_PADDING, TRACK_Y + 14);
  simCtx.lineTo(SIM_WIDTH - TRACK_PADDING, TRACK_Y + 14);
  simCtx.stroke();
  
  simCtx.fillStyle = '#61808b';
  simCtx.fillRect(TRACK_PADDING - 6, CAR_RED_Y - 10, 6, 95);
  simCtx.fillRect(SIM_WIDTH - TRACK_PADDING, CAR_RED_Y - 10, 6, 95);
  
  drawRulerTape(simCtx);
  
  if (state.predPos !== null && !isNaN(state.predPos)) {
    drawPredictionFlag(simCtx, state.predPos);
  }
  
  if (state.carRed.enabled) {
    const isRedActive = state.activeCarToRun === 'red' || state.activeCarToRun === 'both';
    drawCartoonCar(simCtx, state.carRed.x, CAR_RED_Y, 'red', state.carRed.v, state.carRed.wheelAngle, isRedActive);
  }
  
  if (state.carBlue.enabled) {
    const isBlueActive = state.activeCarToRun === 'blue' || state.activeCarToRun === 'both';
    drawCartoonCar(simCtx, state.carBlue.x, CAR_BLUE_Y, 'blue', state.carBlue.v, state.carBlue.wheelAngle, isBlueActive);
  }
  
  if (state.hasMet && state.meetingPoint) {
    drawCrossingIndicator(simCtx, state.meetingPoint.position);
  }
}

function drawGraph() {
  graphCtx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
  
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;
  
  const graphW = GRAPH_WIDTH - paddingLeft - paddingRight;
  const graphH = GRAPH_HEIGHT - paddingTop - paddingBottom;
  
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
  
  function timeToPx(t) { return paddingLeft + (t / maxTimeVal) * graphW; }
  function posToPx(x) { return paddingTop + graphH - (x / maxPosVal) * graphH; }
  
  graphCtx.fillStyle = '#f8f9fa';
  graphCtx.fillRect(paddingLeft, paddingTop, graphW, graphH);
  graphCtx.strokeStyle = '#ced4da';
  graphCtx.lineWidth = 1;
  graphCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);
  
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
  
  for (let p = 0; p <= maxPosVal; p += 30) {
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
  
  graphCtx.fillStyle = '#123140';
  graphCtx.font = 'bold 11px sans-serif';
  graphCtx.textAlign = 'center';
  graphCtx.fillText('Time (s)', paddingLeft + graphW / 2, paddingTop + graphH + 32);
  
  graphCtx.save();
  graphCtx.translate(18, paddingTop + graphH / 2);
  graphCtx.rotate(-Math.PI / 2);
  graphCtx.fillText('Position (cm)', 0, 0);
  graphCtx.restore();
  
  // Scatter points
  if (state.carRed.enabled) {
    state.carRed.dataLogs.forEach(p => {
      graphCtx.fillStyle = '#e03131';
      graphCtx.strokeStyle = '#ffffff';
      graphCtx.lineWidth = 1.5;
      graphCtx.beginPath();
      graphCtx.arc(timeToPx(p.t), posToPx(p.x), 4.5, 0, Math.PI * 2);
      graphCtx.fill();
      graphCtx.stroke();
    });
  }
  
  if (state.carBlue.enabled) {
    state.carBlue.dataLogs.forEach(p => {
      graphCtx.fillStyle = '#1c7ed6';
      graphCtx.strokeStyle = '#ffffff';
      graphCtx.lineWidth = 1.5;
      graphCtx.beginPath();
      graphCtx.arc(timeToPx(p.t), posToPx(p.x), 4.5, 0, Math.PI * 2);
      graphCtx.fill();
      graphCtx.stroke();
    });
  }
  
  // Regression Fit Lines
  if (state.isFitToggled) {
    const redFit = fitLinearRegression(state.carRed.dataLogs);
    const blueFit = fitLinearRegression(state.carBlue.dataLogs);
    
    if (redFit && state.carRed.enabled) {
      graphCtx.strokeStyle = '#c92a2a';
      graphCtx.lineWidth = 2.5;
      graphCtx.beginPath();
      graphCtx.moveTo(timeToPx(0), posToPx(redFit.intercept));
      graphCtx.lineTo(timeToPx(maxTimeVal), posToPx(redFit.slope * maxTimeVal + redFit.intercept));
      graphCtx.stroke();
    }
    
    if (blueFit && state.carBlue.enabled) {
      graphCtx.strokeStyle = '#12518c';
      graphCtx.lineWidth = 2.5;
      graphCtx.beginPath();
      graphCtx.moveTo(timeToPx(0), posToPx(blueFit.intercept));
      graphCtx.lineTo(timeToPx(maxTimeVal), posToPx(blueFit.slope * maxTimeVal + blueFit.intercept));
      graphCtx.stroke();
    }
  }
  
  // Prediction Coordinate
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
  
  // Legend
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

// -------------------------------------------------------------------------
// Average Velocity Canvases Drawing
// -------------------------------------------------------------------------
function drawAvgSimulation() {
  avgSimCtx.clearRect(0, 0, SIM_WIDTH, SIM_HEIGHT);
  const trip = state.avgCurrentTrip;
  
  // 1. Dotted marks
  MARKS.forEach(pos => {
    const x = cmToPx(pos);
    avgSimCtx.strokeStyle = 'rgba(15, 126, 155, 0.15)';
    avgSimCtx.lineWidth = 1.5;
    avgSimCtx.setLineDash([5, 5]);
    avgSimCtx.beginPath();
    avgSimCtx.moveTo(x, 15);
    avgSimCtx.lineTo(x, RULER_Y - 2);
    avgSimCtx.stroke();
    avgSimCtx.setLineDash([]);
    
    avgSimCtx.fillStyle = 'rgba(12, 54, 68, 0.45)';
    avgSimCtx.font = '500 9px "IBM Plex Sans", sans-serif';
    avgSimCtx.textAlign = 'center';
    avgSimCtx.fillText(`${pos} cm`, x, 14);
  });
  
  // 2. Track Rail
  const TRACK_CENTER_Y = 110;
  avgSimCtx.fillStyle = '#e9f4fb';
  avgSimCtx.fillRect(TRACK_PADDING, TRACK_CENTER_Y - 8, SIM_WIDTH - 2 * TRACK_PADDING, 16);
  avgSimCtx.strokeStyle = '#0f7e9b';
  avgSimCtx.lineWidth = 2;
  avgSimCtx.strokeRect(TRACK_PADDING, TRACK_CENTER_Y - 8, SIM_WIDTH - 2 * TRACK_PADDING, 16);

  // End Bumpers
  avgSimCtx.fillStyle = '#61808b';
  avgSimCtx.fillRect(TRACK_PADDING - 6, TRACK_CENTER_Y - 25, 6, 50);
  avgSimCtx.fillRect(SIM_WIDTH - TRACK_PADDING, TRACK_CENTER_Y - 25, 6, 50);
  
  // 3. Ruler Tape
  drawRulerTape(avgSimCtx);
  
  // 4. Draw Transition Tape Mark (Xtape) Banner
  drawTapeMarker(avgSimCtx, trip.xTape);
  
  // 5. Draw Start (X0) and Finish (Xf) flags
  drawLocationFlag(avgSimCtx, trip.x0, `Start X₀ (${trip.x0} cm)`, '#1a7f4e', 40);
  drawLocationFlag(avgSimCtx, trip.xf, `Finish X_f (${trip.xf} cm)`, '#c92a2a', 65);
  
  // 6. Draw Arduino Car
  drawArduinoCar(avgSimCtx, state.avgCar.x, TRACK_CENTER_Y - 4, state.avgCar.v, state.avgCar.wheelAngle, state.avgCar.segment);
}

function drawTapeMarker(ctx, cmPos) {
  const x = cmToPx(cmPos);
  
  ctx.save();
  // Striped Yellow/Amber Warning Tape
  ctx.fillStyle = '#f59f00';
  ctx.fillRect(x - 5, 85, 10, 45);
  
  ctx.strokeStyle = '#d9480f';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 5, 85, 10, 45);
  
  // Vertical Tape Flag
  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 20);
  ctx.lineTo(x, 85);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.fillStyle = '#fff4e6';
  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x - 55, 18, 110, 20, 4);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#d9480f';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🚩 Tape Mark: ${cmPos} cm`, x, 31);
  
  ctx.restore();
}

function drawLocationFlag(ctx, cmPos, text, color, yOffset) {
  const x = cmToPx(cmPos);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, yOffset);
  ctx.lineTo(x, 95);
  ctx.stroke();
  
  ctx.fillStyle = color;
  ctx.font = 'bold 8.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, yOffset - 3);
  ctx.restore();
}

function drawArduinoCar(ctx, cmPos, y, velocity, wheelAngle, segment) {
  const x = cmToPx(cmPos);
  
  ctx.save();
  ctx.translate(x, y);
  
  const isMovingLeft = velocity < 0;
  if (isMovingLeft) {
    ctx.scale(-1, 1);
  }
  
  const w = 62;
  const primaryColor = '#0b7285';
  const shadowColor = '#084b57';
  
  // Wheels
  drawCartWheel(ctx, -18, 9, 8, wheelAngle);
  drawCartWheel(ctx, 18, 9, 8, wheelAngle);
  
  // Arduino Chassis
  ctx.fillStyle = primaryColor;
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, -w / 2, -7, w, 14, 3);
  ctx.fill();
  ctx.stroke();
  
  // Arduino Board PCB & LEDs
  ctx.fillStyle = '#1098ad';
  drawRoundedRect(ctx, -w / 2 + 10, -15, w - 20, 9, 2);
  ctx.fill();
  ctx.stroke();
  
  // Microcontroller chip
  ctx.fillStyle = '#212529';
  ctx.fillRect(-8, -13, 16, 6);
  
  // Blinking green LED
  ctx.fillStyle = '#51cf66';
  ctx.beginPath();
  ctx.arc(w / 2 - 16, -11, 2.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
  
  // Labels
  ctx.fillStyle = '#0b7285';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Arduino Car (${segment === 1 ? 'Seg 1' : 'Seg 2'})`, x, y - 24);
  ctx.fillText(`v = ${velocity > 0 ? '+' : ''}${velocity.toFixed(0)} cm/s`, x, y - 14);
}

function drawAvgGraph() {
  avgGraphCtx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
  
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;
  
  const graphW = GRAPH_WIDTH - paddingLeft - paddingRight;
  const graphH = GRAPH_HEIGHT - paddingTop - paddingBottom;
  
  const trip = state.avgCurrentTrip;
  const { totalTime } = calculateTripDuration(trip);
  let maxT = Math.max(10.0, Math.ceil((totalTime + 2) / 5) * 5);
  
  if (state.avgLoggedPoints.tf) {
    maxT = Math.max(maxT, Math.ceil((state.avgLoggedPoints.tf + 2) / 5) * 5);
  }
  
  const maxPosVal = 240.0;
  function timeToPx(t) { return paddingLeft + (t / maxT) * graphW; }
  function posToPx(x) { return paddingTop + graphH - (x / maxPosVal) * graphH; }
  
  // Background
  avgGraphCtx.fillStyle = '#f8f9fa';
  avgGraphCtx.fillRect(paddingLeft, paddingTop, graphW, graphH);
  avgGraphCtx.strokeStyle = '#ced4da';
  avgGraphCtx.lineWidth = 1;
  avgGraphCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);
  
  // Grid
  avgGraphCtx.strokeStyle = '#e9ecef';
  avgGraphCtx.lineWidth = 1;
  for (let t = 0; t <= maxT + 1e-4; t += maxT / 10) {
    const x = timeToPx(t);
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(x, paddingTop);
    avgGraphCtx.lineTo(x, paddingTop + graphH);
    avgGraphCtx.stroke();
    
    avgGraphCtx.fillStyle = '#495057';
    avgGraphCtx.font = '10px sans-serif';
    avgGraphCtx.textAlign = 'center';
    avgGraphCtx.fillText(t.toFixed(1), x, paddingTop + graphH + 15);
  }
  
  for (let p = 0; p <= maxPosVal; p += 30) {
    const y = posToPx(p);
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(paddingLeft, y);
    avgGraphCtx.lineTo(paddingLeft + graphW, y);
    avgGraphCtx.stroke();
    
    avgGraphCtx.fillStyle = '#495057';
    avgGraphCtx.font = '10px sans-serif';
    avgGraphCtx.textAlign = 'right';
    avgGraphCtx.fillText(p.toString(), paddingLeft - 8, y + 3);
  }
  
  avgGraphCtx.fillStyle = '#123140';
  avgGraphCtx.font = 'bold 11px sans-serif';
  avgGraphCtx.textAlign = 'center';
  avgGraphCtx.fillText('Time (s)', paddingLeft + graphW / 2, paddingTop + graphH + 32);
  
  avgGraphCtx.save();
  avgGraphCtx.translate(18, paddingTop + graphH / 2);
  avgGraphCtx.rotate(-Math.PI / 2);
  avgGraphCtx.fillText('Position (cm)', 0, 0);
  avgGraphCtx.restore();
  
  // Draw Theoretical / Logged Piecewise Segments
  const t0 = state.avgLoggedPoints.t0 !== null ? state.avgLoggedPoints.t0 : 0.0;
  const tTape = state.avgLoggedPoints.tTape;
  const tf = state.avgLoggedPoints.tf;
  
  // Segment 1 Line
  if (tTape !== null) {
    avgGraphCtx.strokeStyle = '#0b7285';
    avgGraphCtx.lineWidth = 3;
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(timeToPx(t0), posToPx(trip.x0));
    avgGraphCtx.lineTo(timeToPx(tTape), posToPx(trip.xTape));
    avgGraphCtx.stroke();
  }
  
  // Segment 2 Line
  if (tTape !== null && tf !== null) {
    avgGraphCtx.strokeStyle = '#d67b19';
    avgGraphCtx.lineWidth = 3;
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(timeToPx(tTape), posToPx(trip.xTape));
    avgGraphCtx.lineTo(timeToPx(tf), posToPx(trip.xf));
    avgGraphCtx.stroke();
    
    // Average Velocity Chord Line (Dashed Green)
    avgGraphCtx.strokeStyle = '#1a7f4e';
    avgGraphCtx.lineWidth = 2.5;
    avgGraphCtx.setLineDash([6, 4]);
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(timeToPx(t0), posToPx(trip.x0));
    avgGraphCtx.lineTo(timeToPx(tf), posToPx(trip.xf));
    avgGraphCtx.stroke();
    avgGraphCtx.setLineDash([]);
  }
  
  // Plot Points
  const pts = [];
  if (t0 !== null) pts.push({ t: t0, x: trip.x0, label: 'X₀', color: '#1a7f4e' });
  if (tTape !== null) pts.push({ t: tTape, x: trip.xTape, label: 'X_tape', color: '#f59f00' });
  if (tf !== null) pts.push({ t: tf, x: trip.xf, label: 'X_f', color: '#c92a2a' });
  
  pts.forEach(p => {
    const px = timeToPx(p.t);
    const py = posToPx(p.x);
    avgGraphCtx.fillStyle = p.color;
    avgGraphCtx.strokeStyle = '#ffffff';
    avgGraphCtx.lineWidth = 2;
    avgGraphCtx.beginPath();
    avgGraphCtx.arc(px, py, 6, 0, Math.PI * 2);
    avgGraphCtx.fill();
    avgGraphCtx.stroke();
    
    avgGraphCtx.fillStyle = '#123140';
    avgGraphCtx.font = 'bold 9px sans-serif';
    avgGraphCtx.textAlign = 'left';
    avgGraphCtx.fillText(`${p.label} (${p.t.toFixed(2)}s, ${p.x}cm)`, px + 8, py - 4);
  });
  
  // Legend
  const legendX = paddingLeft + 15;
  const legendY = paddingTop + 15;
  avgGraphCtx.font = '500 10px sans-serif';
  avgGraphCtx.textAlign = 'left';
  
  avgGraphCtx.fillStyle = '#0b7285';
  avgGraphCtx.fillRect(legendX, legendY - 5, 12, 4);
  avgGraphCtx.fillStyle = '#495057';
  avgGraphCtx.fillText('Segment 1', legendX + 18, legendY);
  
  avgGraphCtx.fillStyle = '#d67b19';
  avgGraphCtx.fillRect(legendX + 85, legendY - 5, 12, 4);
  avgGraphCtx.fillStyle = '#495057';
  avgGraphCtx.fillText('Segment 2', legendX + 103, legendY);
  
  avgGraphCtx.strokeStyle = '#1a7f4e';
  avgGraphCtx.setLineDash([4, 2]);
  avgGraphCtx.beginPath();
  avgGraphCtx.moveTo(legendX + 175, legendY - 3);
  avgGraphCtx.lineTo(legendX + 195, legendY - 3);
  avgGraphCtx.stroke();
  avgGraphCtx.setLineDash([]);
  avgGraphCtx.fillStyle = '#495057';
  avgGraphCtx.fillText('Average Velocity Chord', legendX + 202, legendY);
}

// =========================================================================
// CANVAS DRAWING HELPERS
// =========================================================================
function drawRulerTape(ctx) {
  const yTop = RULER_Y - RULER_HEIGHT / 2;
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(TRACK_PADDING, yTop, SIM_WIDTH - 2 * TRACK_PADDING, RULER_HEIGHT);
  ctx.strokeStyle = '#c8dbe3';
  ctx.lineWidth = 1;
  ctx.strokeRect(TRACK_PADDING, yTop, SIM_WIDTH - 2 * TRACK_PADDING, RULER_HEIGHT);
  
  ctx.fillStyle = '#123140';
  ctx.strokeStyle = '#123140';
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "IBM Plex Sans", sans-serif';
  
  for (let cm = 0; cm <= TRACK_MAX; cm += 1) {
    const x = cmToPx(cm);
    
    if (cm % 30 === 0) {
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTop + 14);
      ctx.stroke();
      ctx.fillText(`${cm}`, x, yTop + 26);
    } else if (cm % 10 === 0) {
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTop + 9);
      ctx.stroke();
    } else if (cm % 5 === 0) {
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTop + 6);
      ctx.stroke();
    } else {
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTop + 4);
      ctx.stroke();
    }
  }
}

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

function drawCartWheel(ctx, wx, wy, radius, angle) {
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(angle);
  
  ctx.fillStyle = '#212529';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#e9ecef';
  ctx.beginPath();
  ctx.arc(0, 0, radius - 3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#495057';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -(radius - 3));
  ctx.lineTo(0, radius - 3);
  ctx.moveTo(-(radius - 3), 0);
  ctx.lineTo(radius - 3, 0);
  ctx.stroke();
  
  ctx.restore();
}

function drawCartoonCar(ctx, cmPos, y, color, velocity, wheelAngle, isActive) {
  const x = cmToPx(cmPos);
  
  ctx.save();
  ctx.translate(x, y);
  
  const isMovingLeft = velocity < 0;
  if (isMovingLeft) {
    ctx.scale(-1, 1);
  }
  
  const w = 58;
  const primaryColor = color === 'red' ? '#e03131' : '#1c7ed6';
  const shadowColor = color === 'red' ? '#c92a2a' : '#1864ab';
  
  drawCartWheel(ctx, -16, 9, 8, wheelAngle);
  drawCartWheel(ctx, 16, 9, 8, wheelAngle);
  
  ctx.fillStyle = primaryColor;
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, -w / 2, -6, w, 12, 3);
  ctx.fill();
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 10, -6);
  ctx.lineTo(-w / 2 + 18, -16);
  ctx.lineTo(w / 2 - 15, -16);
  ctx.lineTo(w / 2 - 8, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#eef8fb';
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 12, -7);
  ctx.lineTo(-w / 2 + 19, -14);
  ctx.lineTo(-1, -14);
  ctx.lineTo(-1, -7);
  ctx.closePath();
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(1, -7);
  ctx.lineTo(1, -14);
  ctx.lineTo(w / 2 - 17, -14);
  ctx.lineTo(w / 2 - 10, -7);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#ffec99';
  ctx.beginPath();
  ctx.arc(w / 2 - 1, -2, 2.5, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  
  ctx.restore();
  
  ctx.fillStyle = color === 'red' ? '#c92a2a' : '#12518c';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  const label = color === 'red' ? 'Red Car A (Top)' : 'Blue Car B (Bottom)';
  
  const currentCarTime = (state.activeCarToRun === 'both' || state.activeCarToRun === color) ? state.elapsedTime : 0.0;
  ctx.fillText(label, x, y - 24);
  ctx.fillText(`t = ${currentCarTime.toFixed(2)} s`, x, y - 14);
}

function drawPredictionFlag(ctx, cmPos) {
  const x = cmToPx(cmPos);
  
  ctx.save();
  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 25);
  ctx.lineTo(x, CAR_BLUE_Y + 18);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.fillStyle = '#fff4e6';
  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x - 60, 20, 120, 20, 4);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#d9480f';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🚩 Predicted: ${cmPos.toFixed(1)} cm`, x, 33);
  ctx.restore();
}

function drawCrossingIndicator(ctx, cmPos) {
  const x = cmToPx(cmPos);
  ctx.save();
  
  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, CAR_RED_Y - 5);
  ctx.lineTo(x, CAR_BLUE_Y + 5);
  ctx.stroke();
  
  ctx.fillStyle = 'rgba(214, 123, 25, 0.25)';
  ctx.beginPath();
  ctx.arc(x, TRACK_Y, 28, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, TRACK_Y, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.fillStyle = '#d67b19';
  ctx.beginPath();
  ctx.arc(x, TRACK_Y, 6, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, TRACK_Y, 2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#d9480f';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`✨ Paths Crossed: ${cmPos.toFixed(1)} cm`, x, TRACK_Y - 32);
  ctx.restore();
}

function cmToPx(cm) {
  return TRACK_PADDING + cm * ScaleFactor;
}

window.addEventListener('load', init);
