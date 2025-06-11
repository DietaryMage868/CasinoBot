// Основной файл Telegram-казино-бота
import { Telegraf, Markup, session } from 'telegraf';
import path from 'path';
import { evenOddGame, numberGame, handleEvenOddResult, handleNumberResult } from './games';
import axios from 'axios';
import fs from 'fs';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is not set!');
const TON_DEPOSIT_ADDRESS = process.env.TON_DEPOSIT_ADDRESS || '';
const TON_WALLET = process.env.TON_WALLET || '';
const TONAPI_KEY = process.env.TONAPI_KEY || '';

const bot = new Telegraf(BOT_TOKEN);
bot.use(session()); // обязательно для работы ставок!

const dbPath = path.resolve(__dirname, '../casino.db');
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database(dbPath);

function initDB() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    balance REAL DEFAULT 0,
    last_tx TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS deposits (
    tx_hash TEXT PRIMARY KEY,
    user_id INTEGER,
    username TEXT,
    amount REAL,
    timestamp INTEGER
  )`);
  // Добавим новые поля если их нет
  db.run(`ALTER TABLE users ADD COLUMN wins INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN losses INTEGER DEFAULT 0`, () => {});
}

bot.start(async (ctx: any) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || '';
  db.run('INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)', [userId, username]);
  ctx.reply('Добро пожаловать в казино!\n/deposit — пополнить баланс TON\n/balance — узнать баланс\n/games — список игр');
});

bot.command('deposit', (ctx: any) => {
  ctx.reply(`Для пополнения баланса переведите TON на адрес:\n${TON_DEPOSIT_ADDRESS}\n\nВ комментарии к переводу укажите свой Telegram username или user id. После перевода используйте /checkdeposit для зачисления.`);
});

bot.command('balance', (ctx: any) => {
  const userId = ctx.from?.id;
  db.get('SELECT balance FROM users WHERE id = ?', [userId], (err: any, row: any) => {
    ctx.reply(`Ваш баланс: ${row?.balance ?? 0} TON`);
  });
});

bot.command('games', (ctx: any) => {
  ctx.reply('Доступные игры:\n🎲 /evenodd — чёт/нечёт\n🎲 /number — угадай число 1-6');
});

bot.command('evenodd', (ctx: any) => evenOddGame(ctx, db));
bot.command('number', (ctx: any) => numberGame(ctx, db));

// Обработка нажатий на кнопки для even/odd и number
bot.on('callback_query', async (ctx: any) => {
  const userId = ctx.from?.id;
  const data = ctx.callbackQuery.data;
  const bet = ctx.session?.bet || 0;

  if (data === 'even' || data === 'odd') {
    const diceMsg = await ctx.replyWithDice('🎲');
    setTimeout(() => {
      const dice = diceMsg.dice.value;
      const diceEmojis = ['⚀','⚁','⚂','⚃','⚄','⚅'];
      const isEven = dice % 2 === 0;
      const win = (isEven && data === 'even') || (!isEven && data === 'odd');
      if (win) {
        db.run('UPDATE users SET balance = balance + ?, wins = wins + 1 WHERE id = ?', [bet * 1.5, userId]);
        ctx.reply(`${diceEmojis[dice-1]} (${dice})\nПоздравляем! Вы выиграли x1.5 от ставки!`);
      } else {
        db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [userId]);
        ctx.reply(`${diceEmojis[dice-1]} (${dice})\nУвы, не угадали.`);
      }
      ctx.session.bet = undefined;
    }, 3000);
  }
  if (data && data.startsWith('num_')) {
    const userNum = parseInt(data.replace('num_', ''));
    const diceMsg = await ctx.replyWithDice('🎲');
    setTimeout(() => {
      const dice = diceMsg.dice.value;
      const diceEmojis = ['⚀','⚁','⚂','⚃','⚄','⚅'];
      if (userNum === dice) {
        db.run('UPDATE users SET balance = balance + ?, wins = wins + 1 WHERE id = ?', [bet * 3, userId]);
        ctx.reply(`${diceEmojis[dice-1]} (${dice})\nПоздравляем! Вы выиграли x3 от ставки!`);
      } else {
        db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [userId]);
        ctx.reply(`${diceEmojis[dice-1]} (${dice})\nУвы, не угадали.`);
      }
      ctx.session.bet = undefined;
    }, 3000);
  }
  ctx.answerCbQuery();
});

// Обработка выбора чёт/нечёт и числа
bot.action(['even', 'odd'], (ctx: any) => {
  require('./games').handleEvenOddResult(ctx, db, ctx.match[0]);
  ctx.answerCbQuery();
});
bot.action(/num_\d+/, (ctx: any) => {
  const num = parseInt(ctx.match[0].replace('num_', ''));
  require('./games').handleNumberResult(ctx, db, num);
  ctx.answerCbQuery();
});

// Обработка текстовых сообщений для ввода ставки
bot.on('text', async (ctx: any) => {
  ctx.session = ctx.session || {};
  const awaiting = ctx.session.awaitingBet;
  if (!awaiting) return;
  const bet = parseFloat(ctx.message.text.replace(',', '.'));
  if (isNaN(bet) || bet <= 0) {
    ctx.reply('Введите корректную сумму ставки (число больше 0).');
    return;
  }

  const userId = ctx.from?.id;
  db.get('SELECT balance FROM users WHERE id = ?', [userId], (err: any, row: any) => {
    if (!row || row.balance < bet) {
      ctx.reply('Недостаточно средств для ставки!');
      return;
    }
    db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [bet, userId]);
    ctx.session.bet = bet;
    ctx.session.awaitingBet = undefined;
    if (awaiting === 'evenOdd') {
      ctx.reply('Выберите:', Markup.inlineKeyboard([
        [Markup.button.callback('Чётное', 'even'), Markup.button.callback('Нечётное', 'odd')]
      ]));
    } else if (awaiting === 'number') {
      ctx.reply('Выберите число от 1 до 6:', Markup.inlineKeyboard([
        [1,2,3,4,5,6].map(n => Markup.button.callback(n.toString(), `num_${n}`))
      ]));
    }
  });
});

async function checkTonDeposit(userId: number, username: string) {
  try {
    const url = `https://tonapi.io/v2/blockchain/accounts/${TON_WALLET}/transactions?limit=20`;
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${TONAPI_KEY}` } });
    const txs = res.data.transactions;
    let found = false;

    for (const tx of txs) {
      if (!tx.in_msg || !tx.in_msg.comment) continue;
      const comment = tx.in_msg.comment;
      if (
        comment.includes(userId.toString()) ||
        (username && (comment.includes(username) || comment.includes('@' + username)))
      ) {
        const exists = await new Promise(resolve => {
          db.get('SELECT 1 FROM deposits WHERE tx_hash = ?', [tx.hash], (err: any, row: any) => resolve(!!row));
        });
        if (!exists) {
          const amount = tx.in_msg.value / 1e9;
          db.run('UPDATE users SET balance = balance + ?, last_tx = ? WHERE id = ?', [amount, tx.hash, userId]);
          db.run('INSERT INTO deposits (tx_hash, user_id, username, amount, timestamp) VALUES (?, ?, ?, ?, ?)', [
            tx.hash, userId, username, amount, tx.utime
          ]);
          found = true;
          return amount;
        }
      }
    }

    // Если не найдено — ищем "висящие" депозиты и сохраняем их в файл
    const unclaimed: any[] = [];
    for (const tx of txs) {
      if (!tx.in_msg || !tx.in_msg.comment) continue;
      const exists = await new Promise(resolve => {
        db.get('SELECT 1 FROM deposits WHERE tx_hash = ?', [tx.hash], (err: any, row: any) => resolve(!!row));
      });
      if (!exists) {
        unclaimed.push({
          tx_hash: tx.hash,
          comment: tx.in_msg.comment,
          amount: tx.in_msg.value / 1e9,
          timestamp: tx.utime
        });
      }
    }
    if (unclaimed.length > 0) {
      fs.writeFileSync('unclaimed_deposits.json', JSON.stringify(unclaimed, null, 2), 'utf-8');
    }

    return 0;
  } catch (e) {
    console.error('Ошибка при проверке депозита:', e);
    return 0;
  }
}

bot.command('checkdeposit', async (ctx: any) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || '';
  const amount = await checkTonDeposit(userId, username);
  if (amount > 0) {
    ctx.reply(`Депозит успешно зачислен: +${amount} TON!`);
  } else {
    ctx.reply('Депозит не найден. Убедитесь, что вы указали свой user id или username в комментарии к переводу и попробуйте позже.');
  }
});

const OWNER_USERNAME = 'DietaryMage868'; // без @

// Команда /db — дешифровщик базы для владельца
bot.command('db', async (ctx: any) => {
  if ((ctx.from?.username || '').toLowerCase() !== OWNER_USERNAME.toLowerCase()) {
    return;
  }
  db.all('SELECT id, username, balance, wins, losses FROM users', [], (err: any, rows: any[]) => {
    if (err) {
      ctx.reply('Ошибка чтения базы');
      return;
    }
    let text = `#  | Ник         | ID         | Баланс | Побед | Пораж\n`;
    text += `---|-------------|------------|--------|-------|------\n`;
    rows.forEach((u, i) => {
      text += `${i+1} | ${u.username || '-'} | ${u.id} | ${u.balance} | ${u.wins} | ${u.losses}\n`;
    });
    ctx.reply('```\n' + text + '```', { parse_mode: 'Markdown' });
  });
});

