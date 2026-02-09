const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fetch = require('node-fetch');

require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const SETTINGS_FILE = 'bot_settings.json';

// агрузка настроек
async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { apiKeys: {}, models: {}, githubToken: '' };
  }
}

// —охранение настроек
async function saveSettings(settings) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// лавное меню с кнопками
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '?? становить API-ключ', callback_data: 'set_api_key' },
          { text: '?? становить модель', callback_data: 'set_model' }
        ],
        [
          { text: '?? “екуща€ модель', callback_data: 'current_model' },
          { text: '?? GitHub токен', callback_data: 'set_github_token' }
        ],
        [
          { text: '?? —генерировать код', callback_data: 'generate_code' },
          { text: '? омощь', callback_data: 'help' }
        ]
      ]
    }
  };
}

// бработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'ривет! ыбери действие:', mainMenu());
});

// бработка нажатий на кнопки
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'set_api_key') {
    bot.sendMessage(chatId, 'тправь команду: /set_api_key provider api_key');
  } else if (data === 'set_model') {
    bot.sendMessage(chatId, 'тправь команду: /set_model provider model_name');
  } else if (data === 'current_model') {
    bot.sendMessage(chatId, 'тправь команду: /current_model provider');
  } else if (data === 'set_github_token') {
    bot.sendMessage(chatId, 'тправь команду: /set_github_token token');
  } else if (data === 'generate_code') {
    bot.sendMessage(chatId, 'тправь команду: /code описание_проекта');
  } else if (data === 'help') {
    bot.sendMessage(chatId, 
оступные команды:
Х /set_api_key - установить API-ключ
Х /set_model - установить модель
Х /current_model - показать текущую модель
Х /set_github_token - установить GitHub токен
Х /code - сгенерировать и загрузить код
);
  }

  bot.answerCallbackQuery(query.id);
});

// оманда дл€ списка моделей
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

  const message = 'оступные модели:\n\n' + models.map(m => - \).join('\n');

  bot.sendMessage(chatId, message);
});

// становка API-ключа
bot.onText(/\/set_api_key (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [provider, key] = match[1].split(/\s+/);

  if (!provider || !key) {
    bot.sendMessage(chatId, 'ормат: /set_api_key provider api_key');
    return;
  }

  const settings = await loadSettings();
  settings.apiKeys[provider] = key;
  await saveSettings(settings);

  bot.sendMessage(chatId, \API-ключ дл€ \ установлен.\);
});

// становка модели
bot.onText(/\/set_model (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [provider, model] = match[1].split(/\s+/);

  if (!provider || !model) {
    bot.sendMessage(chatId, 'ормат: /set_model provider model_name');
    return;
  }

  const settings = await loadSettings();
  settings.models[provider] = model;
  await saveSettings(settings);

  bot.sendMessage(chatId, \одель дл€ \: \\);
});

// оказ текущей модели
bot.onText(/\/current_model (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1];

  const settings = await loadSettings();
  const model = settings.models[provider];

  if (!model) {
    bot.sendMessage(chatId, \одель дл€ \ не установлена.\);
    return;
  }

  bot.sendMessage(chatId, \“екуща€ модель дл€ \: \\);
});

// становка GitHub токена
bot.onText(/\/set_github_token (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1].trim();

  const settings = await loadSettings();
  settings.githubToken = token;
  await saveSettings(settings);

  bot.sendMessage(chatId, 'GitHub токен установлен.');
});

// енераци€ кода
bot.onText(/\/code (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  const settings = await loadSettings();
  const apiKey = settings.apiKeys['mega'];
  const model = settings.models['mega'];
  const githubToken = settings.githubToken;

  if (!apiKey || !model) {
    bot.sendMessage(chatId, '—начала установите API-ключ и модель: /set_api_key и /set_model');
    return;
  }

  const prompt = \
    —генерируй џ рабочий Telegram-бот на Node.js (JavaScript) дл€: \
    ключи: telegraf, express, axios, dotenv, package.json, Dockerfile дл€ Render, .env.example, README.md.
    од должен запуститьс€ без правок.
  \;

  try {
    const response = await fetch('https://ai.megallm.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \Bearer \\
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(\API ошибка: \ - \\);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error('шибка API: ' + JSON.stringify(data));
    }

    const code = data.choices[0].message.content;

    bot.sendMessage(chatId, 'од сгенерирован. тправл€ю в GitHub...');

    if (githubToken) {
      const repoName = \generated-bot-\\;
      await uploadToGithub(code, repoName, query, githubToken, chatId);
    } else {
      bot.sendMessage(chatId, 'GitHub токен не установлен. од не загружен.');
    }

  } catch (e) {
    bot.sendMessage(chatId, \шибка: \\);
  }
});

// агрузка в GitHub
async function uploadToGithub(code, repoName, description, token, chatId) {
  const owner = 'garmaev-tech';

  try {
    // —оздание репозитори€
    await fetch(\https://api.github.com/user/repos\, {
      method: 'POST',
      headers: {
        'Authorization': \	oken \\,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repoName,
        description: description,
        private: true
      })
    });

    // звлечение файлов из кода (упрощЄнно)
    const files = extractFilesFromCode(code);

    for (const [filename, content] of Object.entries(files)) {
      await fetch(\https://api.github.com/repos/\/\/contents/\\, {
        method: 'PUT',
        headers: {
          'Authorization': \	oken \\,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: \Add \\,
          content: Buffer.from(content).toString('base64')
        })
      });
    }

    bot.sendMessage(chatId, \роект загружен в GitHub: https://github.com/\/\\);

  } catch (e) {
    bot.sendMessage(chatId, \шибка загрузки в GitHub: \\);
  }
}

// звлечение файлов из ответа LLM (упрощЄнно)
function extractFilesFromCode(code) {
  const files = {};

  const patterns = [
    { regex: /javascript\n([\s\S]*?)\n/, name: 'index.js' },
    { regex: /json\n([\s\S]*?)\n/, name: 'package.json' },
    { regex: /dockerfile\n([\s\S]*?)\n/, name: 'Dockerfile' },
    { regex: /markdown\n([\s\S]*?)\n/, name: 'README.md' },
    { regex: /env\n([\s\S]*?)\n/, name: '.env.example' }
  ];

  for (const p of patterns) {
    const match = code.match(p.regex);
    if (match) {
      files[p.name] = match[1];
    }
  }

  return files;
}
