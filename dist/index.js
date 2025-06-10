"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Основной файл Telegram-казино-бота
const telegraf_1 = require("telegraf");
const path_1 = __importDefault(require("path"));
const games_1 = require("./games");
const axios_1 = __importDefault(require("axios"));
const BOT_TOKEN = "7725310107:AAEzkOaYJYc-TpUV-VxR__LRnIe_4zbZjVU";
const TON_DEPOSIT_ADDRESS = "UQDOSJdPi0iGP0638uZ6hflv45FbMveyYvw36rhuKmO-Fptd"; // Ваш TON-кошелек для депозита
const TON_WALLET = "UQDOSJdPi0iGP0638uZ6hflv45FbMveyYvw36rhuKmO-Fptd"; // Ваш TON-адрес для проверки
const TONAPI_KEY = "ВАШ_TONAPI_KEY"; // Получите на https://tonapi.io
const bot = new telegraf_1.Telegraf(BOT_TOKEN);
const dbPath = path_1.default.resolve(__dirname, "../casino.db");
const sqlite3 = require("sqlite3").verbose();
let db = new sqlite3.Database(dbPath);
function initDB() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    balance REAL DEFAULT 0,
    last_tx TEXT
  )`);
}
bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "";
    db.run("INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)", [
        userId,
        username,
    ]);
    ctx.reply("Добро пожаловать в казино!\n/deposit — пополнить баланс TON\n/balance — узнать баланс\n/games — список игр");
});
bot.command("deposit", (ctx) => {
    ctx.reply(`Для пополнения баланса переведите TON на адрес:\n${TON_DEPOSIT_ADDRESS}\n\nВ комментарии к переводу укажите свой Telegram username или user id. После перевода используйте /checkdeposit для зачисления.`);
});
bot.command("balance", (ctx) => {
    const userId = ctx.from?.id;
    db.get("SELECT balance FROM users WHERE id = ?", [userId], (err, row) => {
        ctx.reply(`Ваш баланс: ${row?.balance ?? 0} TON`);
    });
});
bot.command("games", (ctx) => {
    ctx.reply("Доступные игры:\n🎲 /evenodd — чёт/нечёт\n🎲 /number — угадай число 1-6");
});
bot.command("evenodd", (ctx) => (0, games_1.evenOddGame)(ctx, db));
bot.command("number", (ctx) => (0, games_1.numberGame)(ctx, db));
bot.command("myid", (ctx) => {
    ctx.reply(`Ваш user id: ${ctx.from?.id}`);
});
// Обработка нажатий на кнопки для even/odd и number
bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery.data;
    if (data === "even" || data === "odd") {
        // Кидаем кость в чат через replyWithDice (гарантированно работает в приватных и группах)
        const diceMsg = await ctx.replyWithDice("🎲");
        setTimeout(() => {
            const dice = diceMsg.dice.value;
            const diceEmojis = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
            const isEven = dice % 2 === 0;
            const win = (isEven && data === "even") || (!isEven && data === "odd");
            if (win) {
                db.run("UPDATE users SET balance = balance * 1.5 WHERE id = ?", [
                    userId,
                ]);
                ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nПоздравляем! Вы выиграли x1.5 от баланса!`);
            }
            else {
                ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nУвы, не угадали.`);
            }
        }, 3000);
    }
    if (data && data.startsWith("num_")) {
        const userNum = parseInt(data.replace("num_", ""));
        const diceMsg = await ctx.replyWithDice("🎲");
        setTimeout(() => {
            const dice = diceMsg.dice.value;
            const diceEmojis = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
            if (userNum === dice) {
                db.run("UPDATE users SET balance = balance * 3 WHERE id = ?", [userId]);
                ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nПоздравляем! Вы выиграли x3 от баланса!`);
            }
            else {
                ctx.reply(`${diceEmojis[dice - 1]} (${dice})\nУвы, не угадали.`);
            }
        }, 3000);
    }
    ctx.answerCbQuery();
});
// Обработка выбора ставки и исхода для even/odd и number
bot.action(/bet_\d+/, (ctx) => {
    const bet = parseInt(ctx.match[0].replace("bet_", ""));
    require("./games").handleEvenOddBet(ctx, db, bet);
    ctx.answerCbQuery();
});
bot.action(/betn_\d+/, (ctx) => {
    const bet = parseInt(ctx.match[0].replace("betn_", ""));
    require("./games").handleNumberBet(ctx, db, bet);
    ctx.answerCbQuery();
});
// Обработка выбора чёт/нечёт и числа
bot.action(["even", "odd"], (ctx) => {
    require("./games").handleEvenOddResult(ctx, db, ctx.match[0]);
    ctx.answerCbQuery();
});
bot.action(/num_\d+/, (ctx) => {
    const num = parseInt(ctx.match[0].replace("num_", ""));
    require("./games").handleNumberResult(ctx, db, num);
    ctx.answerCbQuery();
});
async function checkTonDeposit(userId, username) {
    // Получаем последние входящие транзакции
    const url = `https://tonapi.io/v2/blockchain/accounts/${TON_WALLET}/transactions?limit=20`;
    const res = await axios_1.default.get(url, {
        headers: { Authorization: `Bearer ${TONAPI_KEY}` },
    });
    const txs = res.data.transactions;
    // Ищем перевод с userId или username в payload (комментарии)
    for (const tx of txs) {
        if (tx.in_msg &&
            tx.in_msg.comment &&
            (tx.in_msg.comment.includes(userId.toString()) ||
                (username && tx.in_msg.comment.includes(username)))) {
            // Проверяем, не был ли уже зачислен этот tx
            const exists = await new Promise((resolve) => {
                db.get("SELECT 1 FROM users WHERE id = ? AND last_tx = ?", [userId, tx.hash], (err, row) => resolve(!!row));
            });
            if (!exists) {
                // Зачисляем сумму (TON приходит в nanoTON)
                const amount = tx.in_msg.value / 1e9;
                db.run("UPDATE users SET balance = balance + ?, last_tx = ? WHERE id = ?", [amount, tx.hash, userId]);
                return amount;
            }
        }
    }
    return 0;
}
bot.command("checkdeposit", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "";
    const amount = await checkTonDeposit(userId, username);
    if (amount > 0) {
        ctx.reply(`Депозит успешно зачислен: +${amount} TON!`);
    }
    else {
        ctx.reply("Депозит не найден. Убедитесь, что вы указали свой user id или username в комментарии к переводу и попробуйте позже.");
    }
});
(async () => {
    initDB();
    // Добавляем меню команд для Telegram
    await bot.telegram.setMyCommands([
        { command: "start", description: "Запустить бота" },
        { command: "balance", description: "Показать баланс" },
        { command: "games", description: "Список игр" },
        { command: "deposit", description: "Пополнить баланс" },
        { command: "checkdeposit", description: "Проверить депозит" },
        { command: "myid", description: "Показать user id" },
    ]);
    bot.launch();
    console.log("Bot started");
})();
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
