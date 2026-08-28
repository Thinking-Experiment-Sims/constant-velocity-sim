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
  calculateWalkerRoundTrip,
  calculateRoundTripMetrics,
  calculateRelayPosition,
  calculateRelayMetrics,
  calculateRequiredSegmentSpeed,
  RELAY_CONFIG,
  ROUND_TRIP_CONFIG,
  TRACK_MIN,
  TRACK_MAX
} from './constantVelocityPhysics.js';

// =========================================================================
// APPLICATION STATE
// =========================================================================
let state = {
  currentActivity: 'constant', // 'constant' | 'average' | 'walker'

  // Activity 1: Constant Velocity State
  activePreset: '1',
  timingMode: 'auto',
  activeCarToRun: 'none',
  isRunning: false,
  elapsedTime: 0.0,
  lastTimestamp: 0.0,
  speedMultiplier: 1.0,
  hasMet: false,
  meetingPoint: null,
  
  carRed: {
    color: 'red',
    x: 0.0,
    x0: 0.0,
    v: VELOCITY_RED,
    enabled: true,
    crossedSensors: new Set(),
    wheelAngle: 0.0,
    dataLogs: []
  },
  carBlue: {
    color: 'blue',
    x: 210.0,
    x0: 210.0,
    v: -VELOCITY_BLUE,
    enabled: true,
    crossedSensors: new Set(),
    wheelAngle: 0.0,
    dataLogs: []
  },
  
  isFitToggled: false,
  challengeUnlocked: false,
  challengeVerified: false,
  isChallengeRunning: false,
  predTime: null,
  predPos: null,
  splitFlags: [],

  // Activity 2: Average Velocity (Arduino Car) State
  avgGroup: 'A',
  avgTrial: 'trial1',
  avgTripNum: 1,
  avgTimingMode: 'auto',
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
  },

  // Activity 3: Walker & Relay Activities State
  walkerSubMode: 'roundtrip', // 'roundtrip' | 'relay' | 'challenge' | 'custom'
  
  // Part 1 & 2: Round Trip
  rtTurnDist: 10.0,
  rtTimingMode: 'auto',
  rtIsRunning: false,
  rtElapsedTime: 0.0,
  rtLastTimestamp: 0.0,
  rtSpeedMultiplier: 1.0,
  rtDraggingCone: false,
  rtWalker: {
    x: 0.0,
    v: 4.0,
    segment: 1,
    isFinished: false,
    stepPhase: 0.0
  },
  rtLoggedTimes: {
    t0: 0.0,
    tTurn: null,
    tFinal: null
  },
  rtAutoLogged: {
    tTurn: false,
    tFinal: false
  },

  // Part 3 & 4: Relay
  relayTimingMode: 'auto',
  relayIsRunning: false,
  relayElapsedTime: 0.0,
  relayLastTimestamp: 0.0,
  relaySpeedMultiplier: 1.0,
  relayRunners: {
    x: 0.0,
    activeStudent: 1,
    isFinished: false,
    stepPhase: 0.0
  },
  relayLoggedTimes: {
    t1: null,
    t2: null,
    t3: null
  },
  relayAutoLogged: {
    t1: false,
    t2: false,
    t3: false
  },

  // Part 5: Challenge
  challIsRunning: false,
  challElapsedTime: 0.0,
  challLastTimestamp: 0.0,
  challRunner: {
    x: 0.0,
    activeStudent: 1,
    isFinished: false,
    stepPhase: 0.0
  },

  // Sub-Tab 4: Custom Sandbox
  customX0: 0.0,
  customXTurn: 12.0,
  customXf: 4.0,
  customV1: 4.0,
  customV2: 2.0,
  customDraggingMarker: null, // 'x0' | 'xturn' | 'xf'
  customIsRunning: false,
  customElapsedTime: 0.0,
  customLastTimestamp: 0.0,
  customWalker: {
    x: 0.0,
    v: 4.0,
    segment: 1,
    isFinished: false,
    stepPhase: 0.0
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

const walkerCanvas = document.getElementById('walkerCanvas');
const walkerCtx = walkerCanvas.getContext('2d');
const rtGraphCanvas = document.getElementById('rtGraphCanvas');
const rtGraphCtx = rtGraphCanvas.getContext('2d');

const relayCanvas = document.getElementById('relayCanvas');
const relayCtx = relayCanvas.getContext('2d');
const relayGraphCanvas = document.getElementById('relayGraphCanvas');
const relayGraphCtx = relayGraphCanvas.getContext('2d');

const challCanvas = document.getElementById('challCanvas');
const challCtx = challCanvas.getContext('2d');

const customCanvas = document.getElementById('customCanvas');
const customCtx = customCanvas.getContext('2d');
const customGraphCanvas = document.getElementById('customGraphCanvas');
const customGraphCtx = customGraphCanvas.getContext('2d');

const SIM_WIDTH = simCanvas.width;
const SIM_HEIGHT = simCanvas.height;
const GRAPH_WIDTH = graphCanvas.width;
const GRAPH_HEIGHT = graphCanvas.height;

const TRACK_PADDING = 50;
const TRACK_Y = 110;
const CAR_RED_Y = 70;
const CAR_BLUE_Y = 150;
const RULER_Y = 215;
const RULER_HEIGHT = 42;

const ScaleFactor = (SIM_WIDTH - 2 * TRACK_PADDING) / TRACK_MAX;
const MARKS = [0, 30, 60, 90, 120, 150, 180, 210, 240];

const METER_MAX = 20.0;
const MeterScaleFactor = (SIM_WIDTH - 2 * TRACK_PADDING) / METER_MAX;

// =========================================================================
// DOM ELEMENTS
// =========================================================================
// Navigation
const btnActConstant = document.getElementById('btnActConstant');
const btnActAverage = document.getElementById('btnActAverage');
const btnActWalker = document.getElementById('btnActWalker');
const activity1Container = document.getElementById('activity1Container');
const activity2Container = document.getElementById('activity2Container');
const activity3Container = document.getElementById('activity3Container');

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

// Activity 2 Elements
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

// Activity 3: Walker & Relay Elements
const btnSubRoundTrip = document.getElementById('btnSubRoundTrip');
const btnSubRelay = document.getElementById('btnSubRelay');
const btnSubChallenge = document.getElementById('btnSubChallenge');
const btnSubCustomSandbox = document.getElementById('btnSubCustomSandbox');
const walkerRoundTripSection = document.getElementById('walkerRoundTripSection');
const walkerRelaySection = document.getElementById('walkerRelaySection');
const walkerChallengeSection = document.getElementById('walkerChallengeSection');
const walkerCustomSection = document.getElementById('walkerCustomSection');

const rtTurnDistInput = document.getElementById('rtTurnDist');
const rtTurnDisplay = document.getElementById('rtTurnDisplay');
const rtTimingMode = document.getElementById('rtTimingMode');
const btnRunRoundTrip = document.getElementById('btnRunRoundTrip');
const btnResetRoundTrip = document.getElementById('btnResetRoundTrip');
const rtManualActionsBanner = document.getElementById('rtManualActionsBanner');
const rtBannerTurnPos = document.getElementById('rtBannerTurnPos');
const btnRtTimer2Stop = document.getElementById('btnRtTimer2Stop');
const btnRtTimer1Stop = document.getElementById('btnRtTimer1Stop');
const rtStatusIndicator = document.getElementById('rtStatusIndicator');
const rtTimer2Display = document.getElementById('rtTimer2Display');
const rtTimer1Display = document.getElementById('rtTimer1Display');
const rtTableXTurn = document.getElementById('rtTableXTurn');
const rtTableTTurn = document.getElementById('rtTableTTurn');
const rtTableTFinal = document.getElementById('rtTableTFinal');
const rtMetricV1 = document.getElementById('rtMetricV1');
const rtMetricV2 = document.getElementById('rtMetricV2');
const rtMetricDx = document.getElementById('rtMetricDx');
const rtMetricDist = document.getElementById('rtMetricDist');
const rtMetricVavg = document.getElementById('rtMetricVavg');
const rtMetricSpeedAvg = document.getElementById('rtMetricSpeedAvg');
const rtMisconceptionCallout = document.getElementById('rtMisconceptionCallout');
const rtMisconceptionText = document.getElementById('rtMisconceptionText');

const relayTimingMode = document.getElementById('relayTimingMode');
const btnRunRelay = document.getElementById('btnRunRelay');
const btnResetRelay = document.getElementById('btnResetRelay');
const relayManualBanner = document.getElementById('relayManualBanner');
const btnRelayTimer1Stop = document.getElementById('btnRelayTimer1Stop');
const btnRelayTimer2Stop = document.getElementById('btnRelayTimer2Stop');
const btnRelayTimer3Stop = document.getElementById('btnRelayTimer3Stop');
const relayStatusIndicator = document.getElementById('relayStatusIndicator');
const relayTimer1Display = document.getElementById('relayTimer1Display');
const relayTimer2Display = document.getElementById('relayTimer2Display');
const relayTimer3Display = document.getElementById('relayTimer3Display');
const relayT1Cell = document.getElementById('relayT1Cell');
const relayDt1Cell = document.getElementById('relayDt1Cell');
const relayV1Cell = document.getElementById('relayV1Cell');
const relayT2Cell = document.getElementById('relayT2Cell');
const relayDt2Cell = document.getElementById('relayDt2Cell');
const relayV2Cell = document.getElementById('relayV2Cell');
const relayT3Cell = document.getElementById('relayT3Cell');
const relayDt3Cell = document.getElementById('relayDt3Cell');
const relayV3Cell = document.getElementById('relayV3Cell');
const relayTotalTimeMetric = document.getElementById('relayTotalTimeMetric');
const relayVavgMetric = document.getElementById('relayVavgMetric');
const relaySpeedMetric = document.getElementById('relaySpeedMetric');

const challV1Input = document.getElementById('challV1');
const challV2Input = document.getElementById('challV2');
const challVTargetInput = document.getElementById('challVTarget');
const challV3Input = document.getElementById('challV3Input');
const btnTestChallenge = document.getElementById('btnTestChallenge');
const challFeedback = document.getElementById('challFeedback');
const challOutcomeBox = document.getElementById('challOutcomeBox');

// Sub-Tab 4 Elements (Custom Sandbox)
const customX0Range = document.getElementById('customX0Range');
const customXTurnRange = document.getElementById('customXTurnRange');
const customXfRange = document.getElementById('customXfRange');
const customV1Range = document.getElementById('customV1Range');
const customV2Range = document.getElementById('customV2Range');
const customX0Val = document.getElementById('customX0Val');
const customXTurnVal = document.getElementById('customXTurnVal');
const customXfVal = document.getElementById('customXfVal');
const customV1Val = document.getElementById('customV1Val');
const customV2Val = document.getElementById('customV2Val');
const btnRunCustom = document.getElementById('btnRunCustom');
const btnResetCustom = document.getElementById('btnResetCustom');
const customMetricV1 = document.getElementById('customMetricV1');
const customMetricV2 = document.getElementById('customMetricV2');
const customMetricDx = document.getElementById('customMetricDx');
const customMetricDist = document.getElementById('customMetricDist');
const customMetricVavg = document.getElementById('customMetricVavg');
const customMetricSpeedAvg = document.getElementById('customMetricSpeedAvg');

// =========================================================================
// INITIALIZATION
// =========================================================================
function init() {
  setupEventListeners();
  applyPreset('1');
  resetAllPositions();
  
  loadAverageVelocityTrip();
  resetAvgTrip();

  resetRoundTrip();
  resetRelay();
  resetCustomSandbox();
  
  animate(0);
}

function setupEventListeners() {
  btnActConstant.addEventListener('click', () => switchActivity('constant'));
  btnActAverage.addEventListener('click', () => switchActivity('average'));
  btnActWalker.addEventListener('click', () => switchActivity('walker'));

  btnSubRoundTrip.addEventListener('click', () => switchWalkerSubMode('roundtrip'));
  btnSubRelay.addEventListener('click', () => switchWalkerSubMode('relay'));
  btnSubChallenge.addEventListener('click', () => switchWalkerSubMode('challenge'));
  btnSubCustomSandbox.addEventListener('click', () => switchWalkerSubMode('custom'));

  // -------------------------------------------------------------------------
  // Activity 1 Listeners
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
  // Activity 2 Listeners
  // -------------------------------------------------------------------------
  avgGroupSelect.addEventListener('change', (e) => {
    state.avgGroup = e.target.value;
    customTripWrapper.style.display = (state.avgGroup === 'custom') ? 'flex' : 'none';
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
    avgManualSplitBanner.style.display = (state.avgTimingMode === 'manual') ? 'flex' : 'none';
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

  // -------------------------------------------------------------------------
  // Activity 3 Listeners
  // -------------------------------------------------------------------------
  rtTurnDistInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) || 10.0;
    state.rtTurnDist = Math.max(4.0, Math.min(18.0, val));
    rtTurnDisplay.textContent = `${state.rtTurnDist}`;
    rtBannerTurnPos.textContent = `${state.rtTurnDist}`;
    rtTableXTurn.textContent = `${state.rtTurnDist.toFixed(1)} m`;
    resetRoundTrip();
  });

  // Turnaround Cone Click and Drag Event Listeners
  setupWalkerCanvasDragging();

  rtTimingMode.addEventListener('change', (e) => {
    state.rtTimingMode = e.target.value;
    rtManualActionsBanner.style.display = (state.rtTimingMode === 'manual') ? 'flex' : 'none';
  });

  btnRunRoundTrip.addEventListener('click', startRoundTrip);
  btnResetRoundTrip.addEventListener('click', resetRoundTrip);
  btnRtTimer2Stop.addEventListener('click', recordRtTimer2);
  btnRtTimer1Stop.addEventListener('click', recordRtTimer1);

  document.querySelectorAll('.walker-speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.walker-speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.rtSpeedMultiplier = parseFloat(e.target.getAttribute('data-speed'));
    });
  });

  relayTimingMode.addEventListener('change', (e) => {
    state.relayTimingMode = e.target.value;
    relayManualBanner.style.display = (state.relayTimingMode === 'manual') ? 'flex' : 'none';
  });

  btnRunRelay.addEventListener('click', startRelay);
  btnResetRelay.addEventListener('click', resetRelay);
  btnRelayTimer1Stop.addEventListener('click', recordRelayTimer1);
  btnRelayTimer2Stop.addEventListener('click', recordRelayTimer2);
  btnRelayTimer3Stop.addEventListener('click', recordRelayTimer3);

  document.querySelectorAll('.relay-speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.relay-speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.relaySpeedMultiplier = parseFloat(e.target.getAttribute('data-speed'));
    });
  });

  btnTestChallenge.addEventListener('click', testRelayChallenge);

  // -------------------------------------------------------------------------
  // Sub-Tab 4: Custom Sandbox Listeners
  // -------------------------------------------------------------------------
  customX0Range.addEventListener('input', (e) => {
    state.customX0 = parseFloat(e.target.value);
    customX0Val.textContent = `${state.customX0} m`;
    resetCustomSandbox();
  });
  customXTurnRange.addEventListener('input', (e) => {
    state.customXTurn = parseFloat(e.target.value);
    customXTurnVal.textContent = `${state.customXTurn} m`;
    resetCustomSandbox();
  });
  customXfRange.addEventListener('input', (e) => {
    state.customXf = parseFloat(e.target.value);
    customXfVal.textContent = `${state.customXf} m`;
    resetCustomSandbox();
  });
  customV1Range.addEventListener('input', (e) => {
    state.customV1 = parseFloat(e.target.value);
    customV1Val.textContent = `${state.customV1} m/s`;
    resetCustomSandbox();
  });
  customV2Range.addEventListener('input', (e) => {
    state.customV2 = parseFloat(e.target.value);
    customV2Val.textContent = `${state.customV2} m/s`;
    resetCustomSandbox();
  });

  btnRunCustom.addEventListener('click', startCustomSandbox);
  btnResetCustom.addEventListener('click', resetCustomSandbox);

  setupCustomCanvasDragging();
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
  btnActConstant.classList.toggle('active', act === 'constant');
  btnActAverage.classList.toggle('active', act === 'average');
  btnActWalker.classList.toggle('active', act === 'walker');

  activity1Container.style.display = (act === 'constant') ? 'block' : 'none';
  activity2Container.style.display = (act === 'average') ? 'block' : 'none';
  activity3Container.style.display = (act === 'walker') ? 'block' : 'none';

  if (act === 'constant') {
    draw();
    drawGraph();
  } else if (act === 'average') {
    drawAvgSimulation();
    drawAvgGraph();
  } else {
    switchWalkerSubMode(state.walkerSubMode);
  }
}

