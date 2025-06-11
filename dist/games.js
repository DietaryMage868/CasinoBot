"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evenOddGame = evenOddGame;
exports.handleEvenOddResult = handleEvenOddResult;
exports.numberGame = numberGame;
exports.handleNumberResult = handleNumberResult;
// Игровая логика для казино-бота
const telegraf_1 = require("telegraf");
const slotEmojis = ['7️⃣', '🍇', '🍋', '🐏'];
const emojiMap = {
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
async function evenOddGame(ctx, db) {
    ctx.reply('Выберите:', telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('Чётное', 'even'), telegraf_1.Markup.button.callback('Нечётное', 'odd')]
    ]));
}
// Новый обработчик для кости (чёт/нечёт)
async function handleEvenOddResult(ctx, db, userChoice) {
    const userId = ctx.from?.id;
    // Кидаем анимированную кость 🎲
    const diceMsg = await ctx.replyWithDice('🎲');
    // После анимации отправляем результат отдельным сообщением
    setTimeout(() => {
        const dice = diceMsg.dice.value;
        const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        const isEven = dice % 2 === 0;
        const win = (isEven && userChoice === 'even') || (!isEven && userChoice === 'odd');
        if (win) {
            db.run('UPDATE users SET balance = balance * 1.5 WHERE id = ?', [userId]);
            ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nПоздравляем! Вы выиграли x1.5 от баланса!`);
        }
        else {
            ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nУвы, не угадали.`);
        }
    }, 3000);
}
async function numberGame(ctx, db) {
    ctx.reply('Выберите число от 1 до 6:', telegraf_1.Markup.inlineKeyboard([
        [1, 2, 3, 4, 5, 6].map(n => telegraf_1.Markup.button.callback(n.toString(), `num_${n}`))
    ]));
}
// Новый обработчик для угадай число
async function handleNumberResult(ctx, db, userNum) {
    const userId = ctx.from?.id;
    const diceMsg = await ctx.replyWithDice('🎲');
    setTimeout(() => {
        const dice = diceMsg.dice.value;
        const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        if (userNum === dice) {
            db.run('UPDATE users SET balance = balance * 3 WHERE id = ?', [userId]);
            ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nПоздравляем! Вы выиграли x3 от баланса!`);
        }
        else {
            ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nУвы, не угадали.`);
        }
    }, 3000);
}