const PORT = Number(process.env.PORT) || 3000;
const DOMAIN = process.env.RENDER_EXTERNAL_URL;

(async () => {
  initDB();
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Запустить бота' },
    { command: 'balance', description: 'Показать баланс' },
    { command: 'games', description: 'Список игр' },
    { command: 'deposit', description: 'Пополнить баланс' },
    { command: 'checkdeposit', description: 'Проверить депозит' }
  ]);
  if (DOMAIN) {
    await bot.launch({
      webhook: {
        domain: DOMAIN,
        hookPath: '/',
        port: PORT
      }
    });
    console.log(`Bot started in webhook mode on ${DOMAIN}`);
  } else {
    await bot.launch();
    console.log('Bot started in polling mode');
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

/**
 * Генерация отчёта по казино
 */
export async function generateCasinoReport(): Promise<string> {
  const reportPath = path.resolve(__dirname, '../reports/casino_report_' + Date.now() + '.txt');
  const stream = fs.createWriteStream(reportPath, { flags: 'a' });
  stream.write('Отчёт по казино\n\n');

  // Получаем список пользователей и их баланс
  const users = await new Promise<any[]>((resolve) => {
    db.all('SELECT id, username, balance, last_tx FROM users', [], (err: any, rows: any[]) => {
      resolve(rows);
    });
  });

  for (const user of users) {
    let line = `Пользователь: ${user.username || user.id}\nБаланс: ${user.balance} TON`;
    if (user.last_tx) {
      line += `\nПоследний транзакция: ${user.last_tx}`;
    stream.write(line + '\n\n');
  }
 stream.write(line + '\n\n');
  stream.end();  }
  return reportPath;
  stream.end();
  return reportPath;}
