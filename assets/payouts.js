/* ===================================================================
   payouts.js — the money.

   Everything the site knows about buy-ins and prizes lives here. Add a
   new season each year and the Money page, the manager profiles and the
   pot reconciliation all update themselves.

   places:
     champion    the league champion (winner of the championship game)
     runnerUp    lost the championship game
     third       won the third-place game
     consolation won the consolation / losers bracket final
   weeklyHigh:
     amount paid to the highest scorer of each week, for weeks from..to

   The site checks each season's prizes against what the league collected
   and flags any year that doesn't balance.
   =================================================================== */

const PAYOUTS = {
  '2022': {
    buyIn: 100,
    places: { champion: 700, runnerUp: 220, third: 80 }
  },
  '2023': {
    buyIn: 100,
    places: { champion: 775, runnerUp: 275, third: 100, consolation: 50 }
  },
  '2024': {
    buyIn: 100,
    places: { champion: 775, runnerUp: 275, third: 100, consolation: 50 }
  },
  '2025': {
    buyIn: 100,
    places: { champion: 775, runnerUp: 275, third: 100, consolation: 50 }
  },
  '2026': {
    // Buy-in rose to $150 this year: 12 x $150 = $1,800, which covers
    // $1,450 in placings plus 14 weekly high-score prizes at $25.
    buyIn: 150,
    places: { champion: 1000, runnerUp: 300, third: 150 },
    weeklyHigh: { amount: 25, from: 1, to: 14 }
  }
};

const PAYOUT_LABELS = {
  champion: '1st place',
  runnerUp: '2nd place',
  third: '3rd place',
  consolation: 'Consolation winner',
  weeklyHigh: 'Weekly high score'
};
