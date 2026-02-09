

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs').promises;
const fetch = require('node-fetch');

require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { webhook: true });

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware для вебхуков
app.use('/bot', bot.webHookCallback('/'));

// Для теста — если перейти на /
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// Загрузка настроек
async function loadSettings() {
  try {
    const data = await fs.readFile('bot_settings.json', 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { apiKeys: {}, models: {}, githubToken: '' };
  }
}

// Сохранение настроек
async function saveSettings(settings) {
  await fs.writeFile('bot_settings.json', JSON.stringify(settings, null, 2));
}

// Главное меню с кнопками
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔑 Установить API-ключ', callback_ 'set_api_key' },
          { text: '⚙️ Установить модель', callback_ 'set_model' }
        ],
        [
          { text: '📋 Текущая модель', callback_ 'current_model' },
          { text: '📤 GitHub токен', callback_data: 'set_github_token' }
        ],
        [
          { text: '📝 Сгенерировать код', callback_ 'generate_code' },
          { text: '❓ Помощь', callback_ 'help' }
        ]
      ]
    }
  };
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Выбери действие:', mainMenu());
});

// Обработка нажатий на кнопки
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'set_api_key') {
    bot.sendMessage(chatId, 'Отправь команду: /set_api_key provider api_key');
  } else if (data === 'set_model') {
    bot.sendMessage(chatId, 'Отправь команду: /set_model provider model_name');
  } else if (data === 'current_model') {
    bot.sendMessage(chatId, 'Отправь команду: /current_model provider');
  } else if (data === 'set_github_token') {
    bot.sendMessage(chatId, 'Отправь команду: /set_github_token token');
  } else if (data === 'generate_code') {
    bot.sendMessage(chatId, 'Отправь команду: /code описание_проекта');
  } else if (data === 'help') {
    bot.sendMessage(chatId, `
Доступные команды:
• /set_api_key - установить API-ключ
• /set_model - установить модель
• /current_model - показать текущую модель
• /set_github_token - установить GitHub токен
• /code - сгенерировать и загрузить код
`);
  }

  bot.answerCallbackQuery(query.id);
});

// Команда для списка моделей
bot.onText(/\/list_models/, async (msg) => {
  const chatId = msg.chat.id;

  const models = [
    'gpt-3.5-turbo',
    'gpt-4o-mini',
    'gpt-4o',
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251001',
    'mega-flash'
  ];

  const message = 'Доступные модели:\n\n' + models.map(m => `- ${m}`).join('\n');

  bot.sendMessage(chatId, message);
});

// Установка API-ключа
bot.onText(/\/set_api_key (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [provider, key] = match[1].split(/\s+/);

  if (!provider || !key) {
    bot.sendMessage(chatId, 'Формат: /set_api_key provider api_key');
    return;
  }

  const settings = await loadSettings();
  settings.apiKeys[provider] = key;
  await saveSettings(settings);

  bot.sendMessage(chatId, `API-ключ для ${provider} установлен.`);
});

// Установка модели
bot.onText(/\/set_model (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [provider, model] = match[1].split(/\s+/);

  if (!provider || !model) {
    bot.sendMessage(chatId, 'Формат: /set_model provider model_name');
    return;
  }

  const settings = await loadSettings();
  settings.models[provider] = model;
  await saveSettings(settings);

  bot.sendMessage(chatId, `Модель для ${provider}: ${model}`);
});

// Показ текущей модели
bot.onText(/\/current_model (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1];

  const settings = await loadSettings();
  const model = settings.models[provider];

  if (!model) {
    bot.sendMessage(chatId, `Модель для ${provider} не установлена.`);
    return;
  }

  bot.sendMessage(chatId, `Текущая модель для ${provider}: ${model}`);
});

// Установка GitHub токена
bot.onText(/\/set_github_token (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1].trim();

  const settings = await loadSettings();
  settings.githubToken = token;
  await saveSettings(settings);

  bot.sendMessage(chatId, 'GitHub токен установлен.');
});

// Генерация кода
bot.onText(/\/code (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  const settings = await loadSettings();
  const apiKey = settings.apiKeys['mega'];
  const model = settings.models['mega'];
  const githubToken = settings.githubToken;

  if (!apiKey || !model) {
    bot.sendMessage(chatId, 'Сначала установите API-ключ и модель: /set_api_key и /set_model');
    return;
  }

  const prompt = `
    Сгенерируй ПОЛНЫЙ рабочий Telegram-бот на Node.js (JavaScript) для: ${query}
    Включи: telegraf, express, axios, dotenv, package.json, Dockerfile для Render, .env.example, README.md.
    Код должен запуститься без правок.
  `;

  try {
    const response = await fetch('https://ai.megallm.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API ошибка: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error('Ошибка API: ' + JSON.stringify(data));
    }

    const code = data.choices[0].message.content;

    bot.sendMessage(chatId, 'Код сгенерирован. Отправляю в GitHub...');

    if (githubToken) {
      const repoName = `generated-bot-${msg.from?.id || Date.now()}`;
      await uploadToGithub(code, repoName, query, githubToken, chatId);
    } else {
      bot.sendMessage(chatId, 'GitHub токен не установлен. Код не загружен.');
    }

  } catch (e) {
    bot.sendMessage(chatId, `Ошибка: ${e.message}`);
  }
});

// Загрузка в GitHub
async function uploadToGithub(code, repoName, description, token, chatId) {
  const owner = 'garmaev-tech';

  try {
    // Создание репозитория
    await fetch(`https://api.github.com/user/repos`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repoName,
        description: description,
        private: true
      })
    });

    // Извлечение файлов из кода (упрощённо)
    const files = extractFilesFromCode(code);

    for (const [filename, content] of Object.entries(files)) {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filename}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Add ${filename}`,
          content: Buffer.from(content).toString('base64')
        })
      });
    }

    bot.sendMessage(chatId, `Проект загружен в GitHub: https://github.com/${owner}/${repoName}`);

  } catch (e) {
    bot.sendMessage(chatId, `Ошибка загрузки в GitHub: ${e.message}`);
  }
}

// Извлечение файлов из ответа LLM (упрощённо)
function extractFilesFromCode(code) {
  const files = {};

  const patterns = [
    { regex: /```javascript\n([\s\S]*?)\n```/, name: 'index.js' },
    { regex: /```json\n([\s\S]*?)\n```/, name: 'package.json' },
    { regex: /```dockerfile\n([\s\S]*?)\n```/, name: 'Dockerfile' },
    { regex: /```markdown\n([\s\S]*?)\n```/, name: 'README.md' },
    { regex: /```env\n([\s\S]*?)\n```/, name: '.env.example' }
  ];

  for (const p of patterns) {
    const match = code.match(p.regex);
    if (match) {
      files[p.name] = match[1];
    }
  }

  return files;
}

// Привязка к порту
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