function switchWalkerSubMode(sub) {
  state.walkerSubMode = sub;
  btnSubRoundTrip.classList.toggle('active', sub === 'roundtrip');
  btnSubRelay.classList.toggle('active', sub === 'relay');
  btnSubChallenge.classList.toggle('active', sub === 'challenge');
  btnSubCustomSandbox.classList.toggle('active', sub === 'custom');

  walkerRoundTripSection.style.display = (sub === 'roundtrip') ? 'block' : 'none';
  walkerRelaySection.style.display = (sub === 'relay') ? 'block' : 'none';
  walkerChallengeSection.style.display = (sub === 'challenge') ? 'block' : 'none';
  walkerCustomSection.style.display = (sub === 'custom') ? 'block' : 'none';

  if (sub === 'roundtrip') {
    drawWalkerSimulation();
    drawRtGraph();
  } else if (sub === 'relay') {
    drawRelaySimulation();
    drawRelayGraph();
  } else if (sub === 'challenge') {
    drawChallSimulation();
  } else {
    drawCustomSimulation();
    drawCustomGraph();
  }
}

// =========================================================================
// DRAG-AND-DROP CANVAS INTERACTION
// =========================================================================
function setupWalkerCanvasDragging() {
  function getMeterFromEvent(e) {
    const rect = walkerCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const px = clientX - rect.left;
    const scaleX = walkerCanvas.width / rect.width;
    const canvasPx = px * scaleX;
    const m = (canvasPx - TRACK_PADDING) / MeterScaleFactor;
    return Math.max(4.0, Math.min(18.0, Math.round(m)));
  }

  walkerCanvas.addEventListener('mousedown', (e) => {
    if (state.rtIsRunning) return;
    const m = getMeterFromEvent(e);
    if (Math.abs(m - state.rtTurnDist) <= 2.5) {
      state.rtDraggingCone = true;
    }
  });

  walkerCanvas.addEventListener('mousemove', (e) => {
    if (!state.rtDraggingCone || state.rtIsRunning) return;
    const m = getMeterFromEvent(e);
    state.rtTurnDist = m;
    rtTurnDistInput.value = m;
    rtTurnDisplay.textContent = `${m}`;
    rtBannerTurnPos.textContent = `${m}`;
    rtTableXTurn.textContent = `${m.toFixed(1)} m`;
    resetRoundTrip();
  });

  window.addEventListener('mouseup', () => { state.rtDraggingCone = false; });
  walkerCanvas.addEventListener('touchstart', (e) => {
    if (state.rtIsRunning) return;
    const m = getMeterFromEvent(e);
    if (Math.abs(m - state.rtTurnDist) <= 2.5) state.rtDraggingCone = true;
  });
  walkerCanvas.addEventListener('touchmove', (e) => {
    if (!state.rtDraggingCone || state.rtIsRunning) return;
    e.preventDefault();
    const m = getMeterFromEvent(e);
    state.rtTurnDist = m;
    rtTurnDistInput.value = m;
    rtTurnDisplay.textContent = `${m}`;
    rtBannerTurnPos.textContent = `${m}`;
    rtTableXTurn.textContent = `${m.toFixed(1)} m`;
    resetRoundTrip();
  });
  window.addEventListener('touchend', () => { state.rtDraggingCone = false; });
}

