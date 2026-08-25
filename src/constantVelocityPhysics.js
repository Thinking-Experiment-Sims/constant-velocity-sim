/**
 * constantVelocityPhysics.js
 * 
 * Pure functions for constant velocity and average velocity physics simulations.
 * No DOM references are allowed in this file so that it remains testable in isolation.
 */

// Constants
export const TRACK_MIN = 0.0;     // cm
export const TRACK_MAX = 240.0;   // cm

export const VELOCITY_RED = 30.0;  // cm/s (Fast Car)
export const VELOCITY_BLUE = 10.0; // cm/s (Slow Car)

export const ARDUINO_SPEED_SLOW = 15.0; // cm/s (Arduino Slow)
export const ARDUINO_SPEED_FAST = 30.0; // cm/s (Arduino Fast)

/**
 * Calculates position given time, initial position, and velocity.
 * Formula: x(t) = x0 + v * t
 * 
 * @param {number} t - Time in seconds
 * @param {number} x0 - Initial position in cm
 * @param {number} v - Constant velocity in cm/s
 * @returns {number} Current position in cm
 */
export function calculatePosition(t, x0, v) {
  if (t < 0) return x0;
  return x0 + v * t;
}

/**
 * Checks if a car has reached or exceeded the track boundaries.
 * 
 * @param {number} x - Current position in cm
 * @param {number} v - Current velocity in cm/s
 * @returns {boolean} True if a boundary is reached
 */
export function isAtBoundary(x, v) {
  if (v > 0 && x >= TRACK_MAX) {
    return true;
  }
  if (v < 0 && x <= TRACK_MIN) {
    return true;
  }
  return false;
}

/**
 * Clamps position to track boundaries.
 * 
 * @param {number} x - Position in cm
 * @returns {number} Clamped position in cm
 */
export function clampPosition(x) {
  return Math.max(TRACK_MIN, Math.min(TRACK_MAX, x));
}

/**
 * Calculates the meeting point (time and position) of two moving cars analytically.
 * Formula: 
 * x1(t) = x0_1 + v1 * t
 * x2(t) = x0_2 + v2 * t
 * x1(t) = x2(t) => t = (x0_2 - x0_1) / (v1 - v2)
 * 
 * @param {number} x0_1 - Initial position of Car 1
 * @param {number} v1 - Velocity of Car 1
 * @param {number} x0_2 - Initial position of Car 2
 * @param {number} v2 - Velocity of Car 2
 * @returns {object|null} { time: number, position: number } or null if they don't meet
 */
export function calculateMeetingPoint(x0_1, v1, x0_2, v2) {
  const relativeVelocity = v1 - v2;
  if (Math.abs(relativeVelocity) < 1e-5) {
    return null; // Parallel paths, will never meet
  }
  
  const time = (x0_2 - x0_1) / relativeVelocity;
  
  // They only meet in the future (t >= 0)
  if (time < 0) {
    return null;
  }
  
  const position = x0_1 + v1 * time;
  
  // Make sure meeting position is within the track limits
  if (position < TRACK_MIN || position > TRACK_MAX) {
    return null;
  }
  
  return { time, position };
}

/**
 * Retrieves configuration details for the 6 standard lab groups (Two Cars mode).
 * 
 * @param {number|string} groupNum - Group number (1 to 6)
 * @returns {object|null} Config containing trial configurations or null
 */
