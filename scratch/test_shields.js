
import { calcStats } from '../src/utils/helpers.js';

const today = new Date();
const todayStr = today.toISOString().substring(0, 10);
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().substring(0, 10);
const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
const threeDaysAgoStr = threeDaysAgo.toISOString().substring(0, 10);

const habits = [
  { 
    id: 1, 
    name: 'Habit 1', 
    frequency: 'daily', 
    created_date: '2026-01-01',
    completedDates: [todayStr] // Missed yesterday and 3 days ago
  }
];

const profile = {
    initial_shields: 5,
    initial_shields_granted_at: '2026-01-01'
};

const stats = calcStats(habits, [], true, profile);
console.log('Today:', todayStr);
console.log('Shielded Dates:', stats.shieldedDates);
console.log('Shields Remaining:', stats.shields);

if (stats.shieldedDates.includes(yesterdayStr)) {
    console.log('✅ Yesterday (1 day ago) was shielded.');
} else {
    console.log('❌ Yesterday (1 day ago) was NOT shielded.');
}

if (!stats.shieldedDates.includes(threeDaysAgoStr)) {
    console.log('✅ 3 days ago was NOT shielded (outside 48h).');
} else {
    console.log('❌ 3 days ago WAS shielded (Bug: should be outside 48h).');
}
