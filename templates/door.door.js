import { door } from '@imakeinternet/door-sdk';

export default door({
  name: '__NAME__',
  summary: 'A brand new door.',
  author: 'you',

  // A door is plain synchronous code. Read input as if it blocks — the host
  // suspends the sandbox for you while it waits.
  play(ctx) {
    ctx.screen.clear();
    ctx.screen.color('  Welcome to __NAME__!\r\n\r\n', 'bold', 'cyan');

    const name = ctx.input.line('  What is your name, traveller? ') || ctx.player.handle;
    ctx.screen.say(`\r\n  Well met, ${name}.`);

    ctx.player.visits = (ctx.player.visits || 0) + 1;
    ctx.player.save();
    ctx.screen.color(`\r\n  You have visited __NAME__ ${ctx.player.visits} time(s).\r\n`, 'yellow');

    ctx.screen.say('\r\n  Press any key to leave...');
    ctx.input.key();
  },
});