function setupCustomCanvasDragging() {
  function getCustomMeterFromEvent(e) {
    const rect = customCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const px = clientX - rect.left;
    const scaleX = customCanvas.width / rect.width;
    const canvasPx = px * scaleX;
    const m = (canvasPx - TRACK_PADDING) / MeterScaleFactor;
    return Math.max(0.0, Math.min(20.0, Math.round(m)));
  }

  customCanvas.addEventListener('mousedown', (e) => {
    if (state.customIsRunning) return;
    const m = getCustomMeterFromEvent(e);
    if (Math.abs(m - state.customXTurn) <= 1.5) state.customDraggingMarker = 'xturn';
    else if (Math.abs(m - state.customX0) <= 1.5) state.customDraggingMarker = 'x0';
    else if (Math.abs(m - state.customXf) <= 1.5) state.customDraggingMarker = 'xf';
  });

  customCanvas.addEventListener('mousemove', (e) => {
    if (!state.customDraggingMarker || state.customIsRunning) return;
    const m = getCustomMeterFromEvent(e);
    if (state.customDraggingMarker === 'xturn') {
      state.customXTurn = m;
      customXTurnRange.value = m;
      customXTurnVal.textContent = `${m} m`;
    } else if (state.customDraggingMarker === 'x0') {
      state.customX0 = m;
      customX0Range.value = m;
      customX0Val.textContent = `${m} m`;
    } else if (state.customDraggingMarker === 'xf') {
      state.customXf = m;
      customXfRange.value = m;
      customXfVal.textContent = `${m} m`;
    }
    resetCustomSandbox();
  });

  window.addEventListener('mouseup', () => { state.customDraggingMarker = null; });
}

