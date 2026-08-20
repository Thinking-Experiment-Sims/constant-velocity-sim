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
  TRACK_MAX,
  TRACK_MIN
} from '../src/constantVelocityPhysics.js';

console.log('Running constantVelocityPhysics.js unit tests (Speed and Error Analysis)...\n');

// 1. Test calculatePosition
console.log('Test 1: calculatePosition');
assert.strictEqual(calculatePosition(0, 0, 30), 0);
assert.strictEqual(calculatePosition(2, 60, 30), 120);
assert.strictEqual(calculatePosition(10, 210, -10), 110);
assert.strictEqual(calculatePosition(-5, 100, 30), 100, 'Negative time should return initial position');
console.log('✓ calculatePosition passed');

// 2. Test isAtBoundary
console.log('\nTest 2: isAtBoundary');
assert.strictEqual(isAtBoundary(240, 30), true, 'Should be at boundary at TRACK_MAX going forward');
assert.strictEqual(isAtBoundary(241, 30), true, 'Should be at boundary past TRACK_MAX going forward');
assert.strictEqual(isAtBoundary(239, 30), false, 'Should not be at boundary before TRACK_MAX going forward');
assert.strictEqual(isAtBoundary(0, -30), true, 'Should be at boundary at TRACK_MIN going backward');
assert.strictEqual(isAtBoundary(-1, -30), true, 'Should be at boundary past TRACK_MIN going backward');
assert.strictEqual(isAtBoundary(1, -30), false, 'Should not be at boundary before TRACK_MIN going backward');
console.log('✓ isAtBoundary passed');

// 3. Test clampPosition
console.log('\nTest 3: clampPosition');
assert.strictEqual(clampPosition(-10), 0);
assert.strictEqual(clampPosition(250), 240);
assert.strictEqual(clampPosition(120), 120);
console.log('✓ clampPosition passed');

// 4. Test calculateMeetingPoint
console.log('\nTest 4: calculateMeetingPoint');
// Red (0 cm, +30 cm/s) and Blue (210 cm, -10 cm/s)
// 30t = 210 - 10t => 40t = 210 => t = 5.25 s, x = 157.5 cm
const meet1 = calculateMeetingPoint(0, 30, 210, -10);
assert.ok(meet1, 'Cars should meet');
assert.strictEqual(meet1.time, 5.25);
assert.strictEqual(meet1.position, 157.5);

// Blue (0 cm, +10 cm/s) and Blue (210 cm, -10 cm/s)
// 10t = 210 - 10t => 20t = 210 => t = 10.5 s, x = 105.0 cm
const meet2 = calculateMeetingPoint(0, 10, 210, -10);
assert.ok(meet2);
assert.strictEqual(meet2.time, 10.5);
assert.strictEqual(meet2.position, 105.0);
console.log('✓ calculateMeetingPoint passed');

// 5. Test fitLinearRegression with scatter
console.log('\nTest 5: fitLinearRegression');
const points = [
  { t: 0.0, x: 60.0 },
  { t: 2.0, x: 120.0 },
  { t: 4.0, x: 180.0 }
];
const fit = fitLinearRegression(points);
assert.ok(fit);
assert.strictEqual(Math.round(fit.slope * 100) / 100, 30.0);
assert.strictEqual(Math.round(fit.intercept * 100) / 100, 60.0);
assert.strictEqual(fit.r2, 1.0);
console.log('✓ fitLinearRegression passed');

// 6. Test calculatePercentError
console.log('\nTest 6: calculatePercentError');
assert.strictEqual(calculatePercentError(29.4, 30.0).toFixed(2), '2.00');
assert.strictEqual(calculatePercentError(30.0, 30.0), 0);
console.log('✓ calculatePercentError passed');

// 7. Test getGroupConfig
console.log('\nTest 7: getGroupConfig');
const config1 = getGroupConfig(1);
assert.ok(config1);
assert.strictEqual(config1.group, 1);
assert.strictEqual(config1.trial1.color, 'red');
assert.strictEqual(config1.trial1.x0, 0);
assert.strictEqual(config1.trial1.v, VELOCITY_RED);
assert.strictEqual(config1.trial2.color, 'blue');
assert.strictEqual(config1.trial2.x0, 210);
assert.strictEqual(config1.trial2.v, -VELOCITY_BLUE);
console.log('✓ getGroupConfig passed');

console.log('\nAll tests completed successfully!');
