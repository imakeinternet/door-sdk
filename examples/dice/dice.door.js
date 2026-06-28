import { door } from '@imakeinternet/door-sdk';

// A slightly bigger example: a menu loop, a numeric save field that feeds the
// world leaderboard, and a board-wide broadcast on a notable win. Randomness
// comes from the host (Math.random inside the sandbox is host-seeded) so games
// stay fair and reproducible.
const d6 = () => 1 + Math.floor(Math.random() * 6);

export default door({
  name: 'High Roller',
  summary: 'Roll against the house — a tiny menu + leaderboard demo.',
  author: 'the BBS authors',

  play(ctx) {
    ctx.player.wins = ctx.player.wins || 0;

    while (true) {
      ctx.screen.clear();
      ctx.screen.color('  H I G H   R O L L E R\r\n\r\n', 'bold', 'yellow');
      ctx.screen.say(`  Wins: ${ctx.player.wins}\r\n`);

      const choice = ctx.menu('What now?', ['Roll the dice', 'Leaderboard', 'Cash out']);

      if (choice === 2) break;

      if (choice === 1) {
        const top = ctx.world.leaderboard({ field: 'wins', limit: 5 });
        ctx.screen.say('\r\n  Top rollers:');
        top.forEach((row, i) => ctx.screen.say(`   ${i + 1}. ${row.handle} — ${row.score}`));
        ctx.screen.say('\r\n  Press any key...');
        ctx.input.key();
        continue;
      }

      const you = d6() + d6();
      const house = d6() + d6();
      ctx.screen.say(`\r\n  You rolled ${you}; the house rolled ${house}.`);

      if (you > house) {
        ctx.player.wins += 1;
        ctx.player.save();
        ctx.screen.color('  You win!\r\n', 'bold', 'green');
        if (you === 12) ctx.world.broadcast(`${ctx.player.handle} rolled boxcars in High Roller!`);
      } else {
        ctx.screen.color('  The house takes it.\r\n', 'red');
      }

      ctx.screen.say('  Press any key...');
      ctx.input.key();
    }

    return { wins: ctx.player.wins };
  },
});