// =========================================================================
// ACTIVITY 1: CONSTANT VELOCITY METHODS
// =========================================================================
function applyPreset(preset) {
  state.activePreset = preset;
  
  if (preset === 'sandbox') {
    sandboxControls.style.display = 'block';
    groupInfoText.innerHTML = `<strong>Sandbox Mode:</strong> Fully custom positions (0–240 cm) and bidirectional velocities (−50 to +50 cm/s).`;
    
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
// ACTIVITY 2: AVERAGE VELOCITY METHODS
// =========================================================================
function loadAverageVelocityTrip() {
  if (state.avgGroup === 'custom') {
    const tripNum = state.avgTripNum || 1;
    state.avgCurrentTrip = { ...ARDUINO_TRIPS[tripNum] };
  } else {
    const grp = ARDUINO_GROUPS[state.avgGroup] || ARDUINO_GROUPS['A'];
    state.avgCurrentTrip = { ...grp[state.avgTrial] };
  }

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
  
  const wheelRadius = 15;
  const deltaCm = state.avgCar.v * dt;
  state.avgCar.wheelAngle += (deltaCm * ScaleFactor) / wheelRadius;
  
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
// ACTIVITY 3: WALKER & RELAY METHODS
// =========================================================================

// --- PART 1 & 2: ROUND TRIP ---
function resetRoundTrip() {
  state.rtIsRunning = false;
  state.rtElapsedTime = 0.0;
  state.rtWalker = {
    x: 0.0,
    v: 4.0,
    segment: 1,
    isFinished: false,
    stepPhase: 0.0
  };
  state.rtLoggedTimes = {
    t0: 0.0,
    tTurn: null,
    tFinal: null
  };
  state.rtAutoLogged = {
    tTurn: false,
    tFinal: false
  };

  btnRunRoundTrip.disabled = false;
  btnRtTimer2Stop.disabled = true;
  btnRtTimer1Stop.disabled = true;

  rtStatusIndicator.textContent = "Ready — click Start Round Trip or drag the cone to adjust distance";
  rtStatusIndicator.className = "status-badge";
  rtStatusIndicator.style.background = "#eef8fb";
  rtStatusIndicator.style.color = "var(--accent-strong)";
  rtStatusIndicator.style.borderColor = "#b8d1db";

  rtTimer2Display.textContent = "0.00 s";
  rtTimer1Display.textContent = "0.00 s";
  rtTableTTurn.textContent = "—";
  rtTableTFinal.textContent = "—";
  rtTableTTurn.className = "";
  rtTableTFinal.className = "";

  rtMetricV1.textContent = "—";
  rtMetricV2.textContent = "—";
  rtMetricDx.textContent = "—";
  rtMetricDist.textContent = "—";
  rtMetricVavg.textContent = "—";
  rtMetricSpeedAvg.textContent = "—";
  rtMisconceptionCallout.style.display = "none";

  drawWalkerSimulation();
  drawRtGraph();
}

function startRoundTrip() {
  if (state.rtIsRunning) return;
  resetRoundTrip();
  state.rtIsRunning = true;
  state.rtElapsedTime = 0.0;
  state.rtLastTimestamp = performance.now();

  btnRunRoundTrip.disabled = true;
  if (state.rtTimingMode === 'manual') {
    btnRtTimer2Stop.disabled = false;
    btnRtTimer1Stop.disabled = true;
  }

  rtStatusIndicator.textContent = `Student 3 walking quickly towards turnaround (${state.rtTurnDist}m)...`;
  drawWalkerSimulation();
  drawRtGraph();
}

function recordRtTimer2() {
  if (!state.rtIsRunning || state.rtLoggedTimes.tTurn !== null) return;
  state.rtLoggedTimes.tTurn = state.rtElapsedTime;
  rtTimer2Display.textContent = `${state.rtElapsedTime.toFixed(2)} s`;
  rtTableTTurn.textContent = `${state.rtElapsedTime.toFixed(2)} s`;
  rtTableTTurn.className = "logged-cell";
  btnRtTimer2Stop.disabled = true;
  btnRtTimer1Stop.disabled = false;
  computeAndDisplayRtMetrics();
  drawRtGraph();
}

function recordRtTimer1() {
  if (!state.rtIsRunning || state.rtLoggedTimes.tFinal !== null) return;
  state.rtLoggedTimes.tFinal = state.rtElapsedTime;
  rtTimer1Display.textContent = `${state.rtElapsedTime.toFixed(2)} s`;
  rtTableTFinal.textContent = `${state.rtElapsedTime.toFixed(2)} s`;
  rtTableTFinal.className = "logged-cell";
  btnRtTimer1Stop.disabled = true;
  computeAndDisplayRtMetrics();
  drawRtGraph();
}

function updateWalkerPhysics(dt) {
  if (!state.rtIsRunning) return;
  const walkObj = calculateWalkerRoundTrip(state.rtElapsedTime, state.rtTurnDist, 4.0, -2.0);
  
  state.rtWalker.x = walkObj.x;
  state.rtWalker.v = walkObj.v;
  state.rtWalker.segment = walkObj.segment;
  state.rtWalker.isFinished = walkObj.isFinished;
  state.rtWalker.stepPhase += Math.abs(walkObj.v) * dt * 3.5;

  if (state.rtLoggedTimes.tTurn === null) {
    rtTimer2Display.textContent = `${state.rtElapsedTime.toFixed(2)} s`;
  }
  rtTimer1Display.textContent = `${state.rtElapsedTime.toFixed(2)} s`;

  if (state.rtTimingMode === 'auto') {
    if (!state.rtAutoLogged.tTurn && state.rtElapsedTime >= walkObj.tTurn) {
      state.rtAutoLogged.tTurn = true;
      state.rtLoggedTimes.tTurn = walkObj.tTurn;
      rtTimer2Display.textContent = `${walkObj.tTurn.toFixed(2)} s`;
      rtTableTTurn.textContent = `${walkObj.tTurn.toFixed(2)} s`;
      rtTableTTurn.className = "logged-cell";
      rtStatusIndicator.textContent = `Turnaround reached! Student 3 walking slowly back to start...`;
      computeAndDisplayRtMetrics();
    }
  }

  if (walkObj.isFinished || state.rtElapsedTime >= walkObj.totalTime) {
    state.rtIsRunning = false;
    btnRunRoundTrip.disabled = false;
    btnRtTimer2Stop.disabled = true;
    btnRtTimer1Stop.disabled = true;

    if (state.rtLoggedTimes.tFinal === null) {
      state.rtLoggedTimes.tFinal = state.rtElapsedTime;
      rtTimer1Display.textContent = `${state.rtElapsedTime.toFixed(2)} s`;
      rtTableTFinal.textContent = `${state.rtElapsedTime.toFixed(2)} s`;
      rtTableTFinal.className = "logged-cell";
    }

    rtStatusIndicator.innerHTML = `🏁 <strong>Round Trip Complete!</strong> Returned to 0 m at ${state.rtElapsedTime.toFixed(2)} s.`;
    computeAndDisplayRtMetrics();
    drawRtGraph();
  }
}

function computeAndDisplayRtMetrics() {
  const tTurn = state.rtLoggedTimes.tTurn;
  const tFinal = state.rtLoggedTimes.tFinal;
  const xTurn = state.rtTurnDist;

  if (tTurn !== null) {
    const v1 = xTurn / tTurn;
    rtMetricV1.textContent = `+${v1.toFixed(2)} m/s`;
  }

  if (tTurn !== null && tFinal !== null) {
    const metrics = calculateRoundTripMetrics(xTurn, tTurn, tFinal);
    rtMetricV2.textContent = `${metrics.segment2.v.toFixed(2)} m/s`;
    rtMetricDx.textContent = `0.0 m`;
    rtMetricDist.textContent = `${metrics.total.distance.toFixed(1)} m`;
    rtMetricVavg.textContent = `0.00 m/s`;
    rtMetricSpeedAvg.textContent = `${metrics.total.averageSpeed.toFixed(2)} m/s`;

    rtMisconceptionCallout.style.display = "block";
    rtMisconceptionText.innerHTML = `
      • <strong>True Average Velocity:</strong> <strong>0.00 m/s</strong> (since total displacement Δ<i>x</i> = 0 m)<br>
      • <strong>Arithmetic Mean (<i>v</i>₁ + <i>v</i>₂) / 2:</strong> <strong>${metrics.total.arithmeticMeanVelocity.toFixed(2)} m/s</strong><br>
      • <strong>Average Speed (<i>d</i> / Δ<i>t</i>):</strong> <strong>${metrics.total.averageSpeed.toFixed(2)} m/s</strong><br>
      Notice why they differ: The walker traveled 20 m total, but displacement canceled out completely because direction reversed!
    `;
  }
}

// --- PART 3 & 4: 3-PERSON RELAY ---
function resetRelay() {
  state.relayIsRunning = false;
  state.relayElapsedTime = 0.0;
  state.relayRunners = {
    x: 0.0,
    activeStudent: 1,
    isFinished: false,
    stepPhase: 0.0
  };
  state.relayLoggedTimes = {
    t1: null,
    t2: null,
    t3: null
  };
  state.relayAutoLogged = {
    t1: false,
    t2: false,
    t3: false
  };

  btnRunRelay.disabled = false;
  btnRelayTimer1Stop.disabled = true;
  btnRelayTimer2Stop.disabled = true;
  btnRelayTimer3Stop.disabled = true;

  relayStatusIndicator.textContent = "Ready — click Start Relay Race";
  relayStatusIndicator.className = "status-badge";
  relayStatusIndicator.style.background = "#eef8fb";
  relayStatusIndicator.style.color = "var(--accent-strong)";
  relayStatusIndicator.style.borderColor = "#b8d1db";

  relayTimer1Display.textContent = "0.00 s";
  relayTimer2Display.textContent = "0.00 s";
  relayTimer3Display.textContent = "0.00 s";

  relayT1Cell.textContent = "—";
  relayDt1Cell.textContent = "—";
  relayV1Cell.textContent = "—";
  relayT2Cell.textContent = "—";
  relayDt2Cell.textContent = "—";
  relayV2Cell.textContent = "—";
  relayT3Cell.textContent = "—";
  relayDt3Cell.textContent = "—";
  relayV3Cell.textContent = "—";

  relayTotalTimeMetric.textContent = "—";
  relayVavgMetric.textContent = "—";
  relaySpeedMetric.textContent = "—";

  drawRelaySimulation();
  drawRelayGraph();
}

function startRelay() {
  if (state.relayIsRunning) return;
  resetRelay();
  state.relayIsRunning = true;
  state.relayElapsedTime = 0.0;
  state.relayLastTimestamp = performance.now();

  btnRunRelay.disabled = true;
  if (state.relayTimingMode === 'manual') {
    btnRelayTimer1Stop.disabled = false;
    btnRelayTimer2Stop.disabled = true;
    btnRelayTimer3Stop.disabled = true;
  }

  relayStatusIndicator.textContent = "🏃 Student 1 running Leg 1 (0 to 8 m)...";
  drawRelaySimulation();
  drawRelayGraph();
}

function recordRelayTimer1() {
  if (!state.relayIsRunning || state.relayLoggedTimes.t1 !== null) return;
  state.relayLoggedTimes.t1 = state.relayElapsedTime;
  relayTimer1Display.textContent = `${state.relayElapsedTime.toFixed(2)} s`;
  btnRelayTimer1Stop.disabled = true;
  btnRelayTimer2Stop.disabled = false;
  computeAndDisplayRelayMetrics();
  drawRelayGraph();
}

function recordRelayTimer2() {
  if (!state.relayIsRunning || state.relayLoggedTimes.t2 !== null) return;
  state.relayLoggedTimes.t2 = state.relayElapsedTime;
  relayTimer2Display.textContent = `${state.relayElapsedTime.toFixed(2)} s`;
  btnRelayTimer2Stop.disabled = true;
  btnRelayTimer3Stop.disabled = false;
  computeAndDisplayRelayMetrics();
  drawRelayGraph();
}

function recordRelayTimer3() {
  if (!state.relayIsRunning || state.relayLoggedTimes.t3 !== null) return;
  state.relayLoggedTimes.t3 = state.relayElapsedTime;
  relayTimer3Display.textContent = `${state.relayElapsedTime.toFixed(2)} s`;
  btnRelayTimer3Stop.disabled = true;
  computeAndDisplayRelayMetrics();
  drawRelayGraph();
}

function updateRelayPhysics(dt) {
  if (!state.relayIsRunning) return;
  const relayObj = calculateRelayPosition(state.relayElapsedTime, RELAY_CONFIG);

  state.relayRunners.x = relayObj.x;
  state.relayRunners.activeStudent = relayObj.activeStudent;
  state.relayRunners.isFinished = relayObj.isFinished;
  state.relayRunners.stepPhase += Math.abs(relayObj.v) * dt * 3.5;

  if (state.relayLoggedTimes.t1 === null) relayTimer1Display.textContent = `${state.relayElapsedTime.toFixed(2)} s`;
  if (state.relayLoggedTimes.t2 === null) relayTimer2Display.textContent = `${state.relayElapsedTime.toFixed(2)} s`;
  if (state.relayLoggedTimes.t3 === null) relayTimer3Display.textContent = `${state.relayElapsedTime.toFixed(2)} s`;

  if (state.relayTimingMode === 'auto') {
    if (!state.relayAutoLogged.t1 && state.relayElapsedTime >= relayObj.t1) {
      state.relayAutoLogged.t1 = true;
      state.relayLoggedTimes.t1 = relayObj.t1;
      relayTimer1Display.textContent = `${relayObj.t1.toFixed(2)} s`;
      relayStatusIndicator.textContent = "🤝 Handoff at 8 m! Student 2 running Leg 2 (8 to 12 m)...";
      computeAndDisplayRelayMetrics();
    }
    if (!state.relayAutoLogged.t2 && state.relayElapsedTime >= relayObj.t2) {
      state.relayAutoLogged.t2 = true;
      state.relayLoggedTimes.t2 = relayObj.t2;
      relayTimer2Display.textContent = `${relayObj.t2.toFixed(2)} s`;
      relayStatusIndicator.textContent = "🤝 Handoff at 12 m! Student 3 running Leg 3 (12 to 16 m)...";
      computeAndDisplayRelayMetrics();
    }
  }

  if (relayObj.isFinished || state.relayElapsedTime >= relayObj.t3) {
    state.relayIsRunning = false;
    btnRunRelay.disabled = false;
    btnRelayTimer1Stop.disabled = true;
    btnRelayTimer2Stop.disabled = true;
    btnRelayTimer3Stop.disabled = true;

    if (state.relayLoggedTimes.t3 === null) {
      state.relayLoggedTimes.t3 = state.relayElapsedTime;
      relayTimer3Display.textContent = `${state.relayElapsedTime.toFixed(2)} s`;
    }

    relayStatusIndicator.innerHTML = `🏁 <strong>Relay Finished!</strong> Student 3 crossed 16 m at ${state.relayElapsedTime.toFixed(2)} s.`;
    computeAndDisplayRelayMetrics();
    drawRelayGraph();
  }
}

function computeAndDisplayRelayMetrics() {
  const t1 = state.relayLoggedTimes.t1;
  const t2 = state.relayLoggedTimes.t2;
  const t3 = state.relayLoggedTimes.t3;

  if (t1 !== null) {
    relayT1Cell.textContent = `${t1.toFixed(2)} s`;
    relayDt1Cell.textContent = `${t1.toFixed(2)} s`;
    const v1 = 8.0 / t1;
    relayV1Cell.textContent = `+${v1.toFixed(2)} m/s`;
  }

  if (t1 !== null && t2 !== null) {
    relayT2Cell.textContent = `${t2.toFixed(2)} s`;
    const dt2 = t2 - t1;
    relayDt2Cell.textContent = `${dt2.toFixed(2)} s`;
    const v2 = dt2 > 0 ? 4.0 / dt2 : 0;
    relayV2Cell.textContent = `+${v2.toFixed(2)} m/s`;
  }

  if (t1 !== null && t2 !== null && t3 !== null) {
    relayT3Cell.textContent = `${t3.toFixed(2)} s`;
    const dt3 = t3 - t2;
    relayDt3Cell.textContent = `${dt3.toFixed(2)} s`;
    const v3 = dt3 > 0 ? 4.0 / dt3 : 0;
    relayV3Cell.textContent = `+${v3.toFixed(2)} m/s`;

    const metrics = calculateRelayMetrics(t1, t2, t3, RELAY_CONFIG);
    relayTotalTimeMetric.textContent = `${metrics.total.dt.toFixed(2)} s`;
    relayVavgMetric.textContent = `+${metrics.total.averageVelocity.toFixed(2)} m/s`;
    relaySpeedMetric.textContent = `${metrics.total.averageSpeed.toFixed(2)} m/s`;
  }
}

// --- PART 5: CHALLENGE SOLVER ---
function testRelayChallenge() {
  const v1 = parseFloat(challV1Input.value) || 4.0;
  const v2 = parseFloat(challV2Input.value) || 2.0;
  const vTarget = parseFloat(challVTargetInput.value) || 6.0;
  const enteredV3 = parseFloat(challV3Input.value);

  const sol = calculateRequiredSegmentSpeed(vTarget, v1, v2, RELAY_CONFIG);

  challFeedback.style.display = 'block';

  if (!sol.possible) {
    challFeedback.style.background = '#fff5f5';
    challFeedback.style.border = '1px solid #ffc9c9';
    challFeedback.style.color = '#c92a2a';
    challFeedback.innerHTML = `⚠️ <strong>Physically Impossible:</strong> ${sol.reason}`;
    return;
  }

  if (isNaN(enteredV3)) {
    challFeedback.style.background = '#fff9db';
    challFeedback.style.border = '1px solid #ffd8a8';
    challFeedback.style.color = '#d9480f';
    challFeedback.innerHTML = `Please enter your derived speed for Student 3 to run the simulation test.`;
    return;
  }

  const pErr = calculatePercentError(enteredV3, sol.v3Required);
  const correct = pErr <= 8.0;

  if (correct) {
    challFeedback.style.background = '#ebfbee';
    challFeedback.style.border = '1px solid #c3fae8';
    challFeedback.style.color = '#087f5b';
    challFeedback.innerHTML = `✅ <strong>Calculation Verified!</strong> Student 3 must move at <strong>${sol.v3Required.toFixed(2)} m/s</strong> to complete Leg 3 in ${sol.dt3Needed.toFixed(2)} s, achieving the target team average velocity of ${vTarget.toFixed(1)} m/s.`;
  } else {
    challFeedback.style.background = '#fff5f5';
    challFeedback.style.border = '1px solid #ffc9c9';
    challFeedback.style.color = '#c92a2a';
    challFeedback.innerHTML = `⚠️ <strong>Discrepancy:</strong> Your calculation (${enteredV3.toFixed(2)} m/s) differs from the required velocity (${sol.v3Required.toFixed(2)} m/s). Check your total time equation: <span class="math-expr">Δ<i>t</i><sub>total</sub> = 16 m / ${vTarget} m/s</span>.`;
  }

  state.challIsRunning = true;
  state.challElapsedTime = 0.0;
  state.challLastTimestamp = performance.now();
  state.challConfig = {
    x0: 0, x1: 8, x2: 12, x3: 16,
    v1, v2, v3: enteredV3
  };
}

function updateChallPhysics(dt) {
  if (!state.challIsRunning || !state.challConfig) return;
  const relayObj = calculateRelayPosition(state.challElapsedTime, state.challConfig);

  state.challRunner.x = relayObj.x;
  state.challRunner.activeStudent = relayObj.activeStudent;
  state.challRunner.isFinished = relayObj.isFinished;
  state.challRunner.stepPhase += Math.abs(relayObj.v) * dt * 3.5;

  if (relayObj.isFinished || state.challElapsedTime >= relayObj.t3) {
    state.challIsRunning = false;
    const finalVavg = 16.0 / (state.challElapsedTime || 1e-5);
    challOutcomeBox.style.display = 'block';
    challOutcomeBox.className = 'alert-box info';
    challOutcomeBox.innerHTML = `🏁 <strong>Simulated Relay Finished!</strong> Total Time = <strong>${state.challElapsedTime.toFixed(2)} s</strong> · Resulting Team Average Velocity = <strong>${finalVavg.toFixed(2)} m/s</strong>.`;
  }
}

// --- SUB-TAB 4: CUSTOM SANDBOX METHODS ---
function resetCustomSandbox() {
  state.customIsRunning = false;
  state.customElapsedTime = 0.0;
  state.customWalker = {
    x: state.customX0,
    v: state.customV1,
    segment: 1,
    isFinished: false,
    stepPhase: 0.0
  };

  btnRunCustom.disabled = false;

  const dx1 = state.customXTurn - state.customX0;
  const dx2 = state.customXf - state.customXTurn;
  const dist1 = Math.abs(dx1);
  const dist2 = Math.abs(dx2);

  const dt1 = dist1 / (state.customV1 || 1e-5);
  const dt2 = dist2 / (state.customV2 || 1e-5);
  const totalTime = dt1 + dt2;

  const v1 = dt1 > 0 ? dx1 / dt1 : 0;
  const v2 = dt2 > 0 ? dx2 / dt2 : 0;

  const totalDx = state.customXf - state.customX0;
  const totalDist = dist1 + dist2;
  const vAvg = totalTime > 0 ? totalDx / totalTime : 0;
  const speedAvg = totalTime > 0 ? totalDist / totalTime : 0;

  customMetricV1.textContent = `${v1 > 0 ? '+' : ''}${v1.toFixed(2)} m/s`;
  customMetricV2.textContent = `${v2 > 0 ? '+' : ''}${v2.toFixed(2)} m/s`;
  customMetricDx.textContent = `${totalDx > 0 ? '+' : ''}${totalDx.toFixed(1)} m`;
  customMetricDist.textContent = `${totalDist.toFixed(1)} m`;
  customMetricVavg.textContent = `${vAvg > 0 ? '+' : ''}${vAvg.toFixed(2)} m/s`;
  customMetricSpeedAvg.textContent = `${speedAvg.toFixed(2)} m/s`;

  drawCustomSimulation();
  drawCustomGraph();
}

function startCustomSandbox() {
  if (state.customIsRunning) return;
  resetCustomSandbox();
  state.customIsRunning = true;
  state.customElapsedTime = 0.0;
  state.customLastTimestamp = performance.now();
  btnRunCustom.disabled = true;
}

function updateCustomPhysics(dt) {
  if (!state.customIsRunning) return;

  const dx1 = state.customXTurn - state.customX0;
  const dx2 = state.customXf - state.customXTurn;
  const dist1 = Math.abs(dx1);
  const dist2 = Math.abs(dx2);

  const dt1 = dist1 / (state.customV1 || 1e-5);
  const dt2 = dist2 / (state.customV2 || 1e-5);
  const totalTime = dt1 + dt2;

  const dir1 = dx1 >= 0 ? 1 : -1;
  const dir2 = dx2 >= 0 ? 1 : -1;

  if (state.customElapsedTime <= dt1) {
    state.customWalker.x = state.customX0 + dir1 * state.customV1 * state.customElapsedTime;
    state.customWalker.v = dir1 * state.customV1;
    state.customWalker.segment = 1;
  } else if (state.customElapsedTime < totalTime) {
    const t2 = state.customElapsedTime - dt1;
    state.customWalker.x = state.customXTurn + dir2 * state.customV2 * t2;
    state.customWalker.v = dir2 * state.customV2;
    state.customWalker.segment = 2;
  } else {
    state.customWalker.x = state.customXf;
    state.customWalker.v = dir2 * state.customV2;
    state.customWalker.segment = 'done';
    state.customWalker.isFinished = true;
    state.customIsRunning = false;
    btnRunCustom.disabled = false;
  }

  state.customWalker.stepPhase += Math.abs(state.customWalker.v) * dt * 3.5;
}

// =========================================================================
// ANIMATION LOOP
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
  } else if (state.currentActivity === 'average') {
    if (state.avgIsRunning) {
      const dt = Math.min((timestamp - state.avgLastTimestamp) / 1000, 0.1) * state.avgSpeedMultiplier;
      state.avgLastTimestamp = timestamp;
      state.avgElapsedTime += dt;
      
      updateAvgPhysics(dt);
    }
    updateAvgUI();
    drawAvgSimulation();
  } else if (state.currentActivity === 'walker') {
    if (state.walkerSubMode === 'roundtrip') {
      if (state.rtIsRunning) {
        const dt = Math.min((timestamp - state.rtLastTimestamp) / 1000, 0.1) * state.rtSpeedMultiplier;
        state.rtLastTimestamp = timestamp;
        state.rtElapsedTime += dt;
        updateWalkerPhysics(dt);
      }
      drawWalkerSimulation();
    } else if (state.walkerSubMode === 'relay') {
      if (state.relayIsRunning) {
        const dt = Math.min((timestamp - state.relayLastTimestamp) / 1000, 0.1) * state.relaySpeedMultiplier;
        state.relayLastTimestamp = timestamp;
        state.relayElapsedTime += dt;
        updateRelayPhysics(dt);
      }
      drawRelaySimulation();
    } else if (state.walkerSubMode === 'challenge') {
      if (state.challIsRunning) {
        const dt = Math.min((timestamp - state.challLastTimestamp) / 1000, 0.1);
        state.challLastTimestamp = timestamp;
        state.challElapsedTime += dt;
        updateChallPhysics(dt);
      }
      drawChallSimulation();
    } else if (state.walkerSubMode === 'custom') {
      if (state.customIsRunning) {
        const dt = Math.min((timestamp - state.customLastTimestamp) / 1000, 0.1);
        state.customLastTimestamp = timestamp;
        state.customElapsedTime += dt;
        updateCustomPhysics(dt);
      }
      drawCustomSimulation();
    }
  }
  
  requestAnimationFrame(animate);
}

// =========================================================================
// CANVAS DRAWING HELPERS
// =========================================================================
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
  
  drawRulerTape(simCtx, TRACK_MAX, 'cm');
  
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
}

