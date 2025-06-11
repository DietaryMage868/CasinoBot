// Игровая логика для казино-бота
import { Markup } from 'telegraf';

const slotEmojis = ['7️⃣', '🍇', '🍋', '🐏'];
const emojiMap: { [key: number]: string } = {
  1: '7️⃣',
  2: '🍇',
  3: '🍋',
  4: '🐏',
};

// export async function slotGame(ctx: any, db: any) {
//   const userId = ctx.from?.id;
//   const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
//   const guess = text.replace('/slot', '').trim();
//   if (!Object.values(emojiMap).includes(guess)) {
//     ctx.reply('Введите один из слотовых эмодзи для ставки, например: /slot 7️⃣ или /slot 🍇');
//     return;
//   }
//   // Кидаем анимированный слот 🎰
//   const diceMsg = await ctx.replyWithDice('slot');
//   setTimeout(() => {
//     const resultValue = diceMsg.dice.value;
//     const resultEmoji = emojiMap[resultValue] || '🎰';
//     if (guess === resultEmoji) {
//       db.run('UPDATE users SET balance = balance * 5 WHERE id = ?', [userId]);
//       ctx.reply(`Выпало: ${resultEmoji}\nПоздравляем! Вы выиграли x5 от баланса!`);
//     } else {
//       ctx.reply(`Выпало: ${resultEmoji}\nУвы, не угадали.`);
//     }
//   }, 3000);
// }

export async function evenOddGame(ctx: any, db: any) {
  ctx.session = ctx.session || {};
  ctx.session.awaitingBet = 'evenOdd';
  ctx.reply('Введите сумму ставки (в TON) и отправьте в чат:');
}

export async function handleEvenOddBet(ctx: any, db: any, bet: number) {
  ctx.session = ctx.session || {};
  ctx.session.bet = bet;
  ctx.reply('Выберите:', Markup.inlineKeyboard([
    [Markup.button.callback('Чётное', 'even'), Markup.button.callback('Нечётное', 'odd')]
  ]));
}

export async function handleEvenOddResult(ctx: any, db: any, userChoice: 'even' | 'odd') {
  const userId = ctx.from?.id;
  ctx.session = ctx.session || {};
  const bet = ctx.session.bet || 1;
  db.get('SELECT balance FROM users WHERE id = ?', [userId], (err: any, row: any) => {
    if (!row || row.balance < bet) {
      ctx.reply('Недостаточно средств для ставки!');
      return;
    }
    db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [bet, userId]);
    // 10% шанс на победу игрока
    const win = Math.random() < 0.1;
    let dice;
    if (win) {
      // Подбираем кость под выбор игрока
      dice = userChoice === 'even' ? 2 * (Math.floor(Math.random() * 3) + 1) : 2 * Math.floor(Math.random() * 3) + 1;
    } else {
      // Подбираем кость против игрока
      dice = userChoice === 'even' ? 2 * Math.floor(Math.random() * 3) + 1 : 2 * (Math.floor(Math.random() * 3) + 1);
      // Если вдруг случайно совпало с выбором игрока, меняем на противоположное
      if ((dice % 2 === 0 && userChoice === 'even') || (dice % 2 === 1 && userChoice === 'odd')) {
        dice = dice === 6 ? 5 : dice + 1;
      }
    }
    const diceEmojis = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    ctx.reply(`Вы выбрали: ${userChoice === 'even' ? 'чётное' : 'нечётное'}, ставка: ${bet} TON`);
    ctx.replyWithDice('🎲').then((diceMsg: any) => {
      setTimeout(() => {
        ctx.reply(`${diceEmojis[dice-1]} (${dice})\n${win ? `Поздравляем! Вы выиграли ${(bet*1.5).toFixed(2)} TON!` : 'Увы, не угадали.'}`);
        if (win) {
          db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [bet*1.5, userId]);
        }
      }, 3000);
    });
  });
}

export async function numberGame(ctx: any, db: any) {
  ctx.session = ctx.session || {};
  ctx.session.awaitingBet = 'number';
  ctx.reply('Введите сумму ставки (в TON) и отправьте в чат:');
}

export async function handleNumberBet(ctx: any, db: any, bet: number) {
  ctx.session = ctx.session || {};
  ctx.session.bet = bet;
  ctx.reply('Выберите число от 1 до 6:', Markup.inlineKeyboard([
    [1,2,3,4,5,6].map(n => Markup.button.callback(n.toString(), `num_${n}`))
  ]));
}

export async function handleNumberResult(ctx: any, db: any, userNum: number) {
  const userId = ctx.from?.id;
  ctx.session = ctx.session || {};
  const bet = ctx.session.bet || 1;
  db.get('SELECT balance FROM users WHERE id = ?', [userId], (err: any, row: any) => {
    if (!row || row.balance < bet) {
      ctx.reply('Недостаточно средств для ставки!');
      return;
    }
    db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [bet, userId]);
    // 10% шанс на победу игрока
    const win = Math.random() < 0.1;
    let dice;
    if (win) {
      dice = userNum;
    } else {
      // Подбираем любое число кроме выбранного
      const nums = [1,2,3,4,5,6].filter(n => n !== userNum);
      dice = nums[Math.floor(Math.random() * nums.length)];
      // Если вдруг случайно совпало с выбором игрока, меняем на другое
      if (dice === userNum) {
        dice = dice === 6 ? 5 : dice + 1;
      }
    }
    const diceEmojis = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    ctx.reply(`Вы выбрали: ${userNum}, ставка: ${bet} TON`);
    ctx.replyWithDice('🎲').then((diceMsg: any) => {
      setTimeout(() => {
        ctx.reply(`${diceEmojis[dice-1]} (${dice})\n${win ? `Поздравляем! Вы выиграли ${(bet*3).toFixed(2)} TON!` : 'Увы, не угадали.'}`);
        if (win) {
          db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [bet*3, userId]);
        }
      }, 3000);
    });
  });
}