export function getGroupConfig(groupNum) {
  const num = parseInt(groupNum, 10);
  if (isNaN(num) || num < 1 || num > 6) {
    return null;
  }
  
  switch (num) {
    case 1:
      return {
        group: 1,
        trial1: { color: 'red', x0: 0.0, v: VELOCITY_RED },
        trial2: { color: 'blue', x0: 210.0, v: -VELOCITY_BLUE }
      };
    case 2:
      return {
        group: 2,
        trial1: { color: 'blue', x0: 0.0, v: VELOCITY_BLUE },
        trial2: { color: 'blue', x0: 210.0, v: -VELOCITY_BLUE }
      };
    case 3:
      return {
        group: 3,
        trial1: { color: 'red', x0: 60.0, v: VELOCITY_RED },
        trial2: { color: 'blue', x0: 150.0, v: -VELOCITY_BLUE }
      };
    case 4:
      return {
        group: 4,
        trial1: { color: 'red', x0: 60.0, v: VELOCITY_RED },
        trial2: { color: 'red', x0: 150.0, v: -VELOCITY_RED }
      };
    case 5:
      return {
        group: 5,
        trial1: { color: 'blue', x0: 0.0, v: VELOCITY_BLUE },
        trial2: { color: 'red', x0: 210.0, v: -VELOCITY_RED }
      };
    case 6:
      return {
        group: 6,
        trial1: { color: 'blue', x0: 60.0, v: VELOCITY_BLUE },
        trial2: { color: 'red', x0: 210.0, v: -VELOCITY_RED }
      };
    default:
      return null;
  }
}

/**
 * Fits a line x = v * t + x0 to a set of data points (t, x) using linear regression.
 * 
 * @param {Array} points - Array of { t, x } points
 * @returns {object|null} { slope: number, intercept: number, r2: number } or null
 */
export function fitLinearRegression(points) {
  const validPoints = points.filter(p => p !== null && p !== undefined && !isNaN(p.t) && !isNaN(p.x));
  if (validPoints.length < 2) return null;
  
  let sumT = 0;
  let sumX = 0;
  let sumTX = 0;
  let sumTT = 0;
  let sumXX = 0;
  const n = validPoints.length;
  
  for (const p of validPoints) {
    sumT += p.t;
    sumX += p.x;
    sumTX += p.t * p.x;
    sumTT += p.t * p.t;
    sumXX += p.x * p.x;
  }
  
  const denominator = (n * sumTT - sumT * sumT);
  if (Math.abs(denominator) < 1e-6) return null; 
  
  const slope = (n * sumTX - sumT * sumX) / denominator;
  const intercept = (sumX - slope * sumT) / n;
  
  // Calculate R^2 (coefficient of determination)
  const meanX = sumX / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of validPoints) {
    const predictedX = slope * p.t + intercept;
    ssTot += (p.x - meanX) * (p.x - meanX);
    ssRes += (p.x - predictedX) * (p.x - predictedX);
  }
  
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - (ssRes / ssTot));
  
  return { slope, intercept, r2 };
}

/**
 * Calculates percent error between experimental value and theoretical value.
 * 
 * @param {number} exp - Experimental value
 * @param {number} theo - Theoretical value
 * @returns {number} Percent error (%)
 */
export function calculatePercentError(exp, theo) {
  if (Math.abs(theo) < 1e-5) return 0;
  return Math.abs((exp - theo) / theo) * 100;
}

// =========================================================================
// AVERAGE VELOCITY / ARDUINO CARS MULTI-SEGMENT TRIP ENGINE
// =========================================================================

/**
 * Standard definitions for Arduino Car Trips 1 through 8
 * Each trip consists of:
 * - Segment 1: from x0 to xTape at velocity v1
 * - Segment 2: from xTape to xf at velocity v2
 */