function drawAvgSimulation() {
  avgSimCtx.clearRect(0, 0, SIM_WIDTH, SIM_HEIGHT);
  const trip = state.avgCurrentTrip;
  
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
  
  const TRACK_CENTER_Y = 110;
  avgSimCtx.fillStyle = '#e9f4fb';
  avgSimCtx.fillRect(TRACK_PADDING, TRACK_CENTER_Y - 8, SIM_WIDTH - 2 * TRACK_PADDING, 16);
  avgSimCtx.strokeStyle = '#0f7e9b';
  avgSimCtx.lineWidth = 2;
  avgSimCtx.strokeRect(TRACK_PADDING, TRACK_CENTER_Y - 8, SIM_WIDTH - 2 * TRACK_PADDING, 16);

  avgSimCtx.fillStyle = '#61808b';
  avgSimCtx.fillRect(TRACK_PADDING - 6, TRACK_CENTER_Y - 25, 6, 50);
  avgSimCtx.fillRect(SIM_WIDTH - TRACK_PADDING, TRACK_CENTER_Y - 25, 6, 50);
  
  drawRulerTape(avgSimCtx, TRACK_MAX, 'cm');
  drawTapeMarker(avgSimCtx, trip.xTape);
  drawLocationFlag(avgSimCtx, trip.x0, `Start X₀ (${trip.x0} cm)`, '#1a7f4e', 40);
  drawLocationFlag(avgSimCtx, trip.xf, `Finish X_f (${trip.xf} cm)`, '#c92a2a', 65);
  drawArduinoCar(avgSimCtx, state.avgCar.x, TRACK_CENTER_Y - 4, state.avgCar.v, state.avgCar.wheelAngle, state.avgCar.segment);
}

