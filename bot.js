const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs').promises;
const fetch = require('node-fetch');

require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });

const app = express();
const PORT = process.env.PORT || 10000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://my-telegram-bot-js.onrender.com/bot`; // ✅ Без пробелов

// Middleware для обработки JSON
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Инициализация вебхука при запуске
async function setupWebhook() {
  try {
    await bot.setWebHook(WEBHOOK_URL);
    console.log(`Webhook установлен на: ${WEBHOOK_URL}`);
  } catch (error) {
    console.error('Ошибка установки webhook:', error);
  }
}

// Обработка вебхуков на /bot
app.post('/bot', (req, res) => {
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('Ошибка обработки обновления:', error);
    res.sendStatus(500);
  }
});

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
    // Создаем файл с дефолтными настройками если не существует
    const defaultSettings = { 
      apiKeys: {}, 
      models: {}, 
      githubToken: '' 
    };
    await saveSettings(defaultSettings);
    return defaultSettings;
  }
}

// Сохранение настроек
async function saveSettings(settings) {
  try {
    await fs.writeFile('bot_settings.json', JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
    throw error;
  }
}

// Главное меню с кнопками
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔑 Установить API-ключ', callback_data: 'set_api_key' },
          { text: '⚙️ Установить модель', callback_data: 'set_model' }
        ],
        [
          { text: '📋 Текущая модель', callback_data: 'current_model' },
          { text: '📤 GitHub токен', callback_data: 'set_github_token' }
        ],
        [
          { text: '📝 Сгенерировать код', callback_data: 'generate_code' },
          { text: '❓ Помощь', callback_data: 'help' }
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

  try {
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
• /list_models - список доступных моделей
`);
    }
  } catch (error) {
    console.error('Ошибка обработки callback:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при обработке запроса.');
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

  try {
    const settings = await loadSettings();
    settings.apiKeys[provider] = key;
    await saveSettings(settings);

    bot.sendMessage(chatId, `API-ключ для ${provider} установлен.`);
  } catch (error) {
    console.error('Ошибка установки API-ключа:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при установке API-ключа.');
  }
});

// Установка модели
bot.onText(/\/set_model (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [provider, model] = match[1].split(/\s+/);

  if (!provider || !model) {
    bot.sendMessage(chatId, 'Формат: /set_model provider model_name');
    return;
  }

  try {
    const settings = await loadSettings();
    settings.models[provider] = model;
    await saveSettings(settings);

    bot.sendMessage(chatId, `Модель для ${provider}: ${model}`);
  } catch (error) {
    console.error('Ошибка установки модели:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при установке модели.');
  }
});

// Показ текущей модели
bot.onText(/\/current_model (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1];

  try {
    const settings = await loadSettings();
    const model = settings.models[provider];

    if (!model) {
      bot.sendMessage(chatId, `Модель для ${provider} не установлена.`);
      return;
    }

    bot.sendMessage(chatId, `Текущая модель для ${provider}: ${model}`);
  } catch (error) {
    console.error('Ошибка получения модели:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при получении модели.');
  }
});

// Установка GitHub токена
bot.onText(/\/set_github_token (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1].trim();

  try {
    const settings = await loadSettings();
    settings.githubToken = token;
    await saveSettings(settings);

    bot.sendMessage(chatId, 'GitHub токен установлен.');
  } catch (error) {
    console.error('Ошибка установки GitHub токена:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при установке GitHub токена.');
  }
});

// Генерация кода
bot.onText(/\/code (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  try {
    const settings = await loadSettings();
    const apiKey = settings.apiKeys['mega'];
    const model = settings.models['mega'];
    const githubToken = settings.githubToken;

    if (!apiKey || !model) {
      bot.sendMessage(chatId, 'Сначала установите API-ключ и модель: /set_api_key и /set_model\nПример: /set_api_key mega ваш_api_ключ\n/set_model mega mega-flash');
      return;
    }

    const prompt = `
      Сгенерируй ПОЛНЫЙ рабочий Telegram-бот на Node.js (JavaScript) для: ${query}
      Включи: telegraf, express, axios, dotenv, package.json, Dockerfile для Render, .env.example, README.md.
      Код должен запуститься без правок.
    `;

    bot.sendMessage(chatId, 'Генерирую код... ⏳');

    const response = await fetch('https://ai.megallm.io/v1/chat/completions', { // ✅ Без пробелов
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4000
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

    bot.sendMessage(chatId, '✅ Код сгенерирован! Отправляю в GitHub...');

    if (githubToken) {
      const repoName = `generated-bot-${msg.from?.id || Date.now()}`;
      await uploadToGithub(code, repoName, query, githubToken, chatId);
    } else {
      // Отправляем код напрямую если нет GitHub токена
      bot.sendMessage(chatId, 'GitHub токен не установлен. Отправляю код напрямую...');
      if (code.length > 4096) {
        // Разбиваем на части если код слишком длинный
        const parts = code.match(/[\s\S]{1,4000}/g);
        for (let i = 0; i < parts.length; i++) {
          await bot.sendMessage(chatId, `Часть ${i + 1}:\n\`\`\`javascript\n${parts[i]}\n\`\`\``, { parse_mode: 'Markdown' });
        }
      } else {
        await bot.sendMessage(chatId, `\`\`\`javascript\n${code}\n\`\`\``, { parse_mode: 'Markdown' });
      }
    }

  } catch (e) {
    console.error('Ошибка генерации кода:', e);
    bot.sendMessage(chatId, `❌ Ошибка: ${e.message}`);
  }
});

