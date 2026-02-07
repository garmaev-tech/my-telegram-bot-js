const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const dotenv = require('dotenv');

// Загружаем .env
dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MEGALLM_API_KEY = process.env.MEGALLM_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Инициализируем бота
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Инициализируем GitHub
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Напиши /generate для генерации Node.js-бота.');
});

// Команда /generate
bot.onText(/\/generate/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Введите описание Node.js-бота:');
    bot.once('message', async (msg) => {
        const description = msg.text;
        await generateAndUpload(chatId, description);
    });
});

// Генерация и загрузка в GitHub
async function generateAndUpload(chatId, desc) {
    try {
        bot.sendMessage(chatId, 'Генерирую код...');

        const prompt = `
Сгенерируй ПОЛНЫЙ рабочий Telegram-бот на Node.js (JavaScript) для: ${desc}
Включи: node-telegram-bot-api, axios, dotenv, package.json, Dockerfile для Render, .env.example, README.md.
Код должен запуститься без правок.
`;

        const response = await axios.post('https://ai.megallm.io/v1/chat/completions', {
            model: 'claude-sonnet-4-5-20250929',
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${MEGALLM_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const generatedText = response.data.choices[0].message.content;

        // Извлекаем файлы
        const files = extractFilesFromResponse(generatedText);

        // Создаём репозиторий
        const repoName = `node-bot-${msg.from.id}-${Date.now()}`;
        const repo = await octokit.repos.createInOrg({
            org:'garmaev-tech',
            name: repoName,
            private: true,
        });

        // Загружаем файлы
        for (const [filename, content] of Object.entries(files)) {
            await octokit.repos.createOrUpdateFileContents({
                owner:'garmaev-tech',
                repo: repoName,
                path: filename,
                message: `Add ${filename}`,
                content: Buffer.from(content).toString('base64'),
            });
        }

        const repoUrl = repo.data.html_url;
        bot.sendMessage(chatId, `Код Node.js-бота загружен в GitHub: ${repoUrl}`);

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `Ошибка: ${error.message}`);
    }
}

function extractFilesFromResponse(text) {
    const files = {};
    const regex = /```(\w+)\n([\s\S]*?)\n```/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const lang = match[1];
        const content = match[2];

        if (lang === 'javascript' || lang === 'js') {
            files['bot.js'] = content;
        } else if (lang === 'json') {
            files['package.json'] = content;
        } else if (lang === 'dockerfile') {
            files['Dockerfile'] = content;
        } else if (lang === 'env') {
            files['.env.example'] = content;
        } else if (lang === 'md') {
            files['README.md'] = content;
        }
    }

    // Если package.json не найден, создаём базовый
    if (!files['package.json']) {
        files['package.json'] = JSON.stringify({
            name: "my-node-telegram-bot",
            version: "1.0.0",
            description: "Generated Node.js Telegram Bot",
            main: "bot.js",
            scripts: {
                start: "node bot.js"
            },
            dependencies: {
                "node-telegram-bot-api": "^0.64.0",
                "axios": "^1.6.0",
                "dotenv": "^16.3.1"
            }
        }, null, 2);
    }

    return files;
}