function drawTapeMarker(ctx, cmPos) {
  const x = cmToPx(cmPos);
  ctx.save();
  ctx.fillStyle = '#f59f00';
  ctx.fillRect(x - 5, 85, 10, 45);
  ctx.strokeStyle = '#d9480f';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 5, 85, 10, 45);
  
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
  
  if (velocity < 0) ctx.scale(-1, 1);
  
  const w = 62;
  drawCartWheel(ctx, -18, 9, 8, wheelAngle);
  drawCartWheel(ctx, 18, 9, 8, wheelAngle);
  
  ctx.fillStyle = '#0b7285';
  ctx.strokeStyle = '#084b57';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, -w / 2, -7, w, 14, 3);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#1098ad';
  drawRoundedRect(ctx, -w / 2 + 10, -15, w - 20, 9, 2);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#212529';
  ctx.fillRect(-8, -13, 16, 6);
  
  ctx.fillStyle = '#51cf66';
  ctx.beginPath();
  ctx.arc(w / 2 - 16, -11, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
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
  
  avgGraphCtx.fillStyle = '#f8f9fa';
  avgGraphCtx.fillRect(paddingLeft, paddingTop, graphW, graphH);
  avgGraphCtx.strokeStyle = '#ced4da';
  avgGraphCtx.lineWidth = 1;
  avgGraphCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);
  
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
  
  const t0 = state.avgLoggedPoints.t0 !== null ? state.avgLoggedPoints.t0 : 0.0;
  const tTape = state.avgLoggedPoints.tTape;
  const tf = state.avgLoggedPoints.tf;
  
  if (tTape !== null) {
    avgGraphCtx.strokeStyle = '#0b7285';
    avgGraphCtx.lineWidth = 3;
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(timeToPx(t0), posToPx(trip.x0));
    avgGraphCtx.lineTo(timeToPx(tTape), posToPx(trip.xTape));
    avgGraphCtx.stroke();
  }
  
  if (tTape !== null && tf !== null) {
    avgGraphCtx.strokeStyle = '#d67b19';
    avgGraphCtx.lineWidth = 3;
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(timeToPx(tTape), posToPx(trip.xTape));
    avgGraphCtx.lineTo(timeToPx(tf), posToPx(trip.xf));
    avgGraphCtx.stroke();
    
    avgGraphCtx.strokeStyle = '#1a7f4e';
    avgGraphCtx.lineWidth = 2.5;
    avgGraphCtx.setLineDash([6, 4]);
    avgGraphCtx.beginPath();
    avgGraphCtx.moveTo(timeToPx(t0), posToPx(trip.x0));
    avgGraphCtx.lineTo(timeToPx(tf), posToPx(trip.xf));
    avgGraphCtx.stroke();
    avgGraphCtx.setLineDash([]);
  }
  
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
}

// --- Draw Walker Round Trip Canvas ---
function drawWalkerSimulation() {
  walkerCtx.clearRect(0, 0, SIM_WIDTH, SIM_HEIGHT);

  for (let m = 0; m <= METER_MAX; m += 2) {
    const x = meterToPx(m);
    walkerCtx.strokeStyle = 'rgba(15, 126, 155, 0.15)';
    walkerCtx.lineWidth = 1.5;
    walkerCtx.setLineDash([5, 5]);
    walkerCtx.beginPath();
    walkerCtx.moveTo(x, 20);
    walkerCtx.lineTo(x, RULER_Y - 2);
    walkerCtx.stroke();
    walkerCtx.setLineDash([]);

    walkerCtx.fillStyle = 'rgba(12, 54, 68, 0.5)';
    walkerCtx.font = '500 10px sans-serif';
    walkerCtx.textAlign = 'center';
    walkerCtx.fillText(`${m} m`, x, 16);
  }

  const TRACK_CENTER_Y = 135;
  walkerCtx.fillStyle = '#e9f4fb';
  walkerCtx.fillRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);
  walkerCtx.strokeStyle = '#0f7e9b';
  walkerCtx.lineWidth = 2;
  walkerCtx.strokeRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);

  drawRulerTape(walkerCtx, METER_MAX, 'm');
  drawTurnaroundCone(walkerCtx, state.rtTurnDist);
  drawLocationFlagM(walkerCtx, 0.0, 'Start (0 m)', '#1a7f4e', 45);
  drawAnimatedWalker(walkerCtx, state.rtWalker.x, TRACK_CENTER_Y - 2, state.rtWalker.v, state.rtWalker.stepPhase, '#0f7e9b', 'Student 3 (Walker)');
}

// --- Draw Round Trip Graph ---
function drawRtGraph() {
  rtGraphCtx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
  
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;
  
  const graphW = GRAPH_WIDTH - paddingLeft - paddingRight;
  const graphH = GRAPH_HEIGHT - paddingTop - paddingBottom;

  const xTurn = state.rtTurnDist;
  const tTurn = state.rtLoggedTimes.tTurn;
  const tFinal = state.rtLoggedTimes.tFinal;

  let maxT = 10.0;
  if (tFinal) maxT = Math.max(maxT, Math.ceil((tFinal + 2) / 5) * 5);

  const maxPosVal = 20.0;
  function timeToPx(t) { return paddingLeft + (t / maxT) * graphW; }
  function posToPx(x) { return paddingTop + graphH - (x / maxPosVal) * graphH; }

  rtGraphCtx.fillStyle = '#f8f9fa';
  rtGraphCtx.fillRect(paddingLeft, paddingTop, graphW, graphH);
  rtGraphCtx.strokeStyle = '#ced4da';
  rtGraphCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);

  rtGraphCtx.strokeStyle = '#e9ecef';
  for (let t = 0; t <= maxT + 1e-4; t += maxT / 10) {
    const x = timeToPx(t);
    rtGraphCtx.beginPath();
    rtGraphCtx.moveTo(x, paddingTop);
    rtGraphCtx.lineTo(x, paddingTop + graphH);
    rtGraphCtx.stroke();
    rtGraphCtx.fillStyle = '#495057';
    rtGraphCtx.font = '10px sans-serif';
    rtGraphCtx.textAlign = 'center';
    rtGraphCtx.fillText(t.toFixed(1), x, paddingTop + graphH + 15);
  }

  for (let p = 0; p <= maxPosVal; p += 2) {
    const y = posToPx(p);
    rtGraphCtx.beginPath();
    rtGraphCtx.moveTo(paddingLeft, y);
    rtGraphCtx.lineTo(paddingLeft + graphW, y);
    rtGraphCtx.stroke();
    rtGraphCtx.fillStyle = '#495057';
    rtGraphCtx.font = '10px sans-serif';
    rtGraphCtx.textAlign = 'right';
    rtGraphCtx.fillText(`${p}`, paddingLeft - 8, y + 3);
  }

  rtGraphCtx.fillStyle = '#123140';
  rtGraphCtx.font = 'bold 11px sans-serif';
  rtGraphCtx.textAlign = 'center';
  rtGraphCtx.fillText('Time (s)', paddingLeft + graphW / 2, paddingTop + graphH + 32);

  rtGraphCtx.save();
  rtGraphCtx.translate(18, paddingTop + graphH / 2);
  rtGraphCtx.rotate(-Math.PI / 2);
  rtGraphCtx.fillText('Position (meters)', 0, 0);
  rtGraphCtx.restore();

  if (tTurn !== null) {
    rtGraphCtx.strokeStyle = '#0f7e9b';
    rtGraphCtx.lineWidth = 3;
    rtGraphCtx.beginPath();
    rtGraphCtx.moveTo(timeToPx(0), posToPx(0));
    rtGraphCtx.lineTo(timeToPx(tTurn), posToPx(xTurn));
    rtGraphCtx.stroke();
  }

  if (tTurn !== null && tFinal !== null) {
    rtGraphCtx.strokeStyle = '#d67b19';
    rtGraphCtx.lineWidth = 3;
    rtGraphCtx.beginPath();
    rtGraphCtx.moveTo(timeToPx(tTurn), posToPx(xTurn));
    rtGraphCtx.lineTo(timeToPx(tFinal), posToPx(0));
    rtGraphCtx.stroke();

    rtGraphCtx.strokeStyle = '#1a7f4e';
    rtGraphCtx.lineWidth = 2.5;
    rtGraphCtx.setLineDash([5, 4]);
    rtGraphCtx.beginPath();
    rtGraphCtx.moveTo(timeToPx(0), posToPx(0));
    rtGraphCtx.lineTo(timeToPx(tFinal), posToPx(0));
    rtGraphCtx.stroke();
    rtGraphCtx.setLineDash([]);
  }

  const pts = [{ t: 0, x: 0, label: 'Start (0s, 0m)', color: '#1a7f4e' }];
  if (tTurn !== null) pts.push({ t: tTurn, x: xTurn, label: `Turn (${tTurn.toFixed(2)}s, ${xTurn}m)`, color: '#d67b19' });
  if (tFinal !== null) pts.push({ t: tFinal, x: 0, label: `Return (${tFinal.toFixed(2)}s, 0m)`, color: '#c92a2a' });

  pts.forEach(p => {
    const px = timeToPx(p.t);
    const py = posToPx(p.x);
    rtGraphCtx.fillStyle = p.color;
    rtGraphCtx.strokeStyle = '#ffffff';
    rtGraphCtx.lineWidth = 2;
    rtGraphCtx.beginPath();
    rtGraphCtx.arc(px, py, 6, 0, Math.PI * 2);
    rtGraphCtx.fill();
    rtGraphCtx.stroke();

    rtGraphCtx.fillStyle = '#123140';
    rtGraphCtx.font = 'bold 9px sans-serif';
    rtGraphCtx.textAlign = 'left';
    rtGraphCtx.fillText(p.label, px + 8, py - 4);
  });
}