export const ARDUINO_TRIPS = {
  1: {
    trip: 1,
    name: "Trip 1: Slow Forward, Fast Forward",
    description: "Slow forward from 0 to 100 cm, then fast forward from 100 to 200 cm",
    x0: 0.0,
    xTape: 100.0,
    xf: 200.0,
    v1: ARDUINO_SPEED_SLOW,
    v2: ARDUINO_SPEED_FAST
  },
  2: {
    trip: 2,
    name: "Trip 2: Fast Back, Slow Back",
    description: "Fast back from 200 to 100 cm, then slow back from 100 to 0 cm",
    x0: 200.0,
    xTape: 100.0,
    xf: 0.0,
    v1: -ARDUINO_SPEED_FAST,
    v2: -ARDUINO_SPEED_SLOW
  },
  3: {
    trip: 3,
    name: "Trip 3: Fast Back, Slow Back",
    description: "Fast back from 200 to 40 cm, then slow back from 40 to 0 cm (or 0→40→200 cm)",
    x0: 0.0,
    xTape: 40.0,
    xf: 200.0,
    v1: ARDUINO_SPEED_SLOW,
    v2: ARDUINO_SPEED_FAST
  },
  4: {
    trip: 4,
    name: "Trip 4: Slow Back, Fast Back",
    description: "Slow back from 200 to 160 cm, then fast back from 160 to 0 cm",
    x0: 200.0,
    xTape: 160.0,
    xf: 0.0,
    v1: -ARDUINO_SPEED_SLOW,
    v2: -ARDUINO_SPEED_FAST
  },
  5: {
    trip: 5,
    name: "Trip 5: Slow Forward, Fast Back",
    description: "Slow forward from 0 to 100 cm, then fast back from 100 to 0 cm",
    x0: 0.0,
    xTape: 100.0,
    xf: 0.0,
    v1: ARDUINO_SPEED_SLOW,
    v2: -ARDUINO_SPEED_FAST
  },
  6: {
    trip: 6,
    name: "Trip 6: Fast Forward, Slow Back",
    description: "Fast forward from 0 to 100 cm, then slow back from 100 to 0 cm",
    x0: 0.0,
    xTape: 100.0,
    xf: 0.0,
    v1: ARDUINO_SPEED_FAST,
    v2: -ARDUINO_SPEED_SLOW
  },
  7: {
    trip: 7,
    name: "Trip 7: Fast Back, Slow Forward",
    description: "Fast back from 200 to 40 cm, then slow forward from 40 to 80 cm",
    x0: 200.0,
    xTape: 40.0,
    xf: 80.0,
    v1: -ARDUINO_SPEED_FAST,
    v2: ARDUINO_SPEED_SLOW
  },
  8: {
    trip: 8,
    name: "Trip 8: Slow Forward, Fast Back",
    description: "Slow forward from 0 to 160 cm, then fast back from 160 to 120 cm",
    x0: 0.0,
    xTape: 160.0,
    xf: 120.0,
    v1: ARDUINO_SPEED_SLOW,
    v2: -ARDUINO_SPEED_FAST
  }
};

/**
 * Standard group scenarios (Groups A through F) from the Average Velocity Arduino Cars Lab.
 */
export const ARDUINO_GROUPS = {
  'A': {
    group: 'A',
    trial1: { trip: 1, ...ARDUINO_TRIPS[1] },
    trial2: { trip: 5, ...ARDUINO_TRIPS[5], name: "Trip 5: Fast Forward, Slow Back", v1: ARDUINO_SPEED_FAST, v2: -ARDUINO_SPEED_SLOW }
  },
  'B': {
    group: 'B',
    trial1: { trip: 2, ...ARDUINO_TRIPS[2], name: "Trip 2: Slow Forward, Fast Forward", x0: 200.0, xTape: 100.0, xf: 0.0, v1: -ARDUINO_SPEED_SLOW, v2: -ARDUINO_SPEED_FAST },
    trial2: { trip: 6, ...ARDUINO_TRIPS[6] }
  },
  'C': {
    group: 'C',
    trial1: { trip: 1, ...ARDUINO_TRIPS[1] },
    trial2: { trip: 5, ...ARDUINO_TRIPS[5] }
  },
  'D': {
    group: 'D',
    trial1: { trip: 3, ...ARDUINO_TRIPS[3] },
    trial2: { trip: 7, ...ARDUINO_TRIPS[7] }
  },
  'E': {
    group: 'E',
    trial1: { trip: 4, ...ARDUINO_TRIPS[4] },
    trial2: { trip: 8, ...ARDUINO_TRIPS[8] }
  },
  'F': {
    group: 'F',
    trial1: { trip: 2, ...ARDUINO_TRIPS[2] },
    trial2: { trip: 6, ...ARDUINO_TRIPS[6] }
  }
};

