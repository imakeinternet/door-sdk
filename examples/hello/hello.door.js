import { door } from '@imakeinternet/door-sdk';

// The smallest useful door: read input, persist a save blob, greet by name.
// A door is plain *synchronous* code — `ctx.input.line()` reads as if it blocks
// because the host suspends the sandbox while it waits.
export default door({
  name: 'Hello Door',
  summary: 'The smallest possible door — say hi and remember a name.',
  author: 'the BBS authors',

  play(ctx) {
    ctx.screen.clear();
    ctx.screen.color('  Hello, traveller!\r\n\r\n', 'bold', 'cyan');

    const name = ctx.input.line('  What may I call you? ') || ctx.player.handle;

    ctx.player.visits = (ctx.player.visits || 0) + 1;
    ctx.player.lastName = name;
    ctx.player.save();

    ctx.screen.say(`\r\n  Well met, ${name}.`);
    ctx.screen.color(`  You have visited ${ctx.player.visits} time(s).\r\n`, 'yellow');

    ctx.screen.say('\r\n  Press any key to leave...');
    ctx.input.key();
  },
});