// --- Draw 3-Person Relay Canvas ---
function drawRelaySimulation() {
  relayCtx.clearRect(0, 0, SIM_WIDTH, SIM_HEIGHT);

  for (let m = 0; m <= METER_MAX; m += 2) {
    const x = meterToPx(m);
    relayCtx.strokeStyle = 'rgba(15, 126, 155, 0.15)';
    relayCtx.lineWidth = 1.5;
    relayCtx.setLineDash([5, 5]);
    relayCtx.beginPath();
    relayCtx.moveTo(x, 20);
    relayCtx.lineTo(x, RULER_Y - 2);
    relayCtx.stroke();
    relayCtx.setLineDash([]);

    relayCtx.fillStyle = 'rgba(12, 54, 68, 0.5)';
    relayCtx.font = '500 10px sans-serif';
    relayCtx.textAlign = 'center';
    relayCtx.fillText(`${m} m`, x, 16);
  }

  const TRACK_CENTER_Y = 135;
  relayCtx.fillStyle = '#e9f4fb';
  relayCtx.fillRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);
  relayCtx.strokeStyle = '#0f7e9b';
  relayCtx.lineWidth = 2;
  relayCtx.strokeRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);

  drawRulerTape(relayCtx, METER_MAX, 'm');

  drawLocationFlagM(relayCtx, 0.0, 'Start (0 m)', '#1a7f4e', 45);
  drawLocationFlagM(relayCtx, 8.0, 'Handoff 1 (8 m)', '#1c7ed6', 45);
  drawLocationFlagM(relayCtx, 12.0, 'Handoff 2 (12 m)', '#d67b19', 45);
  drawLocationFlagM(relayCtx, 16.0, 'Finish Line (16 m)', '#c92a2a', 45);

  const activeS = state.relayRunners.activeStudent;
  const runnerColor = activeS === 1 ? '#1c7ed6' : (activeS === 2 ? '#d67b19' : '#1a7f4e');
  const runnerLabel = activeS === 'done' ? 'Relay Finished' : `Student ${activeS}`;
  drawAnimatedWalker(relayCtx, state.relayRunners.x, TRACK_CENTER_Y - 2, 3.0, state.relayRunners.stepPhase, runnerColor, runnerLabel);
}

// --- Draw Relay Graph ---
function drawRelayGraph() {
  relayGraphCtx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);

  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;

  const graphW = GRAPH_WIDTH - paddingLeft - paddingRight;
  const graphH = GRAPH_HEIGHT - paddingTop - paddingBottom;

  const t1 = state.relayLoggedTimes.t1;
  const t2 = state.relayLoggedTimes.t2;
  const t3 = state.relayLoggedTimes.t3;

  let maxT = 10.0;
  if (t3) maxT = Math.max(maxT, Math.ceil((t3 + 2) / 5) * 5);

  const maxPosVal = 20.0;
  function timeToPx(t) { return paddingLeft + (t / maxT) * graphW; }
  function posToPx(x) { return paddingTop + graphH - (x / maxPosVal) * graphH; }

  relayGraphCtx.fillStyle = '#f8f9fa';
  relayGraphCtx.fillRect(paddingLeft, paddingTop, graphW, graphH);
  relayGraphCtx.strokeStyle = '#ced4da';
  relayGraphCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);

  relayGraphCtx.strokeStyle = '#e9ecef';
  for (let t = 0; t <= maxT + 1e-4; t += maxT / 10) {
    const x = timeToPx(t);
    relayGraphCtx.beginPath();
    relayGraphCtx.moveTo(x, paddingTop);
    relayGraphCtx.lineTo(x, paddingTop + graphH);
    relayGraphCtx.stroke();
    relayGraphCtx.fillStyle = '#495057';
    relayGraphCtx.font = '10px sans-serif';
    relayGraphCtx.textAlign = 'center';
    relayGraphCtx.fillText(t.toFixed(1), x, paddingTop + graphH + 15);
  }

  for (let p = 0; p <= maxPosVal; p += 2) {
    const y = posToPx(p);
    relayGraphCtx.beginPath();
    relayGraphCtx.moveTo(paddingLeft, y);
    relayGraphCtx.lineTo(paddingLeft + graphW, y);
    relayGraphCtx.stroke();
    relayGraphCtx.fillStyle = '#495057';
    relayGraphCtx.font = '10px sans-serif';
    relayGraphCtx.textAlign = 'right';
    relayGraphCtx.fillText(`${p}`, paddingLeft - 8, y + 3);
  }

  relayGraphCtx.fillStyle = '#123140';
  relayGraphCtx.font = 'bold 11px sans-serif';
  relayGraphCtx.textAlign = 'center';
  relayGraphCtx.fillText('Time (s)', paddingLeft + graphW / 2, paddingTop + graphH + 32);

  relayGraphCtx.save();
  relayGraphCtx.translate(18, paddingTop + graphH / 2);
  relayGraphCtx.rotate(-Math.PI / 2);
  relayGraphCtx.fillText('Position (meters)', 0, 0);
  relayGraphCtx.restore();

  if (t1 !== null) {
    relayGraphCtx.strokeStyle = '#1c7ed6';
    relayGraphCtx.lineWidth = 3;
    relayGraphCtx.beginPath();
    relayGraphCtx.moveTo(timeToPx(0), posToPx(0));
    relayGraphCtx.lineTo(timeToPx(t1), posToPx(8));
    relayGraphCtx.stroke();
  }

  if (t1 !== null && t2 !== null) {
    relayGraphCtx.strokeStyle = '#d67b19';
    relayGraphCtx.lineWidth = 3;
    relayGraphCtx.beginPath();
    relayGraphCtx.moveTo(timeToPx(t1), posToPx(8));
    relayGraphCtx.lineTo(timeToPx(t2), posToPx(12));
    relayGraphCtx.stroke();
  }

  if (t1 !== null && t2 !== null && t3 !== null) {
    relayGraphCtx.strokeStyle = '#1a7f4e';
    relayGraphCtx.lineWidth = 3;
    relayGraphCtx.beginPath();
    relayGraphCtx.moveTo(timeToPx(t2), posToPx(12));
    relayGraphCtx.lineTo(timeToPx(t3), posToPx(16));
    relayGraphCtx.stroke();

    relayGraphCtx.strokeStyle = '#0f7e9b';
    relayGraphCtx.lineWidth = 2;
    relayGraphCtx.setLineDash([5, 4]);
    relayGraphCtx.beginPath();
    relayGraphCtx.moveTo(timeToPx(0), posToPx(0));
    relayGraphCtx.lineTo(timeToPx(t3), posToPx(16));
    relayGraphCtx.stroke();
    relayGraphCtx.setLineDash([]);
  }

  const pts = [{ t: 0, x: 0, label: 'Start (0s, 0m)', color: '#123140' }];
  if (t1 !== null) pts.push({ t: t1, x: 8, label: `Handoff 1 (${t1.toFixed(2)}s, 8m)`, color: '#1c7ed6' });
  if (t2 !== null) pts.push({ t: t2, x: 12, label: `Handoff 2 (${t2.toFixed(2)}s, 12m)`, color: '#d67b19' });
  if (t3 !== null) pts.push({ t: t3, x: 16, label: `Finish (${t3.toFixed(2)}s, 16m)`, color: '#1a7f4e' });

  pts.forEach(p => {
    const px = timeToPx(p.t);
    const py = posToPx(p.x);
    relayGraphCtx.fillStyle = p.color;
    relayGraphCtx.strokeStyle = '#ffffff';
    relayGraphCtx.lineWidth = 2;
    relayGraphCtx.beginPath();
    relayGraphCtx.arc(px, py, 6, 0, Math.PI * 2);
    relayGraphCtx.fill();
    relayGraphCtx.stroke();

    relayGraphCtx.fillStyle = '#123140';
    relayGraphCtx.font = 'bold 9px sans-serif';
    relayGraphCtx.textAlign = 'left';
    relayGraphCtx.fillText(p.label, px + 8, py - 4);
  });
}

// --- Draw Challenge Canvas ---
function drawChallSimulation() {
  challCtx.clearRect(0, 0, SIM_WIDTH, 220);

  for (let m = 0; m <= METER_MAX; m += 2) {
    const x = meterToPx(m);
    challCtx.strokeStyle = 'rgba(15, 126, 155, 0.15)';
    challCtx.lineWidth = 1.5;
    challCtx.setLineDash([5, 5]);
    challCtx.beginPath();
    challCtx.moveTo(x, 15);
    challCtx.lineTo(x, 180);
    challCtx.stroke();
    challCtx.setLineDash([]);

    challCtx.fillStyle = 'rgba(12, 54, 68, 0.5)';
    challCtx.font = '500 10px sans-serif';
    challCtx.textAlign = 'center';
    challCtx.fillText(`${m} m`, x, 14);
  }

  const TRACK_CENTER_Y = 110;
  challCtx.fillStyle = '#e9f4fb';
  challCtx.fillRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);
  challCtx.strokeStyle = '#0f7e9b';
  challCtx.lineWidth = 2;
  challCtx.strokeRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);

  drawLocationFlagM(challCtx, 0.0, '0 m', '#1a7f4e', 35);
  drawLocationFlagM(challCtx, 8.0, '8 m', '#1c7ed6', 35);
  drawLocationFlagM(challCtx, 12.0, '12 m', '#d67b19', 35);
  drawLocationFlagM(challCtx, 16.0, '16 m', '#c92a2a', 35);

  const runnerX = state.challRunner.x;
  drawAnimatedWalker(challCtx, runnerX, TRACK_CENTER_Y - 2, 4.0, state.challRunner.stepPhase, '#d67b19', `Student ${state.challRunner.activeStudent}`);
}

