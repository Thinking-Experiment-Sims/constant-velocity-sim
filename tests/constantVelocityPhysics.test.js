import assert from 'node:assert';
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
  calculateAverageVelocityMetrics
} from '../src/constantVelocityPhysics.js';

console.log('Running constantVelocityPhysics.js unit tests (Constant & Average Velocity)...\n');

// 1. Test calculatePosition
console.log('Test 1: calculatePosition');
assert.strictEqual(calculatePosition(0, 0, 30), 0);
assert.strictEqual(calculatePosition(2, 60, 30), 120);
assert.strictEqual(calculatePosition(10, 210, -10), 110);
assert.strictEqual(calculatePosition(-5, 100, 30), 100, 'Negative time should return initial position');
console.log('✓ calculatePosition passed');

// 2. Test isAtBoundary
console.log('\nTest 2: isAtBoundary');
assert.strictEqual(isAtBoundary(240, 30), true);
assert.strictEqual(isAtBoundary(241, 30), true);
assert.strictEqual(isAtBoundary(239, 30), false);
assert.strictEqual(isAtBoundary(0, -30), true);
assert.strictEqual(isAtBoundary(-1, -30), true);
assert.strictEqual(isAtBoundary(1, -30), false);
console.log('✓ isAtBoundary passed');

// 3. Test calculateMeetingPoint
console.log('\nTest 3: calculateMeetingPoint');
const meet1 = calculateMeetingPoint(0, 30, 210, -10);
assert.ok(meet1);
assert.strictEqual(meet1.time, 5.25);
assert.strictEqual(meet1.position, 157.5);
console.log('✓ calculateMeetingPoint passed');

// 4. Test Arduino Trips Duration & Piecewise Motion
console.log('\nTest 4: calculateTripDuration & calculatePiecewisePosition');
// Trip 1: 0 -> 100 at 15 cm/s (6.67 s), 100 -> 200 at 30 cm/s (3.33 s)
const trip1 = ARDUINO_TRIPS[1];
const dur1 = calculateTripDuration(trip1);
assert.strictEqual(Math.round(dur1.t1 * 100) / 100, 6.67);
assert.strictEqual(Math.round(dur1.t2 * 100) / 100, 3.33);
assert.strictEqual(Math.round(dur1.totalTime * 100) / 100, 10.00);

const posAt3 = calculatePiecewisePosition(3.0, trip1);
assert.strictEqual(posAt3.segment, 1);
assert.strictEqual(posAt3.x, 45.0);

const posAt8 = calculatePiecewisePosition(8.0, trip1);
assert.strictEqual(posAt8.segment, 2);
// At t=8: t - t1 = 8 - 6.6667 = 1.3333 s -> x = 100 + 30 * 1.3333 = 140.0 cm
assert.strictEqual(Math.round(posAt8.x * 10) / 10, 140.0);

// Trip 5 Turnaround: 0 -> 100 at +15 cm/s, 100 -> 0 at -30 cm/s
const trip5 = ARDUINO_TRIPS[5];
const dur5 = calculateTripDuration(trip5);
assert.strictEqual(Math.round(dur5.totalTime * 100) / 100, 10.00);
const posAtFinish = calculatePiecewisePosition(12.0, trip5);
assert.strictEqual(posAtFinish.isFinished, true);
assert.strictEqual(posAtFinish.x, 0.0);
console.log('✓ Piecewise motion passed');

// 5. Test calculateAverageVelocityMetrics
console.log('\nTest 5: calculateAverageVelocityMetrics');
// Trip 5: x0=0, xTape=100, xf=0, t0=0, tTape=6.6667, tf=10.0
const metrics5 = calculateAverageVelocityMetrics(0, 100, 0, 0, 6.6667, 10.0);
assert.strictEqual(metrics5.total.dx, 0.0, 'Total displacement should be 0');
assert.strictEqual(metrics5.total.distance, 200.0, 'Total distance should be 200 cm');
assert.strictEqual(metrics5.total.averageVelocity, 0.0, 'Average velocity should be 0 cm/s');
assert.strictEqual(metrics5.total.averageSpeed, 20.0, 'Average speed should be 20 cm/s');
assert.strictEqual(Math.round(metrics5.total.arithmeticMeanVelocity * 10) / 10, -7.5, 'Arithmetic mean is NOT average velocity');
console.log('✓ calculateAverageVelocityMetrics passed');

console.log('\nAll tests completed successfully!');
