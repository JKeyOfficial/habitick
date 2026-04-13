
import { calcStats } from '../src/utils/helpers.js';

const today = new Date();
const todayStr = today.toISOString().substring(0, 10);
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().substring(0, 10);
const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
const twoDaysAgoStr = twoDaysAgo.toISOString().substring(0, 10);

// Setup: 
// 1. Habit completed 2 days ago.
// 2. Habit MISSED yesterday (should be shielded).
// 3. Habit completed today.
// Total streak should be 3.

const habits = [
  { 
    id: 1, 
    name: 'Test Habit', 
    frequency: 'daily', 
    created_date: twoDaysAgoStr,
    completedDates: [todayStr, twoDaysAgoStr] 
  }
];

const profile = {
    initial_shields: 5,
    initial_shields_granted_at: twoDaysAgoStr
};

const stats = calcStats(habits, [], true, profile);
console.log('Today:', todayStr);
console.log('Yesterday:', yesterdayStr);
console.log('Two Days Ago:', twoDaysAgoStr);
console.log('Shielded Dates:', stats.shieldedDates);
console.log('Current Streak:', stats.currentStreak);

if (stats.shieldedDates.includes(yesterdayStr)) {
    console.log('✅ Yesterday was shielded.');
} else {
    console.log('❌ Yesterday was NOT shielded.');
}

if (stats.currentStreak === 3) {
    console.log('✅ Streak is 3 (includes today, shielded yesterday, and two days ago).');
} else {
    console.log(`❌ Streak is ${stats.currentStreak} (Expected 3).`);
}
