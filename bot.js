const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs').promises;
const fetch = require('node-fetch');

require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });

const app = express();
const PORT = process.env.PORT || 10000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://my-telegram-bot-js.onrender.com/bot`;

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
    const defaultSettings = { 
      apiKeys: {},
      models: {},
      endpoints: {},
      githubToken: '',
      activeProvider: null
    };
    await saveSettings(defaultSettings);
    return defaultSettings;
  }
}

// Сохранение настроек
async function saveSettings(settings) {
  await fs.writeFile('bot_settings.json', JSON.stringify(settings, null, 2));
}

// Конфигурация провайдеров
const PROVIDER_CONFIG = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-3.5-turbo',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    supportsCustomEndpoint: false
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    defaultModel: 'claude-3-haiku-20240307',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    supportsCustomEndpoint: false
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-pro',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    supportsCustomEndpoint: false
  },
  grok: {
    name: 'Grok',
    defaultModel: 'grok-beta',
    defaultEndpoint: 'https://api.grok.com/v1/chat/completions',
    supportsCustomEndpoint: true
  },
  deepseek: {
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    defaultEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    supportsCustomEndpoint: false
  },
  mega: {
    name: 'Mega',
    defaultModel: 'mega-flash',
    defaultEndpoint: 'https://ai.megallm.io/v1/chat/completions',
    supportsCustomEndpoint: true
  },
  llama: {
    name: 'Llama',
    defaultModel: 'llama-3.1-70b',
    defaultEndpoint: 'https://api.llama.ai/v1/chat/completions',
    supportsCustomEndpoint: true
  }
};

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Используй команды:');
});

// Обработка команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `
🤖 *Доступные команды:*

*Основные команды:*
• /start - Показать это сообщение
• /help - Показать это сообщение
• /settings - Текущие настройки
• /list_providers - Список провайдеров
• /list_models - Список моделей
• /select_provider <prov> - Выбрать активного провайдера

*Настройки API:*
• /set_api_key <prov> <key> - Установить API ключ
• /set_model <prov> <model> - Установить модель
• /set_endpoint <prov> <url> - Установить URL (если поддерживается)
• /set_github_token <токен> - Установить GitHub токен

*Генерация:*
• /code <описание проекта> - Сгенерировать и загрузить код