// --- Draw Custom Sandbox Canvas ---
function drawCustomSimulation() {
  customCtx.clearRect(0, 0, SIM_WIDTH, SIM_HEIGHT);

  for (let m = 0; m <= METER_MAX; m += 2) {
    const x = meterToPx(m);
    customCtx.strokeStyle = 'rgba(15, 126, 155, 0.15)';
    customCtx.lineWidth = 1.5;
    customCtx.setLineDash([5, 5]);
    customCtx.beginPath();
    customCtx.moveTo(x, 20);
    customCtx.lineTo(x, RULER_Y - 2);
    customCtx.stroke();
    customCtx.setLineDash([]);

    customCtx.fillStyle = 'rgba(12, 54, 68, 0.5)';
    customCtx.font = '500 10px sans-serif';
    customCtx.textAlign = 'center';
    customCtx.fillText(`${m} m`, x, 16);
  }

  const TRACK_CENTER_Y = 135;
  customCtx.fillStyle = '#e9f4fb';
  customCtx.fillRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);
  customCtx.strokeStyle = '#0f7e9b';
  customCtx.lineWidth = 2;
  customCtx.strokeRect(TRACK_PADDING, TRACK_CENTER_Y - 6, SIM_WIDTH - 2 * TRACK_PADDING, 12);

  drawRulerTape(customCtx, METER_MAX, 'm');

  // Custom Markers
  drawLocationFlagM(customCtx, state.customX0, `Start X₀ (${state.customX0} m)`, '#1a7f4e', 45);
  drawTurnaroundCone(customCtx, state.customXTurn);
  drawLocationFlagM(customCtx, state.customXf, `Destination X_f (${state.customXf} m)`, '#c92a2a', 65);

  drawAnimatedWalker(customCtx, state.customWalker.x, TRACK_CENTER_Y - 2, state.customWalker.v, state.customWalker.stepPhase, '#0f7e9b', 'Custom Walker');
}

function drawCustomGraph() {
  customGraphCtx.clearRect(0, 0, GRAPH_WIDTH, 340);

  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;

  const graphW = GRAPH_WIDTH - paddingLeft - paddingRight;
  const graphH = 340 - paddingTop - paddingBottom;

  const dx1 = Math.abs(state.customXTurn - state.customX0);
  const dx2 = Math.abs(state.customXf - state.customXTurn);
  const dt1 = dx1 / (state.customV1 || 1e-5);
  const dt2 = dx2 / (state.customV2 || 1e-5);
  const totalTime = dt1 + dt2;

  let maxT = Math.max(10.0, Math.ceil((totalTime + 2) / 5) * 5);
  const maxPosVal = 20.0;

  function timeToPx(t) { return paddingLeft + (t / maxT) * graphW; }
  function posToPx(x) { return paddingTop + graphH - (x / maxPosVal) * graphH; }

  customGraphCtx.fillStyle = '#f8f9fa';
  customGraphCtx.fillRect(paddingLeft, paddingTop, graphW, graphH);
  customGraphCtx.strokeStyle = '#ced4da';
  customGraphCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);

  customGraphCtx.strokeStyle = '#e9ecef';
  for (let t = 0; t <= maxT + 1e-4; t += maxT / 10) {
    const x = timeToPx(t);
    customGraphCtx.beginPath();
    customGraphCtx.moveTo(x, paddingTop);
    customGraphCtx.lineTo(x, paddingTop + graphH);
    customGraphCtx.stroke();
    customGraphCtx.fillStyle = '#495057';
    customGraphCtx.font = '10px sans-serif';
    customGraphCtx.textAlign = 'center';
    customGraphCtx.fillText(t.toFixed(1), x, paddingTop + graphH + 15);
  }

  for (let p = 0; p <= maxPosVal; p += 2) {
    const y = posToPx(p);
    customGraphCtx.beginPath();
    customGraphCtx.moveTo(paddingLeft, y);
    customGraphCtx.lineTo(paddingLeft + graphW, y);
    customGraphCtx.stroke();
    customGraphCtx.fillStyle = '#495057';
    customGraphCtx.font = '10px sans-serif';
    customGraphCtx.textAlign = 'right';
    customGraphCtx.fillText(`${p}`, paddingLeft - 8, y + 3);
  }

  customGraphCtx.fillStyle = '#123140';
  customGraphCtx.font = 'bold 11px sans-serif';
  customGraphCtx.textAlign = 'center';
  customGraphCtx.fillText('Time (s)', paddingLeft + graphW / 2, paddingTop + graphH + 32);

  // Leg 1 Line
  customGraphCtx.strokeStyle = '#0f7e9b';
  customGraphCtx.lineWidth = 3;
  customGraphCtx.beginPath();
  customGraphCtx.moveTo(timeToPx(0), posToPx(state.customX0));
  customGraphCtx.lineTo(timeToPx(dt1), posToPx(state.customXTurn));
  customGraphCtx.stroke();

  // Leg 2 Line
  customGraphCtx.strokeStyle = '#d67b19';
  customGraphCtx.lineWidth = 3;
  customGraphCtx.beginPath();
  customGraphCtx.moveTo(timeToPx(dt1), posToPx(state.customXTurn));
  customGraphCtx.lineTo(timeToPx(totalTime), posToPx(state.customXf));
  customGraphCtx.stroke();

  // Average Velocity Chord
  customGraphCtx.strokeStyle = '#1a7f4e';
  customGraphCtx.lineWidth = 2.5;
  customGraphCtx.setLineDash([5, 4]);
  customGraphCtx.beginPath();
  customGraphCtx.moveTo(timeToPx(0), posToPx(state.customX0));
  customGraphCtx.lineTo(timeToPx(totalTime), posToPx(state.customXf));
  customGraphCtx.stroke();
  customGraphCtx.setLineDash([]);
}

// =========================================================================
// CANVAS SPRITES & RULERS
// =========================================================================
function drawAnimatedWalker(ctx, meterPos, trackY, velocity, phase, color, label) {
  const x = meterToPx(meterPos);
  const isMovingLeft = velocity < 0;

  ctx.save();
  ctx.translate(x, trackY);
  if (isMovingLeft) ctx.scale(-1, 1);

  const headY = -36;
  const torsoTop = -26;
  const torsoBottom = -10;
  const legSwing = Math.sin(phase) * 12;

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, headY, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // Torso
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, torsoTop);
  ctx.lineTo(0, torsoBottom);
  ctx.stroke();

  // Left Leg
  ctx.beginPath();
  ctx.moveTo(0, torsoBottom);
  ctx.lineTo(-legSwing, 6);
  ctx.stroke();

  // Right Leg
  ctx.beginPath();
  ctx.moveTo(0, torsoBottom);
  ctx.lineTo(legSwing, 6);
  ctx.stroke();

  // Left Arm
  ctx.beginPath();
  ctx.moveTo(0, torsoTop + 2);
  ctx.lineTo(legSwing * 0.8, -14);
  ctx.stroke();

  // Right Arm (with baton)
  ctx.beginPath();
  ctx.moveTo(0, torsoTop + 2);
  ctx.lineTo(-legSwing * 0.8, -14);
  ctx.stroke();

  // Baton
  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-legSwing * 0.8 - 4, -18);
  ctx.lineTo(-legSwing * 0.8 + 4, -10);
  ctx.stroke();

  ctx.restore();

  // Label
  ctx.fillStyle = color;
  ctx.font = 'bold 9.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, trackY - 48);
  ctx.fillText(`x = ${meterPos.toFixed(1)} m`, x, trackY - 38);
}

function drawTurnaroundCone(ctx, meterPos) {
  const x = meterToPx(meterPos);
  ctx.save();
  
  ctx.fillStyle = '#f59f00';
  ctx.beginPath();
  ctx.moveTo(x - 9, 135);
  ctx.lineTo(x + 9, 135);
  ctx.lineTo(x, 105);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d9480f';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - 5, 122);
  ctx.lineTo(x + 5, 122);
  ctx.lineTo(x + 3, 115);
  ctx.lineTo(x - 3, 115);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#d67b19';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 25);
  ctx.lineTo(x, 105);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#fff4e6';
  ctx.strokeStyle = '#d67b19';
  drawRoundedRect(ctx, x - 65, 22, 130, 20, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d9480f';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🚩 Turnaround: ${meterPos} m`, x, 35);
  ctx.restore();
}

function drawLocationFlagM(ctx, meterPos, text, color, yOffset) {
  const x = meterToPx(meterPos);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, yOffset);
  ctx.lineTo(x, 125);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = 'bold 8.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, yOffset - 3);
  ctx.restore();
}

function drawRulerTape(ctx, maxVal, unit) {
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
  
  const step = 1;
  const majorStep = unit === 'm' ? 2 : 30;
  const midStep = unit === 'm' ? 1 : 10;
  
  for (let val = 0; val <= maxVal; val += step) {
    const x = unit === 'm' ? meterToPx(val) : cmToPx(val);
    
    if (val % majorStep === 0) {
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTop + 14);
      ctx.stroke();
      ctx.fillText(`${val} ${val === 0 ? unit : ''}`, x, yTop + 26);
    } else if (val % midStep === 0) {
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTop + 9);
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
  
  if (velocity < 0) ctx.scale(-1, 1);
  
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

function meterToPx(m) {
  return TRACK_PADDING + m * MeterScaleFactor;
}

window.addEventListener('load', init);