// Загрузка в GitHub
async function uploadToGithub(code, repoName, description, token, chatId) {
  const owner = 'garmaev-tech';

  try {
    // Проверяем существование репозитория
    let repoExists = false;
    try {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}`, { // ✅ Без пробелов
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      repoExists = true;
    } catch (error) {
      // Репозитория не существует, создаем новый
    }

    if (!repoExists) {
      // Создание репозитория
      const createRepoResponse = await fetch(`https://api.github.com/user/repos`, { // ✅ Без пробелов
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          name: repoName,
          description: description,
          private: true,
          auto_init: false
        })
      });

      if (!createRepoResponse.ok) {
        throw new Error(`Ошибка создания репозитория: ${createRepoResponse.status}`);
      }
    }

    // Извлечение файлов из кода
    const files = extractFilesFromCode(code);

    if (Object.keys(files).length === 0) {
      throw new Error('Не удалось извлечь файлы из сгенерированного кода');
    }

    // Загружаем файлы
    for (const [filename, content] of Object.entries(files)) {
      const uploadResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filename}`, { // ✅ Без пробелов
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: `Add ${filename}`,
          content: Buffer.from(content).toString('base64')
        })
      });

      if (!uploadResponse.ok) {
        console.error(`Ошибка загрузки ${filename}:`, await uploadResponse.text());
      }
    }

    bot.sendMessage(chatId, `✅ Проект успешно загружен в GitHub!\nСсылка: https://github.com/${owner}/${repoName}`); // ✅ Без пробелов

  } catch (e) {
    console.error('Ошибка загрузки в GitHub:', e);
    throw new Error(`GitHub: ${e.message}`);
  }
}

// Извлечение файлов из ответа LLM
function extractFilesFromCode(code) {
  const files = {};

  // Ищем блоки кода с указанием языка
  const codeBlocks = code.match(/```(\w+)?\n([\s\S]*?)```/g) || [];

  for (const block of codeBlocks) {
    const match = block.match(/```(\w+)?\n([\s\S]*?)```/);
    if (match) {
      const lang = match[1] || 'txt';
      const content = match[2].trim();
      
      let filename;
      switch (lang.toLowerCase()) {
        case 'javascript':
        case 'js':
          filename = 'index.js';
          break;
        case 'json':
          filename = 'package.json';
          break;
        case 'dockerfile':
          filename = 'Dockerfile';
          break;
        case 'markdown':
          filename = 'README.md';
          break;
        case 'env':
          filename = '.env.example';
          break;
        default:
          filename = `file.${lang}`;
      }
      
      files[filename] = content;
    }
  }

  // Если блоки кода не найдены, сохраняем весь текст как index.js
  if (Object.keys(files).length === 0 && code.trim()) {
    files['index.js'] = code.trim();
  }

  return files;
}

// Запуск сервера
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await setupWebhook();
});

// Обработка ошибок
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});