/**
 * Calculates theoretical transition times and total time for a piecewise trip.
 * 
 * @param {object} trip - { x0, xTape, xf, v1, v2 }
 * @returns {object} { t1, t2, totalTime }
 */
export function calculateTripDuration(trip) {
  const dist1 = Math.abs(trip.xTape - trip.x0);
  const dist2 = Math.abs(trip.xf - trip.xTape);
  
  const speed1 = Math.abs(trip.v1) || 1e-5;
  const speed2 = Math.abs(trip.v2) || 1e-5;
  
  const t1 = dist1 / speed1;
  const t2 = dist2 / speed2;
  const totalTime = t1 + t2;
  
  return { t1, t2, totalTime };
}

/**
 * Calculates the instantaneous position and current velocity of a car in piecewise motion at elapsed time t.
 * 
 * @param {number} t - Elapsed time in seconds
 * @param {object} trip - { x0, xTape, xf, v1, v2 }
 * @returns {object} { x: number, v: number, segment: 1|2|'done', isFinished: boolean }
 */
export function calculatePiecewisePosition(t, trip) {
  if (t <= 0) {
    return { x: trip.x0, v: trip.v1, segment: 1, isFinished: false };
  }
  
  const { t1, totalTime } = calculateTripDuration(trip);
  
  if (t <= t1) {
    // In Segment 1
    const x = trip.x0 + trip.v1 * t;
    return { x: clampPosition(x), v: trip.v1, segment: 1, isFinished: false };
  } else if (t < totalTime) {
    // In Segment 2
    const dt2 = t - t1;
    const x = trip.xTape + trip.v2 * dt2;
    return { x: clampPosition(x), v: trip.v2, segment: 2, isFinished: false };
  } else {
    // Finished
    return { x: trip.xf, v: trip.v2, segment: 'done', isFinished: true };
  }
}

/**
 * Calculates complete average velocity, average speed, displacement, and segment metrics.
 * 
 * @param {number} x0 - Starting position (cm)
 * @param {number} xTape - Tape transition position (cm)
 * @param {number} xf - Final position (cm)
 * @param {number} t0 - Start time (s)
 * @param {number} tTape - Tape crossing time (s)
 * @param {number} tf - Finish time (s)
 * @returns {object} Full kinematic summary
 */
export function calculateAverageVelocityMetrics(x0, xTape, xf, t0, tTape, tf) {
  const dt1 = tTape - t0;
  const dt2 = tf - tTape;
  const totalTime = tf - t0;
  
  const dx1 = xTape - x0;
  const dx2 = xf - xTape;
  const totalDisplacement = xf - x0;
  
  const dist1 = Math.abs(dx1);
  const dist2 = Math.abs(dx2);
  const totalDistance = dist1 + dist2;
  
  const v1 = dt1 > 0 ? dx1 / dt1 : 0;
  const v2 = dt2 > 0 ? dx2 / dt2 : 0;
  
  const averageVelocity = totalTime > 0 ? totalDisplacement / totalTime : 0;
  const averageSpeed = totalTime > 0 ? totalDistance / totalTime : 0;
  
  // Arithmetic mean of velocities (to highlight the common student misconception)
  const arithmeticMeanVelocity = (v1 + v2) / 2;
  
  return {
    segment1: { dx: dx1, dt: dt1, v: v1, dist: dist1 },
    segment2: { dx: dx2, dt: dt2, v: v2, dist: dist2 },
    total: {
      dx: totalDisplacement,
      distance: totalDistance,
      dt: totalTime,
      averageVelocity,
      averageSpeed,
      arithmeticMeanVelocity
    }
  };
}