*Примеры:*
• /select_provider mega
• /set_api_key mega sk-...
• /set_model mega gpt-4
• /code "Telegram бот для учета финансов"
  `;

  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Обработка команды /settings
bot.onText(/\/settings/, async (msg) => {
  const chatId = msg.chat.id;

  const settings = await loadSettings();
  let text = '⚙️ *Текущие настройки:*\n\n';

  for (const provider in PROVIDER_CONFIG) {
    const key = settings.apiKeys[provider] ? '✅' : '❌';
    const model = settings.models[provider] || 'не установлена';
    text += `${key} *${PROVIDER_CONFIG[provider].name}:* ${model}\n`;
  }

  text += `\n*GitHub токен:* ${settings.githubToken ? '✅ Установлен' : '❌ Не установлен'}`;
  text += `\n*Активный провайдер:* ${settings.activeProvider ? PROVIDER_CONFIG[settings.activeProvider]?.name || settings.activeProvider : 'не выбран'}`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// Обработка команды /select_provider
bot.onText(/\/select_provider (\S+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1].toLowerCase();

  if (!PROVIDER_CONFIG[provider]) {
    bot.sendMessage(chatId, `❌ Неверный провайдер: ${provider}. Используйте /list_providers для списка.`);
    return;
  }

  const settings = await loadSettings();
  settings.activeProvider = provider;
  await saveSettings(settings);

  bot.sendMessage(chatId, `✅ Активный провайдер: ${PROVIDER_CONFIG[provider].name}`);
});

// Обработка команды /code (теперь использует activeProvider)
bot.onText(/\/code (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  const settings = await loadSettings();

  // Проверяем, установлен ли активный провайдер
  let selectedProvider = settings.activeProvider;

  if (!selectedProvider) {
    bot.sendMessage(chatId, '❌ Не выбран активный провайдер. Используйте /select_provider.');
    return;
  }

  // Проверяем, есть ли у него ключ и модель
  const apiKey = settings.apiKeys[selectedProvider];
  const model = settings.models[selectedProvider];

  if (!apiKey || !model) {
    bot.sendMessage(chatId, `❌ У провайдера "${PROVIDER_CONFIG[selectedProvider].name}" не установлены API-ключ или модель. Используйте /set_api_key и /set_model.`);
    return;
  }

  const githubToken = settings.githubToken;

  const prompt = `
    Сгенерируй ПОЛНЫЙ рабочий Telegram-бот на Node.js (JavaScript) для: ${query}
    Включи: telegraf, express, axios, dotenv, package.json, Dockerfile для Render, .env.example, README.md.
    Код должен запуститься без правок.
  `;

  bot.sendMessage(chatId, `🔄 Генерирую код через ${PROVIDER_CONFIG[selectedProvider].name}... ⏳`);

  try {
    const response = await callProviderAPI(selectedProvider, apiKey, model, prompt);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API ошибка: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    // Для Gemini API ответ отличается
    if (selectedProvider === 'gemini') {
      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Ошибка Gemini API: ' + JSON.stringify(data));
      }
      var code = data.candidates[0].content.parts[0].text;
    } else {
      if (!data.choices || !data.choices[0]?.message?.content) {
        throw new Error('Ошибка API: ' + JSON.stringify(data));
      }
      var code = data.choices[0].message.content;
    }

    bot.sendMessage(chatId, '✅ Код сгенерирован! Отправляю в GitHub...');

    if (githubToken) {
      const repoName = `generated-bot-${msg.from?.id || Date.now()}`;
      await uploadToGithub(code, repoName, query, githubToken, chatId);
    } else {
      bot.sendMessage(chatId, 'ℹ️ GitHub токен не установлен. Отправляю код напрямую...');
      if (code.length > 4096) {
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

// Остальные команды
bot.onText(/\/set_api_key (\S+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1].toLowerCase();
  const key = match[2].trim();

  if (!provider || !key) {
    bot.sendMessage(chatId, 'Формат: /set_api_key provider api_key');
    return;
  }

  if (!PROVIDER_CONFIG[provider]) {
    bot.sendMessage(chatId, `❌ Неверный провайдер: ${provider}. Используйте /list_providers для списка.`);
    return;
  }

  const settings = await loadSettings();
  settings.apiKeys[provider] = key;
  await saveSettings(settings);

  bot.sendMessage(chatId, `✅ API-ключ для ${PROVIDER_CONFIG[provider].name} установлен.`);
});

bot.onText(/\/set_model (\S+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1].toLowerCase();
  const model = match[2].trim();

  if (!provider || !model) {
    bot.sendMessage(chatId, 'Формат: /set_model provider model_name');
    return;
  }

  if (!PROVIDER_CONFIG[provider]) {
    bot.sendMessage(chatId, `❌ Неверный провайдер: ${provider}. Используйте /list_providers для списка.`);
    return;
  }

  const settings = await loadSettings();
  settings.models[provider] = model;
  await saveSettings(settings);

  bot.sendMessage(chatId, `✅ Модель для ${PROVIDER_CONFIG[provider].name}: ${model}`);
});

bot.onText(/\/set_endpoint (\S+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1].toLowerCase();
  const url = match[2].trim();

  if (!provider || !url) {
    bot.sendMessage(chatId, 'Формат: /set_endpoint provider url');
    return;
  }

  if (!PROVIDER_CONFIG[provider]?.supportsCustomEndpoint) {
    bot.sendMessage(chatId, `❌ ${PROVIDER_CONFIG[provider].name} не поддерживает кастомные URL.`);
    return;
  }

  const settings = await loadSettings();
  settings.endpoints[provider] = url;
  await saveSettings(settings);

  bot.sendMessage(chatId, `✅ Эндпоинт для ${PROVIDER_CONFIG[provider].name}: ${url}`);
});

bot.onText(/\/set_github_token (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1].trim();

  if (token.length < 20) {
    bot.sendMessage(chatId, '❌ GitHub токен слишком короткий.');
    return;
  }

  const settings = await loadSettings();
  settings.githubToken = token;
  await saveSettings(settings);

  bot.sendMessage(chatId, '✅ GitHub токен установлен.');
});

// Функция вызова API
async function callProviderAPI(provider, apiKey, model, prompt) {
  const settings = await loadSettings();
  const endpoint = settings.endpoints[provider] || PROVIDER_CONFIG[provider].defaultEndpoint;

  if (provider === 'gemini') {
    return fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });
  } else if (provider === 'anthropic') {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } else {
    // OpenAI-совместимый API
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048
      })
    });
  }
}

// Загрузка в GitHub
async function uploadToGithub(code, repoName, description, token, chatId) {
  const owner = 'garmaev-tech';

  try {
    let repoExists = false;
    try {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
        headers: { 'Authorization': `token ${token}` }
      });
      repoExists = true;
    } catch (e) {}

    if (!repoExists) {
      await fetch(`https://api.github.com/user/repos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `token ${token}` },
        body: JSON.stringify({
          name: repoName,
          description: description,
          private: true
        })
      });
    }

    const files = extractFilesFromCode(code);

    for (const [filename, content] of Object.entries(files)) {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filename}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `token ${token}` },
        body: JSON.stringify({
          message: `Add ${filename}`,
          content: Buffer.from(content).toString('base64')
        })
      });
    }

    bot.sendMessage(chatId, `✅ Проект загружен: https://github.com/${owner}/${repoName}`);
  } catch (e) {
    bot.sendMessage(chatId, `❌ Ошибка GitHub: ${e.message}`);
  }
}

// Извлечение файлов из кода
function extractFilesFromCode(code) {
  const files = {};
  const codeBlocks = code.match(/```(\w+)?\n([\s\S]*?)```/g) || [];

  for (const block of codeBlocks) {
    const match = block.match(/```(\w+)?\n([\s\S]*?)```/);
    if (match) {
      const lang = match[1] || 'txt';
      const content = match[2].trim();
      let filename;
      switch (lang.toLowerCase()) {
        case 'javascript': filename = 'index.js'; break;
        case 'json': filename = 'package.json'; break;
        case 'dockerfile': filename = 'Dockerfile'; break;
        case 'markdown': filename = 'README.md'; break;
        case 'env': filename = '.env.example'; break;
        default: filename = `file.${lang}`;
      }
      files[filename] = content;
    }
  }

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
