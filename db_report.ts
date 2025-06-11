import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(__dirname, './casino.db');
const db = new sqlite3.Database(dbPath);

function formatDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function main() {
  let report = '';

  db.all('SELECT * FROM users', (err, users) => {
    if (err) {
      console.error('Ошибка чтения users:', err);
      return;
    }
    report += `Пользователи:\n`;
    users.forEach((u: any) => {
      report += `ID: ${u.id}, Username: ${u.username}, Баланс: ${u.balance}, Последний TX: ${u.last_tx}\n`;
    });

    db.all('SELECT * FROM deposits ORDER BY timestamp DESC', (err2, deposits) => {
      if (err2) {
        console.error('Ошибка чтения deposits:', err2);
        return;
      }
      report += `\nДепозиты:\n`;
      deposits.forEach((d: any) => {
        report += `TX: ${d.tx_hash}\n  UserID: ${d.user_id}\n  Username: ${d.username}\n  Сумма: ${d.amount} TON\n  Время: ${formatDate(d.timestamp)}\n`;
      });

      fs.writeFileSync('casino_report.txt', report, 'utf-8');
      console.log('casino_report.txt создан!');
      db.close();
    });
  });
}

main();