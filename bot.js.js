const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Команда /start
bot.start((ctx) => {
    ctx.reply('Привет! Напиши /generate для генерации Node.js-бота.');
});

// Команда /generate
bot.command('generate', async (ctx) => {
    await ctx.reply('Введите описание Node.js-бота:');
    bot.on('text', async (ctx) => {
        const description = ctx.message.text;
        await generateAndUpload(ctx, description);
    });
});

// Генерация и загрузка в GitHub
async function generateAndUpload(ctx, desc) {
    const chatId = ctx.chat.id;
    try {
        await ctx.reply('Генерирую код...');

        const prompt = `
Сгенерируй ПОЛНЫЙ рабочий Telegram-бот на Node.js (JavaScript) для: ${desc}
Включи: telegraf, express, axios, dotenv, package.json, Dockerfile для Render, .env.example, README.md.
Код должен запуститься без правок.
`;

        const response = await axios.post('https://ai.megallm.io/v1/chat/completions', {
            model: 'claude-sonnet-4-5-20250929',
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MEGALLM_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const generatedText = response.data.choices[0].message.content;

        const files = extractFilesFromResponse(generatedText);

        const repoName = `node-bot-${ctx.from.id}-${Date.now()}`;
        const repo = await octokit.repos.createInOrg({
            org: 'garmaev-tech',
            name: repoName,
            private: true,
        });

        for (const [filename, content] of Object.entries(files)) {
            await octokit.repos.createOrUpdateFileContents({
                owner: 'garmaev-tech',
                repo: repoName,
                path: filename,
                message: `Add ${filename}`,
                content: Buffer.from(content).toString('base64'),
            });
        }

        const repoUrl = repo.data.html_url;
        await ctx.reply(`Код Node.js-бота загружен в GitHub: ${repoUrl}`);

    } catch (error) {
        console.error(error);
        await ctx.reply(`Ошибка: ${error.message}`);
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
                "telegraf": "^4.16.3",
                "express": "^4.18.2",
                "axios": "^1.6.0",
                "dotenv": "^16.3.1",
                "@octokit/rest": "^20.0.0"
            }
        }, null, 2);
    }

    return files;
}

// Установка webhook
bot.telegram.setWebhook(`https://my-telegram-bot-js.onrender.com`);

// Обработка webhook
app.use('/secret-path', async (req, res) => {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
});

// Проверка, что Render может подключиться
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